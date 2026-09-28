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
