---
name: modpack-design
description: Knowledge for designing and curating Minecraft modpacks - client vs server side mods, performance pain points (worldgen, tick lag, load times, memory), baseline performance mods, progression/compatibility/worldgen/reward design, and benchmarking. Use when choosing, adding, removing, or reviewing mods for a modpack.
---

# Designing a good Minecraft modpack

Knowledge for curating mod selection, progression, and performance when building a modpack (paired with the `prismmcp` skill for execution).

## Client-side vs server-side vs both
Modrinth tags every mod's `client_side` / `server_side` as `required` / `optional` / `unsupported`:
- **Client-only** (`server_side: unsupported`): rendering/UX mods — Sodium, Iris (shaders), Entity Culling, ImmediatelyFast, minimap mods, [ETF]/[EMF]. Installing these on a dedicated server is harmless-but-pointless at best, and can crash a server at worst if they assume a render thread.
- **Server-only** (`client_side: unsupported`): server-admin/anti-cheat/backend-perf mods — Dynamic View, ServerCore, Carpet. Installing on a client is often silently ignored, occasionally a crash.
- **Both required**: gameplay/content mods (Create, tech mods, most block/item content) must match on client and server or players get "missing mod" disconnects.
- Rule of thumb: **when in doubt, check both fields before adding a mod to a shared pack** — don't guess from the mod's description. Use `classify_mods_by_side` / `export_server_mods` from PrismMCP rather than eyeballing it.

## Massive technical pain points (know these, design around them)
1. **Chunk/worldgen generation time** — the #1 complaint in large content packs. Heavy custom worldgen (biome mods, structure mods, terrain overhauls) multiplies chunk-gen cost. Mitigate: pick **one** terrain-overhaul mod (never stack Terralith + Tectonic + BiomesOPlenty-style mods simultaneously — they fight and/or compound cost), use a modern chunk-gen threading mod (C2ME), and consider a smaller default render/simulation distance for heavy packs.
2. **Tick lag / TPS drops** — comes from entity AI, redstone, hoppers/pipes, and large farms. Mitigate with Lithium (game-logic optimization), Clumps (XP orb reduction), and pack-level rules (mob caps, farm AFK limits on servers).
3. **Loading/launch times** — large mod counts multiply classloading + datapack/registry resolution time. Mitigate with ModernFix (load time + memory) and FerriteCore (memory); Starlight and LazyDFU only help on old versions (pre-1.20 / pre-1.19.4) since vanilla absorbed their fixes; keep unnecessary resource-heavy mods out of "vanilla+" packs.
4. **Memory pressure / GC pauses** — shows up as stutters more than crashes on modern JVMs. FerriteCore reduces baseline usage; also matters: don't over-allocate heap beyond what's needed (larger heaps sometimes mean *longer* GC pauses, not fewer).
5. **Network sync overhead** — large multiplayer packs with big inventories/mod entities need scrutiny on server tick budget vs player count; Very Many Players-style mods exist specifically for large SMPs.

## Known-good baseline performance stack (starting point, verify per-version compat)
- Fabric/Quilt: Sodium, Lithium, FerriteCore, ModernFix, Starlight (only pre-1.20), Entity Culling, ImmediatelyFast, Indium (if using Fabric Rendering API mods alongside Sodium), C2ME (chunk gen).
- Forge/NeoForge: equivalent forks/ports of the above exist for most versions — check per-version availability, don't assume 1:1 parity with Fabric.
- Universal: spark (profiler — install to actually *diagnose* lag rather than guess), Clumps.

## What makes a good modpack, design-wise
1. **Intentional progression tiers** — early/mid/late game should each have a clear "what do I do next" answer. Avoid dumping 300 mods with no gating; use a progression-framework mod (e.g. Phat's Progression Framework style config-driven tier gating) if the base game's tool tiers aren't enough structure.
2. **Avoid mod overlap / pick one per role** — one terrain mod, one primary tech/automation backbone (don't run 3 competing power systems unless the pack's whole point is bridging them via an integration mod), one primary magic system unless intentionally themed as a kitchen-sink pack.
3. **Mod intercompatibility** — favor mods built for cross-compat (library mods like Lithostitched for worldgen compat) and check for explicit integration addons between your chosen mods before assuming they'll just coexist.
4. **Interesting worldgen without runaway generation cost** — gives players a reason to explore (new structures/dimensions/biomes) but test actual chunk-gen time, don't just trust the mod's marketing.
5. **Reward/exploration pacing** — structures and dungeons should scale in danger/reward with progression tier; don't let a mid-game structure trivially drop end-game loot.
6. **Semantic pack versioning** — `major.minor.patch` where **major** = any worldgen or progression-breaking change (warn players a new world may be needed), minor = new content, patch = fixes.

## Benchmarking methodology (manual today, see prismmcp skill's "known gaps" for automation status)
- **Chunk-gen stress test**: force-load a fixed radius via the vanilla `/forceload` command (or a Carpet fake-player script) and time it. This is the most meaningful single worldgen performance number.
- **Client FPS**: track average FPS *and* the 1%/5% low frames (stutter is more disruptive than average FPS being fine) — not just a single peak number.
- **Server**: use `spark` for GC/tick profiling on real gameplay, not just idle-server numbers.
- Compare before/after any mod-list change using the same seed, same forceload area, same player count, so numbers are actually comparable.

## Practical checklist before calling a modpack "done"
- [ ] Every mod's client/server-side checked and matches its role (see PrismMCP `classify_mods_by_side`)
- [ ] No duplicate/competing mods in the same role (worldgen, tech backbone, magic system)
- [ ] A performance baseline stack installed and appropriate to the loader
- [ ] A chunk-gen stress test run and recorded
- [ ] Progression has a clear early/mid/late structure a new player could follow without a wiki
- [ ] Pack version bumped correctly if worldgen/progression changed
