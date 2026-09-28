import { describe, it, expect } from "vitest";
import { parseInstanceCfg, serializeInstanceCfg, defaultInstanceCfg } from "../src/instance/instanceCfg.js";

describe("instanceCfg", () => {
  it("parses a typical instance.cfg", () => {
    const text = `[General]\nname=My Pack\nlastLaunchTime=1690000000\niconKey=default\n# a comment\n\ntotalTimePlayed=123\n`;
    const parsed = parseInstanceCfg(text);
    expect(parsed.name).toBe("My Pack");
    expect(parsed.lastLaunchTime).toBe("1690000000");
    expect(parsed.totalTimePlayed).toBe("123");
  });

  it("round-trips default cfg", () => {
    const cfg = defaultInstanceCfg("Test Pack");
    const text = serializeInstanceCfg(cfg);
    const reparsed = parseInstanceCfg(text);
    expect(reparsed.name).toBe("Test Pack");
    expect(reparsed.InstanceType).toBe("OneSix");
  });
});
