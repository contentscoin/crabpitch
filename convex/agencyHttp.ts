import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "Authorization, Content-Type",
      "access-control-allow-methods": "GET, POST, OPTIONS",
    },
  });
}

function bearerFrom(request: Request): string | null {
  const h = request.headers.get("authorization") ?? "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() ?? null;
}

async function requireAgency(ctx: {
  runQuery: (
    ref: typeof internal.agency.resolveByApiKey,
    args: { bearer: string },
  ) => Promise<{ agencyId: Id<"agencies">; ownerUserId: Id<"users">; name: string } | null>;
}, request: Request) {
  const token = bearerFrom(request);
  if (!token) return null;
  return ctx.runQuery(internal.agency.resolveByApiKey, { bearer: token });
}

/** CORS preflight */
export const agencyApiOptions = httpAction(async () => {
  return json({}, 204);
});

/** GET /api/v1/clients · POST /api/v1/clients */
export const agencyClientsHttp = httpAction(async (ctx, request) => {
  if (request.method === "OPTIONS") return json({}, 204);

  const auth = await requireAgency(ctx, request);
  if (!auth) return json({ error: "unauthorized" }, 401);

  if (request.method === "GET") {
    const clients = await ctx.runQuery(internal.agency.listClientsInternal, {
      agencyId: auth.agencyId,
    });
    return json({
      agency: auth.name,
      clients: clients.map((c) => ({
        id: c._id,
        name: c.name,
        contactEmail: c.contactEmail ?? null,
        createdAt: c.createdAt,
      })),
    });
  }

  if (request.method === "POST") {
    const body = (await request.json().catch(() => null)) as {
      name?: string;
      contactEmail?: string;
    } | null;
    if (!body?.name?.trim()) return json({ error: "name required" }, 400);
    const id = await ctx.runMutation(internal.agency.createClientInternal, {
      agencyId: auth.agencyId,
      name: body.name,
      contactEmail: body.contactEmail,
    });
    return json({ id }, 201);
  }

  return json({ error: "method not allowed" }, 405);
});

/** GET /api/v1/campaigns?clientId= */
export const agencyCampaignsHttp = httpAction(async (ctx, request) => {
  if (request.method === "OPTIONS") return json({}, 204);
  const auth = await requireAgency(ctx, request);
  if (!auth) return json({ error: "unauthorized" }, 401);

  const url = new URL(request.url);
  const clientId = url.searchParams.get("clientId") as Id<"agencyClients"> | null;
  const campaigns = await ctx.runQuery(internal.agency.listCampaignsByClientInternal, {
    agencyId: auth.agencyId,
    clientId: clientId ?? undefined,
  });
  return json({
    campaigns: campaigns.map((c) => ({
      id: c._id,
      name: c.name,
      status: c.status,
      clientId: c.agencyClientId ?? null,
      clientName: "clientName" in c ? (c as { clientName?: string }).clientName ?? null : null,
    })),
  });
});

/** POST /api/v1/press-releases — 보도자료+캠페인 생성 */
export const agencyPressReleasesHttp = httpAction(async (ctx, request) => {
  if (request.method === "OPTIONS") return json({}, 204);
  if (request.method !== "POST") return json({ error: "method not allowed" }, 405);

  const auth = await requireAgency(ctx, request);
  if (!auth) return json({ error: "unauthorized" }, 401);

  const body = (await request.json().catch(() => null)) as {
    clientId?: string;
    title?: string;
    body?: string;
    topicTags?: string[];
    headlines?: string[];
    who?: string;
    numbers?: string;
    quote?: string;
  } | null;

  if (!body?.clientId || !body.title?.trim() || !body.body?.trim()) {
    return json({ error: "clientId, title, body required" }, 400);
  }

  try {
    const result = await ctx.runMutation(internal.agency.createPressReleaseInternal, {
      ownerUserId: auth.ownerUserId,
      clientId: body.clientId as Id<"agencyClients">,
      title: body.title,
      body: body.body,
      topicTags: body.topicTags?.length ? body.topicTags : ["IT·스타트업"],
      headlines: body.headlines,
      who: body.who,
      numbers: body.numbers,
      quote: body.quote,
    });
    return json(result, 201);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "failed" }, 400);
  }
});
