import { InstalledMod } from "./modManager.js";

export interface ModDiffEntry {
  fileName: string;
  status: "added" | "removed" | "changed" | "unchanged";
  oldSha1?: string;
  newSha1?: string;
}

/** Diffs two mod lists (e.g. from listInstalledMods snapshots at different times) by filename + sha1. */
export function diffModLists(before: InstalledMod[], after: InstalledMod[]): ModDiffEntry[] {
  const beforeMap = new Map(before.map((m) => [m.fileName, m]));
  const afterMap = new Map(after.map((m) => [m.fileName, m]));
  const allNames = new Set([...beforeMap.keys(), ...afterMap.keys()]);
  const out: ModDiffEntry[] = [];

  for (const name of allNames) {
    const b = beforeMap.get(name);
    const a = afterMap.get(name);
    if (b && !a) {
      out.push({ fileName: name, status: "removed", oldSha1: b.sha1 });
    } else if (!b && a) {
      out.push({ fileName: name, status: "added", newSha1: a.sha1 });
    } else if (b && a) {
      out.push({
        fileName: name,
        status: b.sha1 === a.sha1 ? "unchanged" : "changed",
        oldSha1: b.sha1,
        newSha1: a.sha1,
      });
    }
  }
  return out.sort((x, y) => x.fileName.localeCompare(y.fileName));
}
