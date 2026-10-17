import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import AdmZip from "adm-zip";
import { PrismConfig, instancesDir } from "../config.js";
import { getInstance, InstanceSummary } from "../instance/instanceManager.js";
import { readInstanceCfg } from "../instance/instanceCfg.js";
import { modsDir, instanceRoot } from "../instance/paths.js";
import { importResource } from "../launcher/cli.js";

/**
 * Installs individual CurseForge mods into an existing instance WITHOUT PrismMCP
 * ever talking to CurseForge's API or CDN itself.
 *
 * How: we write a tiny CurseForge-format modpack zip (manifest.json listing just
 * the wanted projectID/fileID pairs, same MC version + loader as the target) and
 * hand it to `prismlauncher --import`. Prism creates a throwaway "staging"
 * instance, downloading the jars with its own registered CurseForge access —
 * exactly what its "Add mods → CurseForge" screen does. Mods whose authors
 * disabled third-party downloads trigger Prism's normal "download manually"
 * dialog; we never bypass that. Once the staging instance appears we move its
 * jars (plus Prism's .index metadata, so Prism still tracks updates) into the
 * target instance and delete the staging instance.
 *
 * The user has to click OK in Prism's import dialog (Prism always confirms
 * imports), so the tool waits for that and then finishes automatically.
 */

export interface CurseForgeFileRef {
  projectId: number;
  fileId: number;
}

export interface ResolvedCurseForgeFile extends CurseForgeFileRef {
  title?: string;
  fileName?: string;
  source: "explicit" | "cfwidget";
}

const STAGING_PREFIX = "PrismMCP-staging-";

/** Prism's manifest loader id, e.g. "neoforge-21.1.77", "forge-47.3.0", "fabric-0.16.9". */
export function manifestLoaderId(target: InstanceSummary): string {
  if (target.loader === "vanilla") throw new Error("Target instance has no mod loader — CurseForge mods need forge/neoforge/fabric/quilt.");
  if (!target.loaderVersion) throw new Error(`Target instance '${target.id}' has no recorded ${target.loader} version in mmc-pack.json.`);
  return `${target.loader}-${target.loaderVersion}`;
}

export function buildStagingManifest(target: InstanceSummary, stagingName: string, files: CurseForgeFileRef[]): object {
  if (!target.minecraftVersion) throw new Error(`Target instance '${target.id}' has no Minecraft version.`);
  if (files.length === 0) throw new Error("No CurseForge files to install.");
  return {
    minecraft: {
      version: target.minecraftVersion,
      modLoaders: [{ id: manifestLoaderId(target), primary: true }],
    },
    manifestType: "minecraftModpack",
    manifestVersion: 1,
    name: stagingName,
    version: "1",
    author: "PrismMCP",
    files: files.map((f) => ({ projectID: f.projectId, fileID: f.fileId, required: true })),
    overrides: "overrides",
  };
}

export async function writeStagingZip(manifest: object, stagingName: string): Promise<string> {
  const zip = new AdmZip();
  zip.addFile("manifest.json", Buffer.from(JSON.stringify(manifest, null, 2), "utf-8"));
  zip.addFile("overrides/", Buffer.alloc(0));
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "prismmcp-cf-"));
  const out = path.join(dir, `${stagingName}.zip`);
  zip.writeZip(out);
  return out;
}

const LOADER_TAG: Record<string, string> = { forge: "Forge", neoforge: "NeoForge", fabric: "Fabric", quilt: "Quilt" };

interface CfWidgetFile {
  id: number;
  name: string;
  type: string;
  versions: string[];
  uploaded_at: string;
}

/** Extracts a CurseForge mod slug and optional file id from a URL, or passes a bare slug through. */
export function parseCurseForgeRef(ref: string): { slug: string; fileId?: number } {
  const m = ref.match(/curseforge\.com\/minecraft\/mc-mods\/([^/?#]+)(?:\/files\/(\d+))?/i);
  if (m) return { slug: m[1], fileId: m[2] ? Number(m[2]) : undefined };
  if (/^[a-z0-9-_]+$/i.test(ref)) return { slug: ref };
  throw new Error(`Not a CurseForge mod URL or slug: ${ref}`);
}

/** Picks the newest file matching MC version + loader (release > beta > alpha). */
export function pickBestFile(files: CfWidgetFile[], minecraftVersion: string, loader: string): CfWidgetFile | undefined {
  const tag = LOADER_TAG[loader];
  const rank: Record<string, number> = { release: 0, beta: 1, alpha: 2 };
  return files
    .filter((f) => f.versions.includes(minecraftVersion) && (!tag || f.versions.includes(tag)))
    .sort((a, b) => (rank[a.type] ?? 3) - (rank[b.type] ?? 3) || Date.parse(b.uploaded_at) - Date.parse(a.uploaded_at))[0];
}

/**
 * Resolves a slug/URL to project+file ids using api.cfwidget.com — a public,
 * read-only metadata mirror (no key, no downloads). Only needed when the caller
 * doesn't already know the numeric ids.
 */
export async function resolveCurseForgeRef(ref: string, target: InstanceSummary): Promise<ResolvedCurseForgeFile> {
  const { slug, fileId } = parseCurseForgeRef(ref);
  const res = await fetch(`https://api.cfwidget.com/minecraft/mc-mods/${encodeURIComponent(slug)}`, {
    headers: { "User-Agent": "PrismMCP (github.com/benflwrs/PrismMCP)" },
  });
  if (!res.ok) throw new Error(`Couldn't look up CurseForge mod '${slug}' (cfwidget ${res.status}). Pass projectId+fileId explicitly instead.`);
  const data = (await res.json()) as { id: number; title: string; files: CfWidgetFile[] };
  let file: CfWidgetFile | undefined;
  if (fileId) file = data.files.find((f) => f.id === fileId) ?? ({ id: fileId, name: "", type: "", versions: [], uploaded_at: "" } as CfWidgetFile);
  else file = pickBestFile(data.files, target.minecraftVersion ?? "", target.loader);
  if (!file) {
    throw new Error(`'${data.title}' has no file for Minecraft ${target.minecraftVersion} + ${target.loader}.`);
  }
  return { projectId: data.id, fileId: file.id, title: data.title, fileName: file.name || undefined, source: "cfwidget" };
}

async function findInstanceByName(cfg: PrismConfig, name: string): Promise<string | undefined> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(instancesDir(cfg), { withFileTypes: true });
  } catch {
    return undefined;
  }
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith(".")) continue;
    try {
      const c = await readInstanceCfg(path.join(instancesDir(cfg), e.name, "instance.cfg"));
      if (c.name === name) return e.name;
    } catch {
      /* not an instance */
    }
  }
  return undefined;
}

