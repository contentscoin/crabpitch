/**
 * MCP HTTP 요청에서 유저 키(`cp_mcp_…`)를 추출한다.
 * 우선순위: URL path → Authorization Bearer → x-api-key → ?key=
 */

export function extractMcpBearer(request: Request): string | null {
  const url = new URL(request.url);
  const pathKey = url.pathname.replace(/^\/api\/mcp\/?/, "").trim();
  if (pathKey.startsWith("cp_mcp_")) {
    try {
      return decodeURIComponent(pathKey);
    } catch {
      return pathKey;
    }
  }

  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (match?.[1]) return match[1].trim();

  const apiKey = request.headers.get("x-api-key")?.trim();
  if (apiKey) return apiKey;

  const queryKey = url.searchParams.get("key")?.trim();
  if (queryKey) return queryKey;

  return null;
}

/** query 문자열에서 주제 태그 후보를 뽑는다. */
export function tagsFromQuery(query: string): string[] {
  return query
    .split(/[,，、\n|/]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
    .slice(0, 12);
}

/** MCP JSON 스니펫용 site URL — 반드시 .convex.site */
export function mcpSiteBase(
  env: Record<string, string | undefined> = process.env as Record<
    string,
    string | undefined
  >,
): string {
  const raw = env.CONVEX_SITE_URL?.trim();
  if (raw) return raw.replace(/\/$/, "");
  return "https://YOUR_DEPLOYMENT.convex.site";
}
