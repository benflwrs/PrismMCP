---
name: prismmcp
description: How to use the PrismMCP tools to create and manage PrismLauncher Minecraft instances, install/remove mods from Modrinth, launch instances, read logs and crash reports, import/export modpacks, and split client/server mods. Use whenever working on a Minecraft modpack or Prism instance instead of computer-use.
---

# PrismMCP — Automating PrismLauncher

PrismMCP (github.com/benflwrs/PrismMCP) is an MCP server that manages PrismLauncher directly: instances, mods, launches, logs. Use its tools instead of computer-use/screenshots whenever the user asks you to build, edit, or debug a Minecraft modpack.

## When to use this
Any task involving: creating a modpack/instance, adding/removing mods, checking why an instance crashed, building a client+server pair from one pack, or diffing mod changes over time.

## Setup check
Before using PrismMCP tools, confirm it's registered: `claude mcp list` should show `prismmcp`. If not:
```bash
claude mcp add -s user prismmcp -- node /absolute/path/to/PrismMCP/dist/server.js
```
It needs `PRISM_DIR` (PrismLauncher data dir) and `PRISM_EXECUTABLE` (binary path) env vars if defaults don't match the machine — see PrismMCP's README.
On Windows, `scripts/install-windows.cmd` (double-click) does everything: it installs Node, builds, auto-detects Prism, registers with Claude Code and Desktop, and runs a self-check. Re-running it updates everything. Diagnose with `node dist/server.js --check`; `--print-config` shows the detected paths.
Instance game dir is `minecraft/` OR `.minecraft/` (Prism's gameRoot rule) — always use paths.ts `minecraftDir()`, never hardcode.

## Core workflow for building a modpack
1. `create_instance` with a chosen Minecraft version + loader (fabric/forge/neoforge/quilt). Prefer Fabric or NeoForge for modern performance-mod ecosystems unless the user needs specific Forge-only content mods.
2. `search_mods` (filtered by loader + gameVersion) to find candidates. Always check `get_mod_info` for `client_side`/`server_side` before deciding — see modpack-design skill for what belongs where.
3. `install_mod` for each pick (auto-resolves the right version for the instance). Use `install_mod_version` only when pinning an exact version (e.g. matching a known-good combo).
4. After every batch of installs, `launch_instance` (offline mode is fine for a smoke test: `offlineName: "testuser"`), wait, then `read_instance_log` — it auto-flags OOM/mixin/dependency issues. Check `list_crash_reports` / `read_crash_report` if the log is inconclusive.
5. Iterate: `list_installed_mods` before/after a change, `diff_mod_lists` to confirm exactly what changed.

## Client/server splitting
- `classify_mods_by_side` after mods are installed — flags client-only/server-only/both/unknown. Investigate any `unknown` (usually a manually-dropped jar) before shipping.
- `export_server_mods` builds a ready-to-deploy server mods folder automatically excluding client-only mods (Sodium, Iris, ImmediatelyFast, etc.) — use this instead of manually filtering.
- Never assume a mod is safe on both sides just because it doesn't crash on one — always check the classification.

## Sharing/distributing a pack
- `export_mrpack` packages the instance's current mods as a `.mrpack` (Modrinth's standard format) for sharing.
- `import_mrpack` recreates an instance from a `.mrpack` someone else made — pass `side: "server"` when building a dedicated server instance from a client pack (skips client-only files).

## Editing mod configs
`read_instance_file` / `write_instance_file` operate on paths relative to `.minecraft/` inside the instance (e.g. `config/sodium-options.json`, `options.txt`). They refuse paths that escape the instance directory.

## Debugging checklist when something's wrong
1. `read_instance_log` — check the auto-flagged issues section first.
2. If unclear, `list_crash_reports` then `read_crash_report` on the newest one.
3. Cross-reference with `classify_mods_by_side` — a lot of "crashes on join" issues are a server-only or client-only mod installed on the wrong side.
4. For loader/version mismatches, `get_instance` shows the resolved loader + MC version — verify every newly installed mod's `list_mod_versions` actually covers that combo.

## Known gaps (as of v1)
- CurseForge: `import_curseforge_pack` can install a specific pack (zip or curseforge.com URL) by delegating to Prism's own CLI importer — Prism uses its own registered API key internally, PrismMCP never touches a CurseForge key (reusing Prism's non-transferable key was considered and rejected — ToS risk to all Prism users). There is NO search/browse of CurseForge's catalog from PrismMCP; use `search_mods` (Modrinth) for discovery, or have the user hand you a specific CurseForge pack link/zip.
- Modrinth import has two paths: `import_modrinth_pack` mirrors the CurseForge one (delegates to Prism's own CLI importer, matches GUI behavior exactly) — use it when you just want Prism's own import; `import_mrpack` is PrismMCP's own from-scratch `.mrpack` parser and is the one to use when you need client/server side-splitting or lockfile provenance for `classify_mods_by_side`.
- No benchmarking/profiling automation yet (see modpack-design skill for what *should* be tested, but PrismMCP can't run it automatically yet — that's manual for now, or delegate a custom script via `write_instance_file` + a Prism custom-command hook).
- `import_mrpack` doesn't yet backfill the PrismMCP lockfile per-file (so `classify_mods_by_side` on an imported pack may show a lot of "unknown" until you also touch those mods via `install_mod`/`install_mod_version`). Prefer building packs from scratch via `install_mod` when precise client/server classification matters.
