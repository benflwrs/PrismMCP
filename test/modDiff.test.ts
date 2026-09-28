import { describe, it, expect } from "vitest";
import { diffModLists } from "../src/mods/modDiff.js";

describe("diffModLists", () => {
  it("detects added, removed, changed, unchanged", () => {
    const before = [
      { fileName: "a.jar", sha1: "aaa", enabled: true },
      { fileName: "b.jar", sha1: "bbb", enabled: true },
      { fileName: "c.jar", sha1: "ccc", enabled: true },
    ];
    const after = [
      { fileName: "a.jar", sha1: "aaa", enabled: true }, // unchanged
      { fileName: "b.jar", sha1: "bbb2", enabled: true }, // changed (updated)
      { fileName: "d.jar", sha1: "ddd", enabled: true }, // added
      // c.jar removed
    ];
    const diff = diffModLists(before as any, after as any);
    const byName = Object.fromEntries(diff.map((d) => [d.fileName, d.status]));
    expect(byName["a.jar"]).toBe("unchanged");
    expect(byName["b.jar"]).toBe("changed");
    expect(byName["c.jar"]).toBe("removed");
    expect(byName["d.jar"]).toBe("added");
  });
});
