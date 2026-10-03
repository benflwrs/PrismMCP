import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

/**
 * Ships the bundled skills (skills/<name>/SKILL.md) through MCP itself, so ANY
 * agent connected to PrismMCP gets the modpack knowledge — no per-agent setup:
 *  - server `instructions` (sent on connect; most clients add it to the system prompt)
 *  - resources  skill://<name>  (readable on demand)
 *  - prompts    /<name>          (user-invokable in clients that support prompts)
 *  - tool       get_skill        (fallback for clients that only support tools)
 */

const here = path.dirname(fileURLToPath(import.meta.url));
// dist/skills.js -> ../skills ; src/skills.ts (tsx dev) -> ../skills
export const SKILLS_DIR = path.resolve(here, "..", "skills");

export interface Skill {
  name: string;
  description: string;
  body: string; // markdown without frontmatter
  raw: string;
}

export function loadSkills(dir = SKILLS_DIR): Skill[] {
  if (!fs.existsSync(dir)) return [];
  const out: Skill[] = [];
  for (const name of fs.readdirSync(dir).sort()) {
    const file = path.join(dir, name, "SKILL.md");
    if (!fs.existsSync(file)) continue;
    const raw = fs.readFileSync(file, "utf-8").replace(/\r\n/g, "\n");
    const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    const front = m ? m[1] : "";
    const body = (m ? m[2] : raw).trim();
    const desc = front.match(/^description:\s*(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "") ?? "";
    out.push({ name, description: desc, body, raw });
  }
  return out;
}

export function buildInstructions(skills: Skill[]): string {
  const list = skills.map((s) => `- skill://${s.name} — ${s.description}`).join("\n");
  return [
    "PrismMCP manages PrismLauncher (Minecraft) directly: instances, Modrinth mods, launching, logs, modpack import/export.",
    "Use these tools instead of computer-use/screenshots for anything Prism-related.",
    "",
    "BEFORE designing, adding, removing, or reviewing mods in a modpack, read the bundled knowledge skills",
    "(MCP resources, or call the get_skill tool if your client can't read resources):",
    list,
    "",
    "Key rules: check every mod's client_side/server_side before adding it; one mod per role (one terrain overhaul,",
    "one tech backbone); after each batch of installs, launch_instance (offline is fine) then read_instance_log.",
  ].join("\n");
}

export function registerSkills(server: McpServer, skills: Skill[]): void {
  for (const skill of skills) {
    server.registerResource(
      skill.name,
      `skill://${skill.name}`,
      { title: `Skill: ${skill.name}`, description: skill.description, mimeType: "text/markdown" },
      async (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text: skill.body }] })
    );
    server.registerPrompt(
      skill.name,
      { title: `Load skill: ${skill.name}`, description: skill.description },
      () => ({
        messages: [{ role: "user", content: { type: "text", text: `Use this knowledge for the task:\n\n${skill.body}` } }],
      })
    );
  }

  const names = skills.map((s) => s.name) as [string, ...string[]];
  if (names.length === 0) return;
  server.registerTool(
    "get_skill",
    {
      title: "Read a bundled knowledge skill",
      description:
        "Returns a bundled PrismMCP skill (markdown). Available: " +
        skills.map((s) => `'${s.name}' (${s.description})`).join("; ") +
        ". Read 'modpack-design' before choosing/reviewing mods.",
      inputSchema: { name: z.enum(names) },
    },
    async ({ name }) => {
      const skill = skills.find((s) => s.name === name)!;
      return { content: [{ type: "text", text: skill.body }] };
    }
  );
}
