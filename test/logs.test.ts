import { describe, it, expect } from "vitest";
import { scanLogForIssues } from "../src/instance/logs.js";

describe("scanLogForIssues", () => {
  it("flags OOM errors", () => {
    const issues = scanLogForIssues("Exception: java.lang.OutOfMemoryError: Java heap space");
    expect(issues.some((i) => i.includes("Out of memory"))).toBe(true);
  });

  it("flags mixin failures", () => {
    const issues = scanLogForIssues("Mixin apply for mod xyz failed target.method()V");
    expect(issues.some((i) => i.includes("Mixin"))).toBe(true);
  });

  it("returns empty for a clean log", () => {
    const issues = scanLogForIssues("[INFO] Loading world\n[INFO] Done (3.2s)! For help, type \"help\"");
    expect(issues.length).toBe(0);
  });
});
