import type { Fetch } from "../web";

export class GoogleError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Calls a Google endpoint and reads its JSON. A non-2xx answer throws a GoogleError. */
export async function call<T>(
  fetcher: Fetch,
  url: string,
  init: RequestInit,
): Promise<T> {
  const response = await fetcher(url, init);
  if (!response.ok)
    throw new GoogleError(
      response.status,
      `Google ${init.method ?? "GET"} ${new URL(url).pathname}: ${response.status} ${await response.text()}`,
    );

  return (response.status === 204 ? undefined : await response.json()) as T;
}

export const form = (fields: Record<string, string>): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(fields),
});

/** Google answers 404 or 410 for an entry someone deleted. */
export const gone = (error: unknown) =>
  error instanceof GoogleError && [404, 410].includes(error.status);
