import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Resolves where PrismLauncher lives on this machine.
 * Override with env vars PRISM_DIR / PRISM_EXECUTABLE when the defaults don't match
 * (e.g. portable installs, Flatpak, custom --dir usage).
 */
export interface PrismConfig {
  /** PrismLauncher's data directory (contains instances/, prismlauncher.cfg, etc). */
  dataDir: string;
  /** Path (or bare command name, if on PATH) to the prismlauncher executable. */
  executable: string;
}

/** Common Windows install locations for prismlauncher.exe, most likely first. */
export function windowsExecutableCandidates(): string[] {
  const localAppData = process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local");
  const programFiles = process.env.ProgramFiles ?? "C:\\Program Files";
  const programFilesX86 = process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
  return [
    path.join(localAppData, "Programs", "PrismLauncher", "prismlauncher.exe"), // official installer (per-user, default)
    path.join(programFiles, "PrismLauncher", "prismlauncher.exe"), // installer, all-users
    path.join(programFilesX86, "PrismLauncher", "prismlauncher.exe"),
    path.join(os.homedir(), "scoop", "apps", "prismlauncher", "current", "prismlauncher.exe"), // scoop
  ];
}

function firstExisting(paths: string[]): string | undefined {
  return paths.find((p) => {
    try {
      return fs.statSync(p).isFile();
    } catch {
      return false;
    }
  });
}

function defaultExecutable(): string {
  if (process.env.PRISM_EXECUTABLE) return process.env.PRISM_EXECUTABLE;
  const platform = os.platform();
  if (platform === "win32") return firstExisting(windowsExecutableCandidates()) ?? "prismlauncher.exe";
  if (platform === "darwin") return "/Applications/Prism Launcher.app/Contents/MacOS/prismlauncher";
  return "prismlauncher";
}

function defaultDataDir(executable: string): string {
  if (process.env.PRISM_DIR) return process.env.PRISM_DIR;
  const platform = os.platform();

  // Portable installs keep their data next to the executable (marked by portable.txt).
  if (path.isAbsolute(executable)) {
    const exeDir = path.dirname(executable);
    if (fs.existsSync(path.join(exeDir, "portable.txt"))) return exeDir;
  }

  if (platform === "win32") {
    const appData = process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
    return path.join(appData, "PrismLauncher");
  }
  if (platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "PrismLauncher");
  }
  const xdgData = process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share");
  return path.join(xdgData, "PrismLauncher");
}

export function loadConfig(): PrismConfig {
  const executable = defaultExecutable();
  return { dataDir: defaultDataDir(executable), executable };
}

export function instancesDir(cfg: PrismConfig): string {
  // Prism lets users relocate the instances folder (Settings > Launcher > Folders),
  // stored as InstanceDir in prismlauncher.cfg; it may be relative to dataDir.
  try {
    const text = fs.readFileSync(path.join(cfg.dataDir, "prismlauncher.cfg"), "utf-8");
    const m = text.match(/^InstanceDir=(.+)$/m);
    if (m && m[1].trim()) {
      const dir = m[1].trim();
      return path.isAbsolute(dir) ? dir : path.join(cfg.dataDir, dir);
    }
  } catch {
    // no launcher cfg yet — fall through to default
  }
  return path.join(cfg.dataDir, "instances");
}
