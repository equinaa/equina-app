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
    const status = typeof candidate.status === "number" ? candidate.status : 0;
    // supabase-js reports a request that never got an answer as a retryable
    // fetch error with status 0. Name it, so callers can say "no connection"
    // without guessing from a status that a plain Error also lacks.
    const code = typeof candidate.code === "string"
      ? candidate.code
      : candidate.name === "AuthRetryableFetchError" && status === 0
        ? networkUnreachable
        : "backend_error";
    return new EquinaBackendError(message, code, status === 0 || status >= 500);
  }
  return new EquinaBackendError(fallback);
};

export const requireData = <T>(data: T | null, error: unknown, fallback: string): T => {
  if (error) throw backendError(error, fallback);
  if (data === null) throw new EquinaBackendError(fallback, "missing_data");
  return data;
};

