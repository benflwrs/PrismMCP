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

/** The Minecraft game root inside an instance (holds mods/, saves/, logs/, config/...). */
export function minecraftDir(cfg: PrismConfig, instanceId: string): string {
  return path.join(instanceRoot(cfg, instanceId), ".minecraft");
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
