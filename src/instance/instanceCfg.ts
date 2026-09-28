import fs from "node:fs/promises";

/**
 * PrismLauncher's instance.cfg is a simple INI file (no sections in practice,
 * everything sits under an implicit [General] header). We keep it dead simple:
 * parse into a flat string->string map, and write back preserving the header.
 */
export interface InstanceCfg {
  [key: string]: string;
}

const HEADER = "[General]";

export function parseInstanceCfg(text: string): InstanceCfg {
  const cfg: InstanceCfg = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith("[")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    cfg[key] = value;
  }
  return cfg;
}

export function serializeInstanceCfg(cfg: InstanceCfg): string {
  const lines = [HEADER];
  for (const [key, value] of Object.entries(cfg)) {
    lines.push(`${key}=${value}`);
  }
  return lines.join("\n") + "\n";
}

export async function readInstanceCfg(filePath: string): Promise<InstanceCfg> {
  const text = await fs.readFile(filePath, "utf-8");
  return parseInstanceCfg(text);
}

export async function writeInstanceCfg(filePath: string, cfg: InstanceCfg): Promise<void> {
  await fs.writeFile(filePath, serializeInstanceCfg(cfg), "utf-8");
}

export function defaultInstanceCfg(name: string, iconKey = "default"): InstanceCfg {
  return {
    name,
    iconKey,
    InstanceType: "OneSix",
    OverrideCommands: "false",
    OverrideConsole: "false",
    OverrideJavaLocation: "false",
    OverrideMemory: "false",
    lastLaunchTime: "0",
    totalTimePlayed: "0",
    lastTimePlayed: "0",
  };
}
