import os from "node:os";
import path from "node:path";

/**
 * Resolves where PrismLauncher lives on this machine.
 * Override with env vars PRISM_DIR / PRISM_EXECUTABLE when the defaults don't match
 * (e.g. portable installs, Flatpak, custom --dir usage).
 */
export interface PrismConfig {
  /** PrismLauncher's data directory (contains instances/, accounts.json, etc). */
  dataDir: string;
  /** Path (or bare command name, if on PATH) to the prismlauncher executable. */
  executable: string;
}

function defaultDataDir(): string {
  const platform = os.platform();
  if (process.env.PRISM_DIR) return process.env.PRISM_DIR;

  if (platform === "win32") {
    const appData = process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
    return path.join(appData, "PrismLauncher");
  }
  if (platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "PrismLauncher");
  }
  // Linux and other XDG platforms
  const xdgData = process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share");
  return path.join(xdgData, "PrismLauncher");
}

function defaultExecutable(): string {
  if (process.env.PRISM_EXECUTABLE) return process.env.PRISM_EXECUTABLE;
  const platform = os.platform();
  if (platform === "win32") return "prismlauncher.exe";
  if (platform === "darwin") return "/Applications/Prism Launcher.app/Contents/MacOS/prismlauncher";
  return "prismlauncher";
}

export function loadConfig(): PrismConfig {
  return {
    dataDir: defaultDataDir(),
    executable: defaultExecutable(),
  };
}

export function instancesDir(cfg: PrismConfig): string {
  return path.join(cfg.dataDir, "instances");
}
