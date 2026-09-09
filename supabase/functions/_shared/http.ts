export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, stripe-signature, x-client-info, x-request-id",
  "Access-Control-Expose-Headers": "x-request-id",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

export class HttpError extends Error {
  constructor(public readonly status: number, message: string, public readonly code = "request_failed") {
    super(message);
  }
}

export const requestIdFor = (request: Request) => {
  const incoming = request.headers.get("x-request-id")?.trim() ?? "";
  return /^[a-zA-Z0-9-]{8,80}$/.test(incoming) ? incoming : crypto.randomUUID();
};

export const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "x-request-id": crypto.randomUUID(),
      ...headers,
    },
  });

export const handleOptions = (request: Request) =>
  request.method === "OPTIONS"
    ? new Response("ok", { headers: { ...corsHeaders, "x-request-id": requestIdFor(request) } })
    : null;

export const requireMethod = (request: Request, method: "GET" | "POST") => {
  if (request.method !== method) throw new HttpError(405, `Use ${method}.`, "method_not_allowed");
};

export const readJson = async <T>(request: Request): Promise<T> => {
  try {
    const declaredLength = Number(request.headers.get("content-length") ?? "0");
    if (declaredLength > 65_536) throw new HttpError(413, "Request body is too large.", "request_too_large");
    const source = await request.text();
    if (new TextEncoder().encode(source).byteLength > 65_536) throw new HttpError(413, "Request body is too large.", "request_too_large");
    return JSON.parse(source) as T;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "Request body must be valid JSON.", "invalid_json");
  }
};

const captureServerError = async (
  candidate: { name?: unknown; code?: unknown } | null,
  requestId: string,
  functionName: string,
) => {
  const errorName = typeof candidate?.name === "string" ? candidate.name.slice(0, 80) : "UnknownError";
  const errorCode = typeof candidate?.code === "string" ? candidate.code.slice(0, 80) : "internal_error";
  console.error("Edge request failed", {
    request_id: requestId,
    function_name: functionName,
    error_name: errorName,
    error_code: errorCode,
  });

  const dsn = Deno.env.get("SENTRY_DSN");
  if (!dsn) return;
  try {
    const parsed = new URL(dsn);
    const projectId = parsed.pathname.replaceAll("/", "");
    if (!projectId || !parsed.username) return;
    const eventId = crypto.randomUUID().replaceAll("-", "");
    const endpoint = `${parsed.protocol}//${parsed.host}/api/${projectId}/envelope/`;
    const envelope = [
      JSON.stringify({ event_id: eventId, dsn }),
      JSON.stringify({ type: "event" }),
      JSON.stringify({
        event_id: eventId,
        level: "error",
        message: "Equina Edge request failed",
        tags: {
          function_name: functionName,
          error_name: errorName,
          error_code: errorCode,
        },
        extra: { request_id: requestId },
      }),
    ].join("\n");
    await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-sentry-envelope" },
      body: envelope,
      signal: AbortSignal.timeout(2_000),
    });
  } catch {
    // Observability must never change the user-facing request outcome.
  }
};

export const respondToError = async (
  error: unknown,
  requestId: string = crypto.randomUUID(),
  functionName = "unknown",
) => {
  const responseHeaders = { "x-request-id": requestId };
  if (error instanceof HttpError) {
    return json({ error: error.message, code: error.code, requestId }, error.status, responseHeaders);
  }
  const candidate = error as { name?: unknown; code?: unknown } | null;
  await captureServerError(candidate, requestId, functionName);
  return json(
    { error: "The request could not be completed.", code: "internal_error", requestId },
    500,
    responseHeaders,
  );
};
