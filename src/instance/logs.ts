import fs from "node:fs/promises";
import path from "node:path";
import { PrismConfig } from "../config.js";
import { logsDir, crashReportsDir } from "../instance/paths.js";

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/** Reads the tail of latest.log (or a specific log file) for an instance. */
export async function readLatestLog(cfg: PrismConfig, instanceId: string, maxLines = 300): Promise<string> {
  const filePath = path.join(logsDir(cfg, instanceId), "latest.log");
  if (!(await pathExists(filePath))) {
    return `(no latest.log found at ${filePath} — instance may not have been launched yet)`;
  }
  const text = await fs.readFile(filePath, "utf-8");
  const lines = text.split(/\r?\n/);
  return lines.slice(-maxLines).join("\n");
}

export async function listLogFiles(cfg: PrismConfig, instanceId: string): Promise<string[]> {
  const dir = logsDir(cfg, instanceId);
  if (!(await pathExists(dir))) return [];
  return fs.readdir(dir);
}

export async function listCrashReports(cfg: PrismConfig, instanceId: string): Promise<string[]> {
  const dir = crashReportsDir(cfg, instanceId);
  if (!(await pathExists(dir))) return [];
  return fs.readdir(dir);
}

export async function readCrashReport(cfg: PrismConfig, instanceId: string, fileName: string): Promise<string> {
  const dir = crashReportsDir(cfg, instanceId);
  const filePath = path.join(dir, fileName);
  return fs.readFile(filePath, "utf-8");
}

/** Quick heuristic scan of a log for common failure signatures (missing deps, mixin errors, OOM, mod loading crashes). */
export function scanLogForIssues(logText: string): string[] {
  const issues: string[] = [];
  const patterns: [RegExp, string][] = [
    [/OutOfMemoryError/i, "Out of memory (OOM) — instance may need more allocated RAM."],
    [/Mixin apply .* failed/i, "A Mixin failed to apply — likely a mod/loader version mismatch."],
    [/Missing or unsupported mandatory dependenc/i, "A mod is missing a required dependency."],
    [/DuplicateModsFoundException|duplicate mod/i, "Duplicate mod jars detected in the mods folder."],
    [/net\.minecraftforge\.fml\.LoadingFailedException/i, "Forge failed to load one or more mods."],
    [/Incompatible mod set/i, "Incompatible combination of mods detected."],
    [/Exception in thread "main"/i, "Uncaught exception on the main thread — check the surrounding stack trace."],
    [/Crash report saved to/i, "A crash report was generated — inspect it via read_crash_report."],
  ];
  for (const [re, msg] of patterns) {
    if (re.test(logText)) issues.push(msg);
  }
  return issues;
}
