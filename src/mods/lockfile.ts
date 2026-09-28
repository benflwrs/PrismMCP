import fs from "node:fs/promises";
import path from "node:path";
import { PrismConfig } from "../config.js";
import { instanceRoot } from "../instance/paths.js";
import { InstalledMod } from "./modManager.js";

/**
 * PrismMCP maintains a small sidecar lockfile per instance (prismmcp.lock.json,
 * next to instance.cfg) recording which Modrinth project/version each installed
 * mod file came from. PrismLauncher itself doesn't track this, and mod jars
 * don't self-describe their Modrinth project id, so without this file operations
 * like classify_mods_by_side or diffing across restarts would lose provenance
 * for anything PrismMCP itself installed.
 */

export interface LockEntry {
  fileName: string;
  projectId: string;
  projectSlug: string;
  projectTitle: string;
  versionId: string;
  versionNumber: string;
  sha1: string;
  clientSide?: string;
  serverSide?: string;
}

export interface LockFile {
  mods: LockEntry[];
}

function lockPath(cfg: PrismConfig, instanceId: string): string {
  return path.join(instanceRoot(cfg, instanceId), "prismmcp.lock.json");
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function readLock(cfg: PrismConfig, instanceId: string): Promise<LockFile> {
  const p = lockPath(cfg, instanceId);
  if (!(await pathExists(p))) return { mods: [] };
  try {
    return JSON.parse(await fs.readFile(p, "utf-8")) as LockFile;
  } catch {
    return { mods: [] };
  }
}

export async function writeLock(cfg: PrismConfig, instanceId: string, lock: LockFile): Promise<void> {
  await fs.writeFile(lockPath(cfg, instanceId), JSON.stringify(lock, null, 2), "utf-8");
}

export async function upsertLockEntry(cfg: PrismConfig, instanceId: string, entry: LockEntry): Promise<void> {
  const lock = await readLock(cfg, instanceId);
  const idx = lock.mods.findIndex((m) => m.fileName === entry.fileName);
  if (idx >= 0) lock.mods[idx] = entry;
  else lock.mods.push(entry);
  await writeLock(cfg, instanceId, lock);
}

export async function removeLockEntry(cfg: PrismConfig, instanceId: string, fileName: string): Promise<void> {
  const lock = await readLock(cfg, instanceId);
  lock.mods = lock.mods.filter((m) => m.fileName !== fileName);
  await writeLock(cfg, instanceId, lock);
}

/** Merges lockfile provenance into a disk-scanned mod list (by filename). */
export function mergeLockIntoModList(mods: InstalledMod[], lock: LockFile): InstalledMod[] {
  const byName = new Map(lock.mods.map((m) => [m.fileName, m]));
  return mods.map((mod) => {
    const entry = byName.get(mod.fileName);
    if (!entry) return mod;
    return {
      ...mod,
      projectId: entry.projectId,
      projectSlug: entry.projectSlug,
      projectTitle: entry.projectTitle,
      versionId: entry.versionId,
      versionNumber: entry.versionNumber,
      clientSide: entry.clientSide,
      serverSide: entry.serverSide,
    };
  });
}
