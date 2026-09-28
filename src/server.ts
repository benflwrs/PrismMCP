#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";

import { loadConfig } from "./config.js";
import { instanceRoot } from "./instance/paths.js";
import {
  listInstances,
  getInstance,
  createInstance,
  deleteInstance,
} from "./instance/instanceManager.js";
import { readLatestLog, listLogFiles, listCrashReports, readCrashReport, scanLogForIssues } from "./instance/logs.js";
import { launchInstance, showInstanceWindow, importResource, importCurseForgePack, importModrinthPack } from "./launcher/cli.js";
import { searchMods, getProject, getProjectVersions } from "./modrinth/client.js";
import {
  installModFromModrinth,
  installModVersion,
  listInstalledMods,
  removeMod,
  setModEnabled,
} from "./mods/modManager.js";
import { diffModLists } from "./mods/modDiff.js";
import { importMrpack, exportMrpack } from "./modpack/mrpack.js";
import { classifyModsBySide, exportServerMods } from "./modpack/sideSplit.js";

const cfg = loadConfig();

const server = new McpServer({
  name: "prismmcp",
  version: "0.1.0",
});

const KnownLoaderEnum = z.enum(["fabric", "forge", "neoforge", "quilt", "vanilla"]);

// ---------- Instance management ----------

server.registerTool(
  "list_instances",
  {
    title: "List Prism instances",
    description: "Lists all PrismLauncher instances on this machine, with loader, Minecraft version, and playtime.",
    inputSchema: {},
  },
  async () => {
    const instances = await listInstances(cfg);
    return { content: [{ type: "text", text: JSON.stringify(instances, null, 2) }] };
  }
);

server.registerTool(
  "get_instance",
  {
    title: "Get instance details",
    description: "Gets details of one PrismLauncher instance by its ID (folder name).",
    inputSchema: { instanceId: z.string() },
  },
  async ({ instanceId }) => {
    const info = await getInstance(cfg, instanceId);
    return { content: [{ type: "text", text: JSON.stringify(info, null, 2) }] };
  }
);

server.registerTool(
  "create_instance",
  {
    title: "Create a new instance",
    description:
      "Creates a new PrismLauncher instance with a given Minecraft version and mod loader (fabric/forge/neoforge/quilt/vanilla). Loader version is optional; omit to let PrismLauncher resolve 'latest' on first open.",
    inputSchema: {
      instanceId: z.string().describe("Folder-safe unique ID for the instance"),
      name: z.string().optional().describe("Display name; defaults to instanceId"),
      minecraftVersion: z.string().describe("e.g. '1.21.1'"),
      loader: KnownLoaderEnum,
      loaderVersion: z.string().optional(),
    },
  },
  async ({ instanceId, name, minecraftVersion, loader, loaderVersion }) => {
    const info = await createInstance(cfg, { instanceId, name, minecraftVersion, loader, loaderVersion });
    return { content: [{ type: "text", text: JSON.stringify(info, null, 2) }] };
  }
);

server.registerTool(
  "delete_instance",
  {
    title: "Delete an instance",
    description: "Permanently deletes an instance folder (mods, saves, everything). Use with caution.",
    inputSchema: { instanceId: z.string() },
  },
  async ({ instanceId }) => {
    await deleteInstance(cfg, instanceId);
    return { content: [{ type: "text", text: `Deleted instance '${instanceId}'.` }] };
  }
);

// ---------- Launching ----------

