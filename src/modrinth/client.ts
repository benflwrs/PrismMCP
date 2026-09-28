/**
 * Minimal Modrinth API v2 client. No API key required for read/search/download.
 * https://docs.modrinth.com/api/
 */

const API_BASE = "https://api.modrinth.com/v2";
const USER_AGENT = "PrismMCP/0.1.0 (github.com/benflwrs/PrismMCP)";

async function apiGet<T>(pathAndQuery: string): Promise<T> {
  const res = await fetch(`${API_BASE}${pathAndQuery}`, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Modrinth API ${res.status} ${res.statusText} for ${pathAndQuery}: ${body.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

export interface ModrinthSearchHit {
  project_id: string;
  slug: string;
  title: string;
  description: string;
  categories: string[];
  client_side: string;
  server_side: string;
  project_type: string;
  downloads: number;
  follows: number;
  versions: string[];
  latest_version?: string;
}

export interface ModrinthSearchResult {
  hits: ModrinthSearchHit[];
  total_hits: number;
}

export interface ModrinthVersionFile {
  hashes: { sha1: string; sha512: string };
  url: string;
  filename: string;
  primary: boolean;
  size: number;
}

export interface ModrinthVersion {
  id: string;
  project_id: string;
  name: string;
  version_number: string;
  game_versions: string[];
  loaders: string[];
  version_type: "release" | "beta" | "alpha";
  files: ModrinthVersionFile[];
  dependencies: {
    version_id: string | null;
    project_id: string | null;
    file_name: string | null;
    dependency_type: "required" | "optional" | "incompatible" | "embedded";
  }[];
}

export interface ModrinthProject {
  id: string;
  slug: string;
  title: string;
  description: string;
  project_type: string;
  client_side: string;
  server_side: string;
  categories: string[];
  loaders?: string[];
}

/** Build a facets query string for Modrinth search, e.g. loaders/game_versions/project_type. */
function buildFacets(opts: { projectType?: string; loader?: string; gameVersion?: string }): string {
  const facets: string[][] = [];
  if (opts.projectType) facets.push([`project_type:${opts.projectType}`]);
  if (opts.loader) facets.push([`categories:${opts.loader}`]);
  if (opts.gameVersion) facets.push([`versions:${opts.gameVersion}`]);
  return facets.length ? encodeURIComponent(JSON.stringify(facets)) : "";
}

export async function searchMods(opts: {
  query: string;
  loader?: string;
  gameVersion?: string;
  projectType?: string;
  limit?: number;
}): Promise<ModrinthSearchResult> {
  const params = new URLSearchParams();
  params.set("query", opts.query);
  params.set("limit", String(opts.limit ?? 10));
  const facets = buildFacets({
    projectType: opts.projectType ?? "mod",
    loader: opts.loader,
    gameVersion: opts.gameVersion,
  });
  if (facets) params.set("facets", facets);
  return apiGet<ModrinthSearchResult>(`/search?${params.toString()}`);
}

export async function getProject(idOrSlug: string): Promise<ModrinthProject> {
  return apiGet<ModrinthProject>(`/project/${encodeURIComponent(idOrSlug)}`);
}

export async function getProjectVersions(
  idOrSlug: string,
  opts: { loaders?: string[]; gameVersions?: string[] } = {}
): Promise<ModrinthVersion[]> {
  const params = new URLSearchParams();
  if (opts.loaders?.length) params.set("loaders", JSON.stringify(opts.loaders));
  if (opts.gameVersions?.length) params.set("game_versions", JSON.stringify(opts.gameVersions));
  const qs = params.toString();
  return apiGet<ModrinthVersion[]>(`/project/${encodeURIComponent(idOrSlug)}/version${qs ? `?${qs}` : ""}`);
}

/**
 * Picks the best matching version for a mod given target loader + Minecraft version.
 * Prefers "release" version_type, then the newest by array order (Modrinth returns
 * newest-first already).
 */
export async function resolveBestVersion(
  idOrSlug: string,
  loader: string,
  gameVersion: string
): Promise<ModrinthVersion | null> {
  const versions = await getProjectVersions(idOrSlug, { loaders: [loader], gameVersions: [gameVersion] });
  if (versions.length === 0) return null;
  const release = versions.find((v) => v.version_type === "release");
  return release ?? versions[0];
}

export async function getVersion(versionId: string): Promise<ModrinthVersion> {
  return apiGet<ModrinthVersion>(`/version/${encodeURIComponent(versionId)}`);
}

export async function getDependencies(idOrSlug: string): Promise<{ projects: ModrinthProject[]; versions: ModrinthVersion[] }> {
  return apiGet(`/project/${encodeURIComponent(idOrSlug)}/dependencies`);
}
