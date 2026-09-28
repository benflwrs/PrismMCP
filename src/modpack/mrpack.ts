import fs from "node:fs/promises";
import path from "node:path";
import AdmZip from "adm-zip";
import { createHash } from "node:crypto";
import { PrismConfig } from "../config.js";
import { minecraftDir, modsDir } from "../instance/paths.js";
import { createInstance, instanceExists } from "../instance/instanceManager.js";
import { KnownLoader } from "../instance/mmcPack.js";
import { listInstalledMods } from "../mods/modManager.js";
/** modrinth.index.json shape — see https://docs.modrinth.com/modpacks/format */
export interface MrpackIndex {
  formatVersion: 1;
  game: "minecraft";
  versionId: string;
  name: string;
  summary?: string;
  files: {
    path: string;
    hashes: { sha1: string; sha512: string };
    env?: { client: "required" | "optional" | "unsupported"; server: "required" | "optional" | "unsupported" };
    downloads: string[];
    fileSize: number;
  }[];
  dependencies: Record<string, string>; // minecraft / forge / neoforge / fabric-loader / quilt-loader
}

const LOADER_DEP_KEY: Record<Exclude<KnownLoader, "vanilla">, string> = {
  fabric: "fabric-loader",
  forge: "forge",
  neoforge: "neoforge",
  quilt: "quilt-loader",
};

function loaderFromDeps(deps: Record<string, string>): { loader: KnownLoader; loaderVersion?: string } {
  for (const [loader, key] of Object.entries(LOADER_DEP_KEY) as [Exclude<KnownLoader, "vanilla">, string][]) {
    if (deps[key]) return { loader, loaderVersion: deps[key] };
  }
  return { loader: "vanilla" };
}

async function downloadFile(url: string, destPath: string): Promise<void> {
  const res = await fetch(url, { headers: { "User-Agent": "PrismMCP/0.1.0" } });
  if (!res.ok) throw new Error(`Download failed ${res.status} ${res.statusText}: ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  await fs.writeFile(destPath, buf);
}

/**
 * Imports a .mrpack file into a brand new PrismLauncher instance:
 * creates the instance shell (correct loader/MC version), extracts overrides/,
 * and downloads every file entry into place, respecting client/server env flags.
 */
export async function importMrpack(
  cfg: PrismConfig,
  mrpackPath: string,
  instanceId: string,
  opts: { side?: "client" | "server" } = {}
): Promise<{ instanceId: string; installedFiles: number; skippedServerOnly: number }> {
  const side = opts.side ?? "client";
  if (await instanceExists(cfg, instanceId)) {
    throw new Error(`Instance '${instanceId}' already exists`);
  }

  const zip = new AdmZip(mrpackPath);
  const indexEntry = zip.getEntry("modrinth.index.json");
  if (!indexEntry) throw new Error(".mrpack file is missing modrinth.index.json");
  const index: MrpackIndex = JSON.parse(zip.readAsText(indexEntry));

  const mcVersion = index.dependencies.minecraft;
  if (!mcVersion) throw new Error("modrinth.index.json missing minecraft dependency version");
  const { loader, loaderVersion } = loaderFromDeps(index.dependencies);

  await createInstance(cfg, {
    instanceId,
    name: index.name,
    minecraftVersion: mcVersion,
    loader,
    loaderVersion,
  });

  const mcDir = minecraftDir(cfg, instanceId);

  // Extract "overrides/" (and side-specific overrides) into the instance's .minecraft dir.
  for (const entry of zip.getEntries()) {
    const isClientOverride = entry.entryName.startsWith("client-overrides/");
    const isServerOverride = entry.entryName.startsWith("server-overrides/");
    const isGeneralOverride = entry.entryName.startsWith("overrides/");
    if (entry.isDirectory) continue;

    let relative: string | null = null;
    if (isGeneralOverride) relative = entry.entryName.slice("overrides/".length);
    else if (isClientOverride && side === "client") relative = entry.entryName.slice("client-overrides/".length);
    else if (isServerOverride && side === "server") relative = entry.entryName.slice("server-overrides/".length);
    if (!relative) continue;

    const destPath = path.join(mcDir, relative);
    await fs.mkdir(path.dirname(destPath), { recursive: true });
    await fs.writeFile(destPath, entry.getData());
  }

  let installedFiles = 0;
  let skippedServerOnly = 0;

  for (const file of index.files) {
    const envForSide = side === "client" ? file.env?.client : file.env?.server;
    if (envForSide === "unsupported") {
      skippedServerOnly++;
      continue;
    }
    const destPath = path.join(mcDir, file.path);
    const url = file.downloads[0];
    await downloadFile(url, destPath);
    installedFiles++;
  }

  return { instanceId, installedFiles, skippedServerOnly };
}

/**
 * Exports an existing instance's mods/ folder as a .mrpack, tagged client/server
 * per Modrinth metadata (falls back to "required" on both if unknown, since we
 * can't always tell without a Modrinth project match).
 */
export async function exportMrpack(
  cfg: PrismConfig,
  instanceId: string,
  outPath: string,
  packName: string,
  minecraftVersion: string,
  loader: KnownLoader,
  loaderVersion: string | undefined
): Promise<{ outPath: string; fileCount: number }> {
  const mods = await listInstalledMods(cfg, instanceId);
  const dir = modsDir(cfg, instanceId);

  const files: MrpackIndex["files"] = [];
  for (const mod of mods) {
    if (!mod.enabled) continue;
    const filePath = path.join(dir, mod.fileName);
    const buf = await fs.readFile(filePath);
    const sha1 = createHash("sha1").update(buf).digest("hex");
    const sha512 = createHash("sha512").update(buf).digest("hex");
    files.push({
      path: `mods/${mod.fileName}`,
      hashes: { sha1, sha512 },
      downloads: [], // local export: no CDN URL known; consumer must keep files alongside index or re-resolve via Modrinth
      fileSize: buf.length,
    });
  }

  const deps: Record<string, string> = { minecraft: minecraftVersion };
  if (loader !== "vanilla" && loaderVersion) {
    deps[LOADER_DEP_KEY[loader]] = loaderVersion;
  }

  const index: MrpackIndex = {
    formatVersion: 1,
    game: "minecraft",
    versionId: "1.0.0",
    name: packName,
    files,
    dependencies: deps,
  };

  const zip = new AdmZip();
  zip.addFile("modrinth.index.json", Buffer.from(JSON.stringify(index, null, 2)));
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  zip.writeZip(outPath);

  return { outPath, fileCount: files.length };
}
