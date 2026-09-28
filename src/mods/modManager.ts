import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { PrismConfig } from "../config.js";
import { modsDir } from "../instance/paths.js";
import {
  ModrinthVersion,
  ModrinthVersionFile,
  resolveBestVersion,
  getProject,
  getVersion,
} from "../modrinth/client.js";
import { readLock, upsertLockEntry, removeLockEntry, mergeLockIntoModList } from "./lockfile.js";

export interface InstalledMod {
  fileName: string;
  projectId?: string;
  projectSlug?: string;
  projectTitle?: string;
  versionId?: string;
  versionNumber?: string;
  sha1?: string;
  clientSide?: string;
  serverSide?: string;
  enabled: boolean;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function primaryFile(version: ModrinthVersion): ModrinthVersionFile {
  return version.files.find((f: ModrinthVersionFile) => f.primary) ?? version.files[0];
}

async function downloadFile(url: string, destPath: string): Promise<void> {
  const res = await fetch(url, { headers: { "User-Agent": "PrismMCP/0.1.0" } });
  if (!res.ok) throw new Error(`Download failed ${res.status} ${res.statusText}: ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  await fs.writeFile(destPath, buf);
}

/**
 * Installs a mod by Modrinth project ID/slug into an instance's mods/ folder,
 * auto-resolving the best version for the instance's loader + Minecraft version.
 * Returns metadata about what was installed (for tracking / lockfile use).
 */
export async function installModFromModrinth(
  cfg: PrismConfig,
  instanceId: string,
  projectIdOrSlug: string,
  loader: string,
  gameVersion: string
): Promise<InstalledMod> {
  const version = await resolveBestVersion(projectIdOrSlug, loader, gameVersion);
  if (!version) {
    throw new Error(
      `No compatible version of '${projectIdOrSlug}' found for loader=${loader} minecraft=${gameVersion}`
    );
  }
  const project = await getProject(projectIdOrSlug);
  const file = primaryFile(version);
  const destPath = path.join(modsDir(cfg, instanceId), file.filename);
  await downloadFile(file.url, destPath);

  const result: InstalledMod = {
    fileName: file.filename,
    projectId: project.id,
    projectSlug: project.slug,
    projectTitle: project.title,
    versionId: version.id,
    versionNumber: version.version_number,
    sha1: file.hashes.sha1,
    clientSide: project.client_side,
    serverSide: project.server_side,
    enabled: true,
  };
  await upsertLockEntry(cfg, instanceId, {
    fileName: result.fileName,
    projectId: project.id,
    projectSlug: project.slug,
    projectTitle: project.title,
    versionId: version.id,
    versionNumber: version.version_number,
    sha1: file.hashes.sha1,
    clientSide: project.client_side,
    serverSide: project.server_side,
  });
  return result;
}

/** Installs a mod from a specific known Modrinth version ID (no auto-resolution). */
export async function installModVersion(cfg: PrismConfig, instanceId: string, versionId: string): Promise<InstalledMod> {
  const version = await getVersion(versionId);
  const project = await getProject(version.project_id);
  const file = primaryFile(version);
  const destPath = path.join(modsDir(cfg, instanceId), file.filename);
  await downloadFile(file.url, destPath);
  const result: InstalledMod = {
    fileName: file.filename,
    projectId: project.id,
    projectSlug: project.slug,
    projectTitle: project.title,
    versionId: version.id,
    versionNumber: version.version_number,
    sha1: file.hashes.sha1,
    clientSide: project.client_side,
    serverSide: project.server_side,
    enabled: true,
  };
  await upsertLockEntry(cfg, instanceId, {
    fileName: result.fileName,
    projectId: project.id,
    projectSlug: project.slug,
    projectTitle: project.title,
    versionId: version.id,
    versionNumber: version.version_number,
    sha1: file.hashes.sha1,
    clientSide: project.client_side,
    serverSide: project.server_side,
  });
  return result;
}

export async function listInstalledMods(cfg: PrismConfig, instanceId: string): Promise<InstalledMod[]> {
  const dir = modsDir(cfg, instanceId);
  if (!(await pathExists(dir))) return [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out: InstalledMod[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) continue;
    const isDisabled = entry.name.endsWith(".disabled");
    if (!entry.name.endsWith(".jar") && !isDisabled) continue;
    const filePath = path.join(dir, entry.name);
    const buf = await fs.readFile(filePath);
    const sha1 = createHash("sha1").update(buf).digest("hex");
    out.push({
      fileName: entry.name,
      sha1,
      enabled: !isDisabled,
    });
  }
  const lock = await readLock(cfg, instanceId);
  return mergeLockIntoModList(out, lock);
}

export async function removeMod(cfg: PrismConfig, instanceId: string, fileName: string): Promise<void> {
  const dir = modsDir(cfg, instanceId);
  const candidates = [fileName, `${fileName}.disabled`];
  for (const name of candidates) {
    const p = path.join(dir, name);
    if (await pathExists(p)) {
      await fs.unlink(p);
      await removeLockEntry(cfg, instanceId, fileName.endsWith(".disabled") ? fileName.slice(0, -".disabled".length) : fileName);
      return;
    }
  }
  throw new Error(`Mod file '${fileName}' not found in ${dir}`);
}

export async function setModEnabled(cfg: PrismConfig, instanceId: string, fileName: string, enabled: boolean): Promise<string> {
  const dir = modsDir(cfg, instanceId);
  const base = fileName.endsWith(".disabled") ? fileName.slice(0, -".disabled".length) : fileName;
  const enabledPath = path.join(dir, base);
  const disabledPath = path.join(dir, `${base}.disabled`);
  if (enabled) {
    if (await pathExists(disabledPath)) await fs.rename(disabledPath, enabledPath);
    return base;
  } else {
    if (await pathExists(enabledPath)) await fs.rename(enabledPath, disabledPath);
    return `${base}.disabled`;
  }
}
