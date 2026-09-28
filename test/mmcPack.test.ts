import { describe, it, expect } from "vitest";
import { buildMmcPack, loaderFromMmcPack } from "../src/instance/mmcPack.js";

describe("mmcPack", () => {
  it("builds a fabric pack and round-trips loader detection", () => {
    const pack = buildMmcPack("1.21.1", "fabric", "0.16.5");
    expect(pack.components.length).toBe(2);
    const info = loaderFromMmcPack(pack);
    expect(info.loader).toBe("fabric");
    expect(info.minecraftVersion).toBe("1.21.1");
    expect(info.loaderVersion).toBe("0.16.5");
  });

  it("builds a vanilla pack with no loader", () => {
    const pack = buildMmcPack("1.20.1", "vanilla");
    expect(pack.components.length).toBe(1);
    const info = loaderFromMmcPack(pack);
    expect(info.loader).toBe("vanilla");
  });

  it("detects forge and neoforge distinctly", () => {
    const forge = loaderFromMmcPack(buildMmcPack("1.20.1", "forge", "47.2.0"));
    expect(forge.loader).toBe("forge");
    const neo = loaderFromMmcPack(buildMmcPack("1.21.1", "neoforge", "21.1.0"));
    expect(neo.loader).toBe("neoforge");
  });
});
