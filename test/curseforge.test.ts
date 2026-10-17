import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import AdmZip from "adm-zip";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import {
  buildStagingManifest,
  parseCurseForgeRef,
  pickBestFile,
  startStagedInstall,
  finishStagedInstall,
} from "../src/curseforge/stagedInstall.js";
import { createInstance } from "../src/instance/instanceManager.js";
import { modsDir } from "../src/instance/paths.js";
import type { PrismConfig } from "../src/config.js";

const target = { id: "pack", name: "pack", loader: "neoforge" as const, minecraftVersion: "1.21.1", loaderVersion: "21.1.77" };

describe("buildStagingManifest", () => {
  it("writes a Prism-loadable CurseForge manifest", () => {
    const m = buildStagingManifest(target, "PrismMCP-staging-1", [{ projectId: 1523676, fileId: 8265245 }]) as any;
    expect(m.manifestType).toBe("minecraftModpack");
    expect(m.manifestVersion).toBe(1);
    expect(m.minecraft).toEqual({ version: "1.21.1", modLoaders: [{ id: "neoforge-21.1.77", primary: true }] });
    expect(m.files).toEqual([{ projectID: 1523676, fileID: 8265245, required: true }]);
  });
  it("refuses vanilla / unknown loader version", () => {
    expect(() => buildStagingManifest({ ...target, loader: "vanilla" }, "x", [{ projectId: 1, fileId: 2 }])).toThrow();
    expect(() => buildStagingManifest({ ...target, loaderVersion: undefined }, "x", [{ projectId: 1, fileId: 2 }])).toThrow();
  });
});

describe("parseCurseForgeRef / pickBestFile", () => {
  it("parses URLs and slugs", () => {
    expect(parseCurseForgeRef("https://www.curseforge.com/minecraft/mc-mods/create-kinetic-grip/files/8046930")).toEqual({ slug: "create-kinetic-grip", fileId: 8046930 });
    expect(parseCurseForgeRef("https://curseforge.com/minecraft/mc-mods/create-more-features")).toEqual({ slug: "create-more-features", fileId: undefined });
    expect(parseCurseForgeRef("create-new-furnitures")).toEqual({ slug: "create-new-furnitures" });
  });
  it("picks newest release for MC version + loader", () => {
    const files = [
      { id: 1, name: "a", type: "release", versions: ["1.20.1", "Forge"], uploaded_at: "2026-05-01" },
      { id: 2, name: "b", type: "beta", versions: ["1.21.1", "NeoForge"], uploaded_at: "2026-06-01" },
      { id: 3, name: "c", type: "release", versions: ["1.21.1", "NeoForge"], uploaded_at: "2026-04-01" },
      { id: 4, name: "d", type: "release", versions: ["1.21.1", "NeoForge"], uploaded_at: "2026-03-01" },
    ];
    expect(pickBestFile(files, "1.21.1", "neoforge")?.id).toBe(3);
    expect(pickBestFile(files, "1.20.1", "neoforge")).toBeUndefined();
  });
});

describe("staged install (fake Prism)", () => {
  let dir: string;
  let cfg: PrismConfig;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "prismmcp-cftest-"));
    // Fake prismlauncher: on --import <zip>, read its manifest and create a staging
    // instance named after the pack, with one jar per listed file (+ .index metadata).
    const fake = path.join(dir, "fake-prism.mjs");
    await fs.writeFile(
      fake,
      `#!/usr/bin/env node
import fs from "node:fs"; import path from "node:path"; import AdmZip from ${JSON.stringify(pathToFileURL(createRequire(import.meta.url).resolve("adm-zip")).href)};
const a = process.argv.slice(2); const data = a[a.indexOf("--dir")+1]; const zip = a[a.indexOf("--import")+1];
const m = JSON.parse(new AdmZip(zip).readAsText("manifest.json"));
setTimeout(() => {
  const root = path.join(data, "instances", m.name.replace(/[^A-Za-z0-9-]/g, ""));
  fs.mkdirSync(path.join(root, ".minecraft", "mods", ".index"), { recursive: true });
  fs.writeFileSync(path.join(root, "instance.cfg"), "[General]\\nname=" + m.name + "\\n");
  for (const f of m.files) {
    fs.writeFileSync(path.join(root, ".minecraft", "mods", "cf-" + f.fileID + ".jar"), "jar");
    fs.writeFileSync(path.join(root, ".minecraft", "mods", ".index", "cf-" + f.fileID + ".pw.toml"), "x");
  }
}, 300);
`
    );
    await fs.chmod(fake, 0o755);
    cfg = { dataDir: path.join(dir, "data"), executable: fake };
    await createInstance(cfg, { instanceId: "pack", minecraftVersion: "1.21.1", loader: "neoforge", loaderVersion: "21.1.77" });
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("imports via Prism, moves jars + metadata into target, deletes staging", async () => {
    const res = await startStagedInstall(cfg, "pack", [{ projectId: 1, fileId: 111, source: "explicit" }, { projectId: 2, fileId: 222, source: "explicit" }], 10, 200);
    expect(res.status).toBe("done");
    expect(res.movedFiles?.sort()).toEqual(["cf-111.jar", "cf-222.jar"]);
    const mods = await fs.readdir(modsDir(cfg, "pack"));
    expect(mods).toContain("cf-111.jar");
    expect(await fs.readdir(path.join(modsDir(cfg, "pack"), ".index"))).toContain("cf-222.pw.toml");
    const instances = await fs.readdir(path.join(cfg.dataDir, "instances"));
    expect(instances).toEqual(["pack"]);
  });

  it("returns waiting when the user hasn't confirmed yet", async () => {
    const res = await finishStagedInstall(cfg, "pack", "PrismMCP-staging-nope");
    expect(res.status).toBe("waiting");
  });
});

// keep AdmZip import used (fake script resolves it by path)
void AdmZip;
