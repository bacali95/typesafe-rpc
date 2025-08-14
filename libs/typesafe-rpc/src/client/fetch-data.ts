import { FetchError } from './fetch-error';

export async function fetchData<T>(
  url: string,
  method = 'GET',
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(url, {
    method,
    body: body
      ? typeof body === 'string' || body instanceof FormData
        ? body
        : JSON.stringify(body)
      : undefined,
    headers:
      body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : undefined,
    signal,
  });

  if (!response.ok) {
    throw new FetchError(await response.text(), response.status);
  }

  return response.json();
}
