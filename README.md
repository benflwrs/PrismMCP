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
- `launch_instance` (offline/account/server/world options), `show_instance_window`, `import_resource` (delegates to Prism's own `.mrpack`/CurseForge zip/URL importer)

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

```bash
cd PrismMCP
npm install
npm run build
npm test        # unit tests (pure logic, no PrismLauncher required)
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

## Status / roadmap

- v1 (this release): core instance/mod/log loop + modpack-level tools (mrpack import/export, diffing, client/server split). Built and tested on Linux against the live Modrinth API; a Windows path (`%APPDATA%\PrismLauncher`, `prismlauncher.exe`) is wired in via `config.ts` but not yet verified against a real Windows PrismLauncher install — do that verification pass before relying on it there.
- Planned: CurseForge API support (needs an API key), benchmarking/profiling automation (worldgen stress tests, spark integration), automatic dependency-chain installs.

## License

MIT
