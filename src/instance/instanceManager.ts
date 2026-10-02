import fs from "node:fs/promises";
import path from "node:path";
import { PrismConfig, instancesDir } from "../config.js";
import { instanceRoot, instanceCfgPath, mmcPackPath, minecraftDir, modsDir, savesDir } from "./paths.js";
import { readInstanceCfg, writeInstanceCfg, defaultInstanceCfg } from "./instanceCfg.js";
import { buildMmcPack, writeMmcPack, readMmcPack, loaderFromMmcPack, KnownLoader } from "./mmcPack.js";

export interface InstanceSummary {
  id: string;
  name: string;
  loader: KnownLoader;
  minecraftVersion?: string;
  loaderVersion?: string;
  lastLaunchTime?: string;
  totalTimePlayed?: string;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function listInstances(cfg: PrismConfig): Promise<InstanceSummary[]> {
  const root = instancesDir(cfg);
  if (!(await pathExists(root))) return [];
  const entries = await fs.readdir(root, { withFileTypes: true });
  const out: InstanceSummary[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === ".LAUNCHER_TEMP") continue;
    try {
      const summary = await getInstance(cfg, entry.name);
      out.push(summary);
    } catch {
      // Not a valid instance folder (missing instance.cfg etc) — skip it.
    }
  }
  return out;
}

export async function getInstance(cfg: PrismConfig, instanceId: string): Promise<InstanceSummary> {
  const cfgPath = instanceCfgPath(cfg, instanceId);
  const iniCfg = await readInstanceCfg(cfgPath);
  let loader: KnownLoader = "vanilla";
  let minecraftVersion: string | undefined;
  let loaderVersion: string | undefined;
  const packPath = mmcPackPath(cfg, instanceId);
  if (await pathExists(packPath)) {
    const pack = await readMmcPack(packPath);
    const info = loaderFromMmcPack(pack);
    loader = info.loader;
    minecraftVersion = info.minecraftVersion;
    loaderVersion = info.loaderVersion;
  }
  return {
    id: instanceId,
    name: iniCfg.name ?? instanceId,
    loader,
    minecraftVersion,
    loaderVersion,
    lastLaunchTime: iniCfg.lastLaunchTime,
    totalTimePlayed: iniCfg.totalTimePlayed,
  };
}

export interface CreateInstanceOptions {
  instanceId: string;
  name?: string;
  minecraftVersion: string;
  loader: KnownLoader;
  loaderVersion?: string;
}

/**
 * Creates a new instance directory with a valid instance.cfg + mmc-pack.json.
 * This mirrors what PrismLauncher itself writes when you use "Add Instance" ->
 * a specific version, without needing to drive the GUI. PrismLauncher will
 * fill in resolved library/version details (patches/net.minecraft.json etc.)
 * the first time it touches the instance (e.g. on launch), same as instances
 * migrated from other launchers.
 */
export async function createInstance(cfg: PrismConfig, opts: CreateInstanceOptions): Promise<InstanceSummary> {
  const root = instanceRoot(cfg, opts.instanceId);
  if (await pathExists(root)) {
    throw new Error(`Instance '${opts.instanceId}' already exists at ${root}`);
  }
  await fs.mkdir(root, { recursive: true });
  await fs.mkdir(minecraftDir(cfg, opts.instanceId), { recursive: true });
  await fs.mkdir(modsDir(cfg, opts.instanceId), { recursive: true });
  await fs.mkdir(savesDir(cfg, opts.instanceId), { recursive: true });

  const displayName = opts.name ?? opts.instanceId;
  await writeInstanceCfg(instanceCfgPath(cfg, opts.instanceId), defaultInstanceCfg(displayName));
  await writeMmcPack(
    mmcPackPath(cfg, opts.instanceId),
    buildMmcPack(opts.minecraftVersion, opts.loader, opts.loaderVersion)
  );

  return getInstance(cfg, opts.instanceId);
}

export async function deleteInstance(cfg: PrismConfig, instanceId: string): Promise<void> {
  const root = instanceRoot(cfg, instanceId);
  if (!(await pathExists(root))) {
    throw new Error(`Instance '${instanceId}' does not exist`);
  }
  await fs.rm(root, { recursive: true, force: true });
}

export async function instanceExists(cfg: PrismConfig, instanceId: string): Promise<boolean> {
  return pathExists(instanceRoot(cfg, instanceId));
}
