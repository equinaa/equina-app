export class EquinaBackendError extends Error {
  constructor(
    message: string,
    public readonly code = "backend_error",
    public readonly retryable = false
  ) {
    super(message);
    this.name = "EquinaBackendError";
  }
}

export const networkUnreachable = "network_unreachable";

export const backendError = (error: unknown, fallback: string): EquinaBackendError => {
  if (error instanceof EquinaBackendError) return error;
  if (error && typeof error === "object") {
    const candidate = error as { message?: unknown; code?: unknown; status?: unknown; name?: unknown };
    const message = typeof candidate.message === "string" ? candidate.message : fallback;
    const status = typeof candidate.status === "number" ? candidate.status : undefined;
    // supabase-js reports a request that never got an answer as a retryable
    // fetch error with status 0. Name it, so callers can say "no connection"
    // without guessing from a status that a plain Error also lacks.
    const code = typeof candidate.code === "string"
      ? candidate.code
      : candidate.name === "AuthRetryableFetchError" && status === 0
        ? networkUnreachable
        : "backend_error";
    // Only a server's answer, or a request that got none, says anything about
    // the connection. A failure inside the app -- a native module, a storage
    // read -- carries no status, and retrying it would not help.
    return new EquinaBackendError(message, code, status !== undefined && (status === 0 || status >= 500));
  }
  return new EquinaBackendError(fallback);
};

/**
 * What an edge function said when it refused.
 *
 * supabase-js reports any non-2xx answer as "Edge Function returned a
 * non-2xx status code" and keeps the body on `context`. Every function here
 * answers with `{ error, code }`, and the code is what a screen needs: a
 * lesson still encoding and a lesson that is gone call for different words.
 * A request that never got an answer is named as offline, like auth does.
 */
export const edgeFailure = async (error: unknown, fallback: string): Promise<EquinaBackendError> => {
  const candidate = error as { name?: unknown; context?: unknown } | null;
  if (candidate?.name === "FunctionsFetchError") {
    return new EquinaBackendError(fallback, networkUnreachable, true);
  }
  const response = candidate?.context as { status?: unknown; json?: unknown } | undefined;
  if (candidate?.name === "FunctionsHttpError" && response && typeof response.json === "function") {
    try {
      const body = (await (response.json as () => Promise<unknown>)()) as { error?: unknown; code?: unknown } | null;
      const status = typeof response.status === "number" ? response.status : 0;
      if (body && typeof body.code === "string") {
        return new EquinaBackendError(
          typeof body.error === "string" ? body.error : fallback,
          body.code,
          status === 0 || status >= 500
        );
      }
    } catch {
      // An answer without a readable body says no more than the status.
    }
  }
  return backendError(error, fallback);
};

export const requireData = <T>(data: T | null, error: unknown, fallback: string): T => {
  if (error) throw backendError(error, fallback);
  if (data === null) throw new EquinaBackendError(fallback, "missing_data");
  return data;
};

