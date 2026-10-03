# PrismMCP

An MCP (Model Context Protocol) server that lets an AI agent manage [PrismLauncher](https://prismlauncher.org/) directly — creating/editing Minecraft instances, installing mods from Modrinth, launching instances, and reading console/crash logs — **without any GUI or computer-use automation**.

## Why this exists

PrismLauncher already exposes everything needed for automation:
- A CLI (`--launch`, `--import`, `--show`, `--dir`, etc.) that even forwards commands to an already-running instance.
- A plain-file instance format (`instance.cfg`, `mmc-pack.json`, `.minecraft/mods/` etc.) that's safe to read/write directly.
- Plaintext console logs (`.minecraft/logs/latest.log`) and crash reports.

So **no fork of PrismLauncher is required** — PrismMCP is a thin, well-tested automation layer on top of the stock launcher + the open Modrinth API.

## What it can do (v1)

**Instance management**
- `list_instances`, `get_instance`, `create_instance`, `delete_instance`

**Launching**
- `launch_instance` (offline/account/server/world options), `show_instance_window`
- `import_resource` — generic passthrough to Prism's own `.mrpack`/CurseForge zip/URL importer
- `import_curseforge_pack` / `import_modrinth_pack` — same underlying mechanism as `import_resource`, split into named tools for clarity/discoverability (see note below on why CurseForge/Modrinth imports both go through Prism's CLI rather than PrismMCP hitting either platform's API directly for imports)

**Logs & debugging**
- `read_instance_log` (tails `latest.log`, flags common failure patterns: OOM, mixin failures, missing deps, duplicate mods, Forge load failures)
- `list_log_files`, `list_crash_reports`, `read_crash_report`

**Mods (via Modrinth API, no key needed)**
- `search_mods`, `get_mod_info`, `list_mod_versions`
- `install_mod` (auto-resolves best version for the instance's loader+MC version), `install_mod_version` (pin exact version)
- `list_installed_mods`, `remove_mod`, `set_mod_enabled`
- `diff_mod_lists` — compare two snapshots (e.g. before/after a change) by filename+sha1

**Modpack-level tools**
- `import_mrpack` / `export_mrpack` — full `.mrpack` round-trip, with client/server side awareness
- `classify_mods_by_side` — labels every installed mod client-only / server-only / both, using Modrinth `client_side`/`server_side` metadata recorded at install time
- `export_server_mods` — builds a dedicated-server-ready mods folder, automatically excluding client-only mods (Sodium, Iris, etc.)

**Config files**
- `read_instance_file` / `write_instance_file` — read/edit any file inside an instance's `.minecraft/` (mod configs, `options.txt`, etc.), sandboxed to that directory

## How mod provenance is tracked

Mod jars don't self-describe their Modrinth project. PrismMCP writes a small sidecar file, `prismmcp.lock.json`, next to each instance's `instance.cfg`, recording project/version/client-server metadata for every mod it installs. This is what powers `classify_mods_by_side` and cross-session diffing. Mods installed outside PrismMCP (manually dropped jars) show up as `unknown` and are flagged for human review rather than guessed at.

## Setup

### Windows (one-command install)

1. Download [`scripts/install-windows.cmd`](scripts/install-windows.cmd) and [`scripts/install-windows.ps1`](scripts/install-windows.ps1) into the same folder (or clone the repo).
2. Double-click `install-windows.cmd`, or in PowerShell:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\install-windows.ps1
   ```
3. Fully quit and reopen Claude Desktop / restart Claude Code.

The script:
- checks for Node.js 18+ and offers to install Node LTS through `winget` if it's missing
- installs PrismMCP to `%LOCALAPPDATA%\PrismMCP`, using git if you have it and a GitHub zip if you don't
- builds the server
- finds PrismLauncher automatically: the per-user installer path, Program Files, scoop, portable installs, and a custom instances folder
- registers the server with Claude Code (`claude mcp add -s user`) and Claude Desktop (merges into `claude_desktop_config.json` and backs it up to `.bak` first)
- runs a self-check that prints `[OK]`/`[FAIL]` lines

It's safe to run again, and running it again is how you update. If your install is somewhere unusual, pass the paths yourself: `-PrismExe "D:\...\prismlauncher.exe" -PrismDir "D:\...\PrismLauncher"`. You can check things at any time with `node %LOCALAPPDATA%\PrismMCP\dist\server.js --check`.

### Manual / Linux / macOS

```bash
cd PrismMCP
npm install
npm run build
npm test                   # unit tests (pure logic, no PrismLauncher required)
node dist/server.js --check  # verify it can find PrismLauncher + reach Modrinth
```

### Configuration (env vars, all optional — sane defaults per OS)

| Var | Purpose | Default |
|---|---|---|
| `PRISM_DIR` | PrismLauncher data directory | `~/.local/share/PrismLauncher` (Linux), `%APPDATA%\PrismLauncher` (Windows), `~/Library/Application Support/PrismLauncher` (macOS) |
| `PRISM_EXECUTABLE` | Path/command for the launcher binary | `prismlauncher` (Linux/PATH), `prismlauncher.exe` (Windows), the macOS `.app` binary path |

### Registering with an MCP client (e.g. Claude Code / Claude Desktop)

```bash
claude mcp add -s user prismmcp -- node /absolute/path/to/PrismMCP/dist/server.js
```

Or add to your MCP client's config JSON:
```json
{
  "mcpServers": {
    "prismmcp": {
      "command": "node",
      "args": ["/absolute/path/to/PrismMCP/dist/server.js"],
      "env": { "PRISM_DIR": "C:\\Users\\you\\AppData\\Roaming\\PrismLauncher", "PRISM_EXECUTABLE": "C:\\Path\\To\\prismlauncher.exe" }
    }
  }
}
```

## Why CurseForge is import-only, no search — and how Modrinth imports mirror it

Since 2022, the CurseForge REST API requires a **registered, non-transferable 3rd-party API key** (Overwolf's ToS explicitly forbids sharing a key across tools — see [their terms](https://support.curseforge.com/en/support/solutions/articles/9000207405-curse-forge-3rd-party-api-terms-and-conditions)). PrismLauncher itself ships with its own registered key baked into the binary, which is why the GUI can browse/download CurseForge content directly. PrismMCP deliberately does **not** hardcode or reuse Prism's key — reusing another project's non-transferable key risks getting it revoked for every PrismLauncher user, not just this tool.

`import_curseforge_pack` delegates straight to `prismlauncher --import <zip-or-url>`: PrismLauncher handles its own CurseForge auth internally, so PrismMCP never touches a CurseForge key at all. This covers "install a specific CurseForge pack I already found," but not searching/browsing CurseForge's catalog from the agent — use Modrinth's `search_mods` for discovery, or have the user paste a CurseForge pack link/zip path once they've found it.

`import_modrinth_pack` is the same CLI-delegation mechanism applied to Modrinth, for symmetry and to match exactly what a human clicking "Import" in the Prism GUI gets (including Prism's own de-duplication/repair behavior). Modrinth's API is open/keyless, though, so PrismMCP *also* has a from-scratch implementation — `import_mrpack` — that parses the `.mrpack` itself, which is what you want when you need client/server side-splitting or PrismMCP's lockfile provenance tracking (powers `classify_mods_by_side`). Use `import_modrinth_pack` when you just want Prism's own import path; use `import_mrpack` when you need those extra capabilities.



## Built-in modpack knowledge (skills)

PrismMCP ships with two knowledge skills in [`skills/`](skills/):
- **`modpack-design`** covers client vs server mods, performance pain points, a baseline set of performance mods, progression and compatibility design, and how to benchmark.
- **`prismmcp`** explains how to drive these tools well.

Any agent connected to PrismMCP gets them automatically, with no setup per agent:

| Channel | Who it works for |
|---|---|
| Server **instructions** (sent when the client connects) | Most MCP clients add these to the agent's system prompt; they tell it to read the skills before touching mods |
| **Resources** `skill://modpack-design`, `skill://prismmcp` | Clients that support MCP resources (Claude Desktop: attach from the + menu; Claude Code: `@prismmcp:skill://modpack-design`) |
| **Prompts** `/modpack-design`, `/prismmcp` | Clients with prompt or slash-command support |
| **Tool** `get_skill` | Every client, including ones that only support tools; the agent can call it itself |

The Windows installer also copies them into `~/.claude/skills/` as native Claude Code skills, so Claude Code loads them automatically based on what the task is about.

For any other agent framework, point it at `skills/*/SKILL.md`. These are standard SKILL.md files.

## Status / roadmap

- v1 (this release): core instance/mod/log loop + modpack-level tools (mrpack import/export, diffing, client/server split). Built and tested on Linux against the live Modrinth API; a Windows path (`%APPDATA%\PrismLauncher`, `prismlauncher.exe`) is wired in via `config.ts` but not yet verified against a real Windows PrismLauncher install — do that verification pass before relying on it there.
- Planned: CurseForge API support (needs an API key), benchmarking/profiling automation (worldgen stress tests, spark integration), automatic dependency-chain installs.

## License

MIT
