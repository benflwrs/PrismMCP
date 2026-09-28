import fs from "node:fs/promises";
import path from "node:path";

/**
 * mmc-pack.json lists the "components" of an instance (Minecraft itself, plus
 * loaders like Fabric/Forge/NeoForge/Quilt/LiteLoader). Each component has an
 * accompanying patch file at patches/<uid>.json holding the actual version data
 * PrismLauncher resolves against its meta index. We only need to write the
 * mmc-pack.json component list + minimal patch stubs; PrismLauncher will
 * happily re-resolve/repair details (libraries, main class) the first time the
 * instance is opened, same as it does for packs imported from a .zip.
 */

export type KnownLoader = "fabric" | "forge" | "neoforge" | "quilt" | "vanilla";

export interface Component {
  uid: string;
  version?: string;
  cachedName?: string;
  cachedVersion?: string;
  important?: boolean;
  dependencyOnly?: boolean;
}

export interface MmcPack {
  formatVersion: number;
  components: Component[];
}

const LOADER_UID: Record<Exclude<KnownLoader, "vanilla">, string> = {
  fabric: "net.fabricmc.fabric-loader",
  forge: "net.minecraftforge",
  neoforge: "net.neoforged",
  quilt: "org.quiltmc.quilt-loader",
};

const LOADER_NAME: Record<Exclude<KnownLoader, "vanilla">, string> = {
  fabric: "Fabric Loader",
  forge: "Forge",
  neoforge: "NeoForge",
  quilt: "Quilt Loader",
};

export function buildMmcPack(
  minecraftVersion: string,
  loader: KnownLoader,
  loaderVersion?: string
): MmcPack {
  const components: Component[] = [
    {
      uid: "net.minecraft",
      version: minecraftVersion,
      cachedName: "Minecraft",
      cachedVersion: minecraftVersion,
      important: true,
    },
  ];

  if (loader !== "vanilla") {
    components.push({
      uid: LOADER_UID[loader],
      version: loaderVersion, // may be undefined -> PrismLauncher resolves "latest" on next open
      cachedName: LOADER_NAME[loader],
      cachedVersion: loaderVersion,
    });
  }

  return { formatVersion: 1, components };
}

export function loaderFromMmcPack(pack: MmcPack): { loader: KnownLoader; minecraftVersion?: string; loaderVersion?: string } {
  const mc = pack.components.find((c) => c.uid === "net.minecraft");
  for (const [loader, uid] of Object.entries(LOADER_UID) as [Exclude<KnownLoader, "vanilla">, string][]) {
    const comp = pack.components.find((c) => c.uid === uid);
    if (comp) {
      return { loader, minecraftVersion: mc?.version, loaderVersion: comp.version };
    }
  }
  return { loader: "vanilla", minecraftVersion: mc?.version };
}

export async function readMmcPack(filePath: string): Promise<MmcPack> {
  const text = await fs.readFile(filePath, "utf-8");
  return JSON.parse(text) as MmcPack;
}

export async function writeMmcPack(filePath: string, pack: MmcPack): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(pack, null, 4), "utf-8");
}
