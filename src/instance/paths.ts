import fs from "node:fs";
import path from "node:path";
import { PrismConfig, instancesDir } from "../config.js";

export function instanceRoot(cfg: PrismConfig, instanceId: string): string {
  return path.join(instancesDir(cfg), instanceId);
}

export function instanceCfgPath(cfg: PrismConfig, instanceId: string): string {
  return path.join(instanceRoot(cfg, instanceId), "instance.cfg");
}

export function mmcPackPath(cfg: PrismConfig, instanceId: string): string {
  return path.join(instanceRoot(cfg, instanceId), "mmc-pack.json");
}

export function patchesDir(cfg: PrismConfig, instanceId: string): string {
  return path.join(instanceRoot(cfg, instanceId), "patches");
}

/**
 * The Minecraft game root inside an instance (holds mods/, saves/, logs/, config/...).
 * Mirrors PrismLauncher's MinecraftInstance::gameRoot() exactly: use "minecraft/"
 * unless ".minecraft/" exists and "minecraft/" doesn't. Both layouts exist in the
 * wild (older/migrated instances use ".minecraft"), so never hardcode one.
 */
export function minecraftDir(cfg: PrismConfig, instanceId: string): string {
  const root = instanceRoot(cfg, instanceId);
  const mcDir = path.join(root, "minecraft");
  const dotMcDir = path.join(root, ".minecraft");
  if (fs.existsSync(dotMcDir) && !fs.existsSync(mcDir)) return dotMcDir;
  return mcDir;
}

export function modsDir(cfg: PrismConfig, instanceId: string): string {
  return path.join(minecraftDir(cfg, instanceId), "mods");
}

export function logsDir(cfg: PrismConfig, instanceId: string): string {
  return path.join(minecraftDir(cfg, instanceId), "logs");
}

export function crashReportsDir(cfg: PrismConfig, instanceId: string): string {
  return path.join(minecraftDir(cfg, instanceId), "crash-reports");
}

export function savesDir(cfg: PrismConfig, instanceId: string): string {
  return path.join(minecraftDir(cfg, instanceId), "saves");
}

export function configDir(cfg: PrismConfig, instanceId: string): string {
  return path.join(minecraftDir(cfg, instanceId), "config");
}