export interface StagedInstallStatus {
  status: "done" | "waiting";
  stagingName: string;
  stagingZip?: string;
  movedFiles?: string[];
  skippedExisting?: string[];
  message: string;
}

/** Moves jars + Prism .index metadata from the staging instance into the target, then deletes staging. */
export async function finishStagedInstall(cfg: PrismConfig, targetId: string, stagingName: string): Promise<StagedInstallStatus> {
  const stagingId = await findInstanceByName(cfg, stagingName);
  if (!stagingId) {
    return {
      status: "waiting",
      stagingName,
      message: "Prism hasn't created the staging instance yet. The user needs to click OK in Prism's import window (and handle any 'download manually' prompt). Call finish_curseforge_install again afterwards.",
    };
  }
  const src = modsDir(cfg, stagingId);
  const dst = modsDir(cfg, targetId);
  await fs.mkdir(dst, { recursive: true });
  const moved: string[] = [];
  const skipped: string[] = [];
  let entries: string[] = [];
  try {
    entries = await fs.readdir(src);
  } catch {
    /* no mods dir */
  }
  for (const f of entries) {
    if (!f.endsWith(".jar")) continue;
    const to = path.join(dst, f);
    try {
      await fs.access(to);
      skipped.push(f);
      continue;
    } catch {
      /* not present */
    }
    await fs.copyFile(path.join(src, f), to);
    moved.push(f);
  }
  // Prism's per-mod metadata (lets Prism show these as CurseForge mods and check for updates)
  const idxSrc = path.join(src, ".index");
  try {
    const idx = await fs.readdir(idxSrc);
    await fs.mkdir(path.join(dst, ".index"), { recursive: true });
    for (const f of idx) {
      const to = path.join(dst, ".index", f);
      try {
        await fs.access(to);
      } catch {
        await fs.copyFile(path.join(idxSrc, f), to);
      }
    }
  } catch {
    /* older Prism: no metadata */
  }
  await fs.rm(instanceRoot(cfg, stagingId), { recursive: true, force: true });
  const message =
    moved.length === 0 && skipped.length === 0
      ? "Staging instance had no jars — Prism may have failed or the user skipped the blocked-mod dialog. Check Prism."
      : `Installed ${moved.length} CurseForge mod(s) into '${targetId}'. Note: CurseForge packs don't pull dependencies — check get_mod_info/logs for missing libraries.`;
  return { status: "done", stagingName, movedFiles: moved, skippedExisting: skipped, message };
}

export async function startStagedInstall(
  cfg: PrismConfig,
  targetId: string,
  files: ResolvedCurseForgeFile[],
  waitSeconds: number,
  pollMs = 2000
): Promise<StagedInstallStatus & { files: ResolvedCurseForgeFile[] }> {
  const target = await getInstance(cfg, targetId);
  const stagingName = `${STAGING_PREFIX}${Date.now()}`;
  const manifest = buildStagingManifest(target, stagingName, files);
  const zipPath = await writeStagingZip(manifest, stagingName);
  importResource(cfg, zipPath);

  const deadline = Date.now() + waitSeconds * 1000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollMs));
    if (await findInstanceByName(cfg, stagingName)) {
      // give Prism a moment to finish writing instance files after the staging commit
      await new Promise((r) => setTimeout(r, 1500));
      const result = await finishStagedInstall(cfg, targetId, stagingName);
      await fs.rm(path.dirname(zipPath), { recursive: true, force: true }).catch(() => {});
      return { ...result, stagingZip: zipPath, files };
    }
  }
  return {
    status: "waiting",
    stagingName,
    stagingZip: zipPath,
    files,
    message: `Prism's import window is open — the user must click OK there. Then call finish_curseforge_install with targetInstanceId='${targetId}' and stagingName='${stagingName}'.`,
  };
}
