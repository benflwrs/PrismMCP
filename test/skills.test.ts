import { describe, it, expect } from "vitest";
import { loadSkills, buildInstructions } from "../src/skills.js";

describe("bundled skills", () => {
  const skills = loadSkills();
  it("loads modpack-design and prismmcp with descriptions", () => {
    const names = skills.map((s) => s.name);
    expect(names).toContain("modpack-design");
    expect(names).toContain("prismmcp");
    for (const s of skills) {
      expect(s.description.length).toBeGreaterThan(20);
      expect(s.body.startsWith("---")).toBe(false);
    }
  });
  it("instructions reference every skill", () => {
    const text = buildInstructions(skills);
    for (const s of skills) expect(text).toContain(`skill://${s.name}`);
  });
});
