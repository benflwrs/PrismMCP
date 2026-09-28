import fs from "node:fs/promises";
import path from "node:path";
import { PrismConfig } from "../config.js";
import { modsDir } from "../instance/paths.js";
import { listInstalledMods } from "../mods/modManager.js";

export interface SideSplitEntry {
  fileName: string;
  clientSide: string;
  serverSide: string;
  recommendation: "client-only" | "server-only" | "both" | "unknown";
}

/**
 * Classifies every installed mod as client-only / server-only / both, using
 * client_side/server_side metadata recorded in the instance's PrismMCP lockfile
 * at install time (see mods/lockfile.ts). Mods PrismMCP didn't install itself
 * (unknown provenance, e.g. manually dropped jars) are flagged "unknown" —
 * the caller (agent) should surface those for a human decision.
 */
export async function classifyModsBySide(cfg: PrismConfig, instanceId: string): Promise<SideSplitEntry[]> {
  const mods = await listInstalledMods(cfg, instanceId);
  return mods.map((mod) => {
    if (mod.clientSide && mod.serverSide) {
      return {
        fileName: mod.fileName,
        clientSide: mod.clientSide,
        serverSide: mod.serverSide,
        recommendation: classify(mod.clientSide, mod.serverSide),
      };
    }
    return { fileName: mod.fileName, clientSide: "unknown", serverSide: "unknown", recommendation: "unknown" as const };
  });
}

function classify(client: string, server: string): SideSplitEntry["recommendation"] {
  const clientNeeded = client === "required" || client === "optional";
  const serverNeeded = server === "required" || server === "optional";
  if (clientNeeded && !serverNeeded) return "client-only";
  if (serverNeeded && !clientNeeded) return "server-only";
  if (clientNeeded && serverNeeded) return "both";
  return "unknown";
}

/**
 * Materializes a server-ready mods folder by copying only mods whose Modrinth
 * server_side is required/optional (skipping client_only mods). Unknown mods
 * are copied by default (safer to include than silently drop) and flagged.
 */
export async function exportServerMods(
  cfg: PrismConfig,
  instanceId: string,
  destDir: string
): Promise<{ copied: string[]; skippedClientOnly: string[]; unknown: string[] }> {
  const classification = await classifyModsBySide(cfg, instanceId);
  const srcDir = modsDir(cfg, instanceId);
  await fs.mkdir(destDir, { recursive: true });

  const copied: string[] = [];
  const skippedClientOnly: string[] = [];
  const unknown: string[] = [];

  for (const entry of classification) {
    if (entry.recommendation === "client-only") {
      skippedClientOnly.push(entry.fileName);
      continue;
    }
    if (entry.recommendation === "unknown") unknown.push(entry.fileName);
    await fs.copyFile(path.join(srcDir, entry.fileName), path.join(destDir, entry.fileName));
    copied.push(entry.fileName);
  }

  return { copied, skippedClientOnly, unknown };
}