server.registerTool(
  "launch_instance",
  {
    title: "Launch an instance",
    description:
      "Launches a PrismLauncher instance via the CLI (no GUI automation needed). Runs detached; check logs afterward with read_instance_log.",
    inputSchema: {
      instanceId: z.string(),
      offlineName: z.string().optional().describe("Launch offline with this player name"),
      server: z.string().optional().describe("Auto-join this server address on launch"),
      world: z.string().optional().describe("Auto-join this singleplayer world (MC 1.20+)"),
      accountProfile: z.string().optional().describe("Use this account profile name"),
    },
  },
  async ({ instanceId, offlineName, server: serverAddr, world, accountProfile }) => {
    const result = launchInstance(cfg, instanceId, { offlineName, server: serverAddr, world, accountProfile });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.registerTool(
  "show_instance_window",
  {
    title: "Open instance window without launching",
    description: "Opens the PrismLauncher instance editor window without launching Minecraft.",
    inputSchema: { instanceId: z.string() },
  },
  async ({ instanceId }) => {
    const result = showInstanceWindow(cfg, instanceId);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.registerTool(
  "import_resource",
  {
    title: "Import a modpack/resource via Prism CLI",
    description: "Imports a .mrpack/CurseForge zip or a Modrinth/CurseForge URL as a new instance using PrismLauncher's own importer.",
    inputSchema: { sourcePathOrUrl: z.string() },
  },
  async ({ sourcePathOrUrl }) => {
    const result = importResource(cfg, sourcePathOrUrl);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.registerTool(
  "import_curseforge_pack",
  {
    title: "Import a CurseForge modpack",
    description:
      "Imports a CurseForge modpack from a .zip file or curseforge.com URL by delegating to PrismLauncher's own importer (Prism authenticates with its own registered CurseForge API key internally — PrismMCP never touches a CurseForge key). This only installs a pack you already have identified; it cannot search/browse CurseForge's catalog (use search_mods for Modrinth discovery instead, or find the pack on curseforge.com in a browser first).",
    inputSchema: { zipPathOrUrl: z.string().describe("Absolute path to a CurseForge .zip, or a curseforge.com pack URL") },
  },
  async ({ zipPathOrUrl }) => {
    const result = importCurseForgePack(cfg, zipPathOrUrl);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.registerTool(
  "import_modrinth_pack",
  {
    title: "Import a Modrinth modpack via Prism's own importer",
    description:
      "Imports a .mrpack file or modrinth.com URL by delegating to PrismLauncher's own CLI importer, same mechanism as import_curseforge_pack — matches exactly what a human clicking 'Import' in the GUI would get, including Prism's own de-duplication/repair behavior. Modrinth's API is open (no key needed), so prefer import_mrpack instead when you need side-aware (client/server) installs or PrismMCP's lockfile provenance tracking for classify_mods_by_side; use this tool when you just want Prism's own import path.",
    inputSchema: { mrpackPathOrUrl: z.string().describe("Absolute path to a .mrpack file, or a modrinth.com pack URL") },
  },
  async ({ mrpackPathOrUrl }) => {
    const result = importModrinthPack(cfg, mrpackPathOrUrl);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ---------- Logs / debugging ----------

server.registerTool(
  "read_instance_log",
  {
    title: "Read instance console log",
    description: "Reads the tail of latest.log for an instance, and flags common failure patterns (OOM, mixin errors, missing deps).",
    inputSchema: { instanceId: z.string(), maxLines: z.number().int().positive().max(5000).optional() },
  },
  async ({ instanceId, maxLines }) => {
    const log = await readLatestLog(cfg, instanceId, maxLines ?? 300);
    const issues = scanLogForIssues(log);
    return {
      content: [
        { type: "text", text: issues.length ? `DETECTED ISSUES:\n${issues.join("\n")}\n\n---\n\n${log}` : log },
      ],
    };
  }
);

server.registerTool(
  "list_log_files",
  {
    title: "List an instance's log files",
    description: "Lists all files in an instance's logs/ directory (rotated logs, debug.log, etc).",
    inputSchema: { instanceId: z.string() },
  },
  async ({ instanceId }) => {
    const files = await listLogFiles(cfg, instanceId);
    return { content: [{ type: "text", text: JSON.stringify(files, null, 2) }] };
  }
);

server.registerTool(
  "list_crash_reports",
  {
    title: "List crash reports",
    description: "Lists crash report files for an instance.",
    inputSchema: { instanceId: z.string() },
  },
  async ({ instanceId }) => {
    const files = await listCrashReports(cfg, instanceId);
    return { content: [{ type: "text", text: JSON.stringify(files, null, 2) }] };
  }
);

server.registerTool(
  "read_crash_report",
  {
    title: "Read a crash report",
    description: "Reads the full contents of a specific crash report file.",
    inputSchema: { instanceId: z.string(), fileName: z.string() },
  },
  async ({ instanceId, fileName }) => {
    const text = await readCrashReport(cfg, instanceId, fileName);
    return { content: [{ type: "text", text }] };
  }
);

// ---------- Mod search / install (Modrinth) ----------

server.registerTool(
  "search_mods",
  {
    title: "Search mods on Modrinth",
    description: "Searches Modrinth for mods/modpacks/resourcepacks/shaders matching a query, optionally filtered by loader and Minecraft version.",
    inputSchema: {
      query: z.string(),
      loader: z.string().optional().describe("e.g. fabric, forge, neoforge, quilt"),
      gameVersion: z.string().optional().describe("e.g. 1.21.1"),
      projectType: z.enum(["mod", "modpack", "resourcepack", "shader"]).optional(),
      limit: z.number().int().positive().max(50).optional(),
    },
  },
  async ({ query, loader, gameVersion, projectType, limit }) => {
    const result = await searchMods({ query, loader, gameVersion, projectType, limit });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.registerTool(
  "get_mod_info",
  {
    title: "Get mod project info",
    description: "Gets Modrinth project details for a mod by ID or slug, including client_side/server_side support.",
    inputSchema: { idOrSlug: z.string() },
  },
  async ({ idOrSlug }) => {
    const project = await getProject(idOrSlug);
    return { content: [{ type: "text", text: JSON.stringify(project, null, 2) }] };
  }
);

server.registerTool(
  "list_mod_versions",
  {
    title: "List a mod's versions on Modrinth",
    description: "Lists available versions of a mod, optionally filtered by loader/game version.",
    inputSchema: {
      idOrSlug: z.string(),
      loaders: z.array(z.string()).optional(),
      gameVersions: z.array(z.string()).optional(),
    },
  },
  async ({ idOrSlug, loaders, gameVersions }) => {
    const versions = await getProjectVersions(idOrSlug, { loaders, gameVersions });
    return { content: [{ type: "text", text: JSON.stringify(versions, null, 2) }] };
  }
);

server.registerTool(
  "install_mod",
  {
    title: "Install a mod into an instance",
    description:
      "Downloads and installs a mod from Modrinth into an instance's mods/ folder, auto-resolving the best version for the instance's loader + Minecraft version.",
    inputSchema: {
      instanceId: z.string(),
      projectIdOrSlug: z.string(),
      loader: z.string().describe("Instance's loader, e.g. fabric/forge/neoforge/quilt"),
      gameVersion: z.string().describe("Instance's Minecraft version"),
    },
  },
  async ({ instanceId, projectIdOrSlug, loader, gameVersion }) => {
    const result = await installModFromModrinth(cfg, instanceId, projectIdOrSlug, loader, gameVersion);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.registerTool(
  "install_mod_version",
  {
    title: "Install a specific mod version",
    description: "Downloads and installs a specific known Modrinth version ID into an instance's mods/ folder (no auto-resolution).",
    inputSchema: { instanceId: z.string(), versionId: z.string() },
  },
  async ({ instanceId, versionId }) => {
    const result = await installModVersion(cfg, instanceId, versionId);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.registerTool(
  "list_installed_mods",
  {
    title: "List installed mods",
    description: "Lists mod jars currently in an instance's mods/ folder, including enabled/disabled state and sha1 hash.",
    inputSchema: { instanceId: z.string() },
  },
  async ({ instanceId }) => {
    const mods = await listInstalledMods(cfg, instanceId);
    return { content: [{ type: "text", text: JSON.stringify(mods, null, 2) }] };
  }
);

server.registerTool(
  "remove_mod",
  {
    title: "Remove a mod",
    description: "Deletes a mod jar (or .disabled variant) from an instance's mods/ folder.",
    inputSchema: { instanceId: z.string(), fileName: z.string() },
  },
  async ({ instanceId, fileName }) => {
    await removeMod(cfg, instanceId, fileName);
    return { content: [{ type: "text", text: `Removed '${fileName}' from instance '${instanceId}'.` }] };
  }
);

server.registerTool(
  "set_mod_enabled",
  {
    title: "Enable or disable a mod",
    description: "Toggles a mod on/off by renaming to/from a .disabled suffix, without deleting it.",
    inputSchema: { instanceId: z.string(), fileName: z.string(), enabled: z.boolean() },
  },
  async ({ instanceId, fileName, enabled }) => {
    const newName = await setModEnabled(cfg, instanceId, fileName, enabled);
    return { content: [{ type: "text", text: `Mod is now at '${newName}' (enabled=${enabled}).` }] };
  }
);

server.registerTool(
  "diff_mod_lists",
  {
    title: "Diff two mod list snapshots",
    description:
      "Compares two mod lists (e.g. from list_installed_mods called at two points in time) and reports added/removed/changed/unchanged mods by filename + sha1.",
    inputSchema: {
      before: z.array(z.object({ fileName: z.string(), sha1: z.string().optional(), enabled: z.boolean() }).passthrough()),
      after: z.array(z.object({ fileName: z.string(), sha1: z.string().optional(), enabled: z.boolean() }).passthrough()),
    },
  },
  async ({ before, after }) => {
    const diff = diffModLists(before as any, after as any);
    return { content: [{ type: "text", text: JSON.stringify(diff, null, 2) }] };
  }
);

// ---------- Modpack-level tools (.mrpack import/export, client/server split) ----------

server.registerTool(
  "import_mrpack",
  {
    title: "Import a .mrpack file as a new instance",
    description:
      "Parses a Modrinth .mrpack file directly (no GUI needed), creates a matching PrismLauncher instance, downloads every mod file, and extracts overrides. Use side='server' to install only server-required files for a headless server build.",
    inputSchema: {
      mrpackPath: z.string().describe("Absolute path to the .mrpack file on disk"),
      instanceId: z.string(),
      side: z.enum(["client", "server"]).optional(),
    },
  },
  async ({ mrpackPath, instanceId, side }) => {
    const result = await importMrpack(cfg, mrpackPath, instanceId, { side });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.registerTool(
  "export_mrpack",
  {
    title: "Export an instance as a .mrpack",
    description: "Packages an instance's currently installed mods into a .mrpack file for sharing or backup.",
    inputSchema: {
      instanceId: z.string(),
      outPath: z.string().describe("Absolute destination path for the .mrpack file"),
      packName: z.string(),
      minecraftVersion: z.string(),
      loader: KnownLoaderEnum,
      loaderVersion: z.string().optional(),
    },
  },
  async ({ instanceId, outPath, packName, minecraftVersion, loader, loaderVersion }) => {
    const result = await exportMrpack(cfg, instanceId, outPath, packName, minecraftVersion, loader, loaderVersion);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.registerTool(
  "classify_mods_by_side",
  {
    title: "Classify installed mods as client/server/both",
    description:
      "Looks up each installed mod's Modrinth client_side/server_side metadata and recommends whether it belongs on client-only, server-only, or both. Flags mods it can't identify as 'unknown' for manual review.",
    inputSchema: { instanceId: z.string() },
  },
  async ({ instanceId }) => {
    const result = await classifyModsBySide(cfg, instanceId);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.registerTool(
  "export_server_mods",
  {
    title: "Export a server-ready mods folder",
    description:
      "Copies only server-required/optional mods (skipping client-only mods like Sodium/Iris) from an instance into a destination folder, ready to drop onto a dedicated server.",
    inputSchema: { instanceId: z.string(), destDir: z.string().describe("Absolute destination directory") },
  },
  async ({ instanceId, destDir }) => {
    const result = await exportServerMods(cfg, instanceId, destDir);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ---------- Config file access (server.properties, mod configs) ----------

server.registerTool(
  "read_instance_file",
  {
    title: "Read a file inside an instance",
    description:
      "Reads a text file relative to an instance's .minecraft directory (e.g. 'config/somemod.toml', 'options.txt', 'server.properties' if present).",
    inputSchema: { instanceId: z.string(), relativePath: z.string() },
  },
  async ({ instanceId, relativePath }) => {
    const root = instanceRoot(cfg, instanceId);
    const mcDir = path.join(root, ".minecraft");
    const target = path.resolve(mcDir, relativePath);
    if (!target.startsWith(path.resolve(mcDir))) {
      throw new Error("Path escapes the instance directory — refused for safety.");
    }
    const text = await fs.readFile(target, "utf-8");
    return { content: [{ type: "text", text }] };
  }
);

server.registerTool(
  "write_instance_file",
  {
    title: "Write a file inside an instance",
    description:
      "Writes/overwrites a text file relative to an instance's .minecraft directory (e.g. to edit a mod's config). Creates parent directories as needed.",
    inputSchema: { instanceId: z.string(), relativePath: z.string(), content: z.string() },
  },
  async ({ instanceId, relativePath, content }) => {
    const root = instanceRoot(cfg, instanceId);
    const mcDir = path.join(root, ".minecraft");
    const target = path.resolve(mcDir, relativePath);
    if (!target.startsWith(path.resolve(mcDir))) {
      throw new Error("Path escapes the instance directory — refused for safety.");
    }
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, "utf-8");
    return { content: [{ type: "text", text: `Wrote ${content.length} bytes to ${relativePath}` }] };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("PrismMCP fatal error:", err);
  process.exit(1);
});
