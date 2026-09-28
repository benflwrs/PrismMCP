import { spawn } from "node:child_process";
import { PrismConfig } from "../config.js";

export interface LaunchResult {
  pid?: number;
  command: string;
  args: string[];
  detached: boolean;
}

/**
 * Launches an instance via the PrismLauncher CLI. This shells out to the real
 * `prismlauncher` binary — no GUI automation, no computer-use needed.
 * If a PrismLauncher instance is already running, this command gets forwarded
 * to it automatically (documented launcher behavior), so it's safe to call
 * repeatedly.
 */
export function launchInstance(
  cfg: PrismConfig,
  instanceId: string,
  opts: { offlineName?: string; server?: string; world?: string; accountProfile?: string } = {}
): LaunchResult {
  const args: string[] = ["--dir", cfg.dataDir, "--launch", instanceId];
  if (opts.server) args.push("--server", opts.server);
  if (opts.world) args.push("--world", opts.world);
  if (opts.accountProfile) args.push("--profile", opts.accountProfile);
  if (opts.offlineName) args.push("--offline", opts.offlineName);

  const child = spawn(cfg.executable, args, {
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  return { pid: child.pid, command: cfg.executable, args, detached: true };
}

export function showInstanceWindow(cfg: PrismConfig, instanceId: string): LaunchResult {
  const args = ["--dir", cfg.dataDir, "--show", instanceId];
  const child = spawn(cfg.executable, args, { detached: true, stdio: "ignore" });
  child.unref();
  return { pid: child.pid, command: cfg.executable, args, detached: true };
}

export function importResource(cfg: PrismConfig, sourcePathOrUrl: string): LaunchResult {
  const args = ["--dir", cfg.dataDir, "--import", sourcePathOrUrl];
  const child = spawn(cfg.executable, args, { detached: true, stdio: "ignore" });
  child.unref();
  return { pid: child.pid, command: cfg.executable, args, detached: true };
}

/**
 * Imports a CurseForge modpack (.zip file or curseforge.com URL) by delegating
 * to PrismLauncher's own CLI importer, exactly like importResource().
 *
 * We deliberately do NOT talk to the CurseForge REST API directly: it requires
 * a registered, non-transferable 3rd-party API key (CurseForge ToS §2.2), and
 * PrismMCP has no key of its own. PrismLauncher ships with its own registered
 * key and handles CurseForge auth internally when you hand it a zip/URL via
 * --import, so this covers "install a known CurseForge pack" without us ever
 * touching a CurseForge key. It does NOT cover searching/browsing CurseForge's
 * catalog — that would require our own key. Use search_mods (Modrinth) for
 * discovery; use this only once you already have a specific CurseForge pack
 * zip or URL in hand.
 */
export function importCurseForgePack(cfg: PrismConfig, zipPathOrUrl: string): LaunchResult {
  return importResource(cfg, zipPathOrUrl);
}

/**
 * Imports a Modrinth modpack (.mrpack file or modrinth.com URL) by delegating
 * to PrismLauncher's own CLI importer, mirroring importCurseForgePack() for
 * symmetry. Modrinth's API is open/keyless, so PrismMCP *could* fetch and
 * parse the .mrpack itself (see modpack/mrpack.ts::importMrpack, which does
 * exactly that and additionally supports side-aware client/server installs
 * and writes lockfile provenance). Use THIS tool when you just want Prism's
 * own importer behavior (matches what a human clicking "Import" in the GUI
 * gets, including Prism's own de-duplication/repair logic); use
 * import_mrpack (the mrpack.ts-backed tool) when you need side-splitting or
 * lockfile tracking.
 */
export function importModrinthPack(cfg: PrismConfig, mrpackPathOrUrl: string): LaunchResult {
  return importResource(cfg, mrpackPathOrUrl);
}
