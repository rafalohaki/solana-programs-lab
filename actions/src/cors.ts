/** CORS + chain-id headers required by the Solana Actions spec. */
export function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, Content-Encoding, Accept-Encoding, X-Action-Version, X-Blockchain-Ids, X-Action-Chain-Id",
    "Content-Type": "application/json",
  };
}

export function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...corsHeaders(), ...(init?.headers ?? {}) },
  });
}

/** Preflight handler — wire as `export const OPTIONS = optionsResponse` in Next.js. */
export function optionsResponse(): Response {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export function badRequest(message: string): Response {
  return jsonResponse({ error: message }, { status: 400 });
}
