/**
 * Transport layer: the single place that knows where the Margo API lives and
 * how it answers. It knows nothing about individual endpoints — those live in
 * `endpoints.ts` as a map that grows with the API.
 */
export const API_BASE = "/api/v1";

/**
 * The backend isn't running yet, so routes fall back to the `mock` defined
 * next to them. Start the API and flip this to `false` — nothing else changes.
 */
export const USE_MOCKS = true;

export type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

/**
 * One API route. Add an entry to the map in `endpoints.ts` to grow the API;
 * drop the `mock` once the real route exists.
 */
export type Endpoint<TBody = unknown, TResult = unknown> = {
  method: HttpMethod;
  path: string;
  mock?: (body: TBody) => TResult | Promise<TResult>;
};

/** Thrown for any failed request so callers only handle one error type. */
export class ApiError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 0, code = "request_failed") {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

type Envelope<T> = {
  data?: T;
  error?: { code?: string; message?: string };
};

/** Send `body` to `endpoint` — via its mock, or the real API once it exists. */
export async function call<TBody, TResult>(
  endpoint: Endpoint<TBody, TResult>,
  body: TBody,
): Promise<TResult> {
  if (USE_MOCKS && endpoint.mock) {
    return endpoint.mock(body);
  }

  const response = await fetch(`${API_BASE}${endpoint.path}`, {
    method: endpoint.method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const payload = (await response
    .json()
    .catch(() => null)) as Envelope<TResult> | null;

  if (!response.ok || payload?.error) {
    throw new ApiError(
      payload?.error?.message ?? "Something went wrong. Please try again.",
      response.status,
      payload?.error?.code,
    );
  }

  return payload?.data as TResult;
}
