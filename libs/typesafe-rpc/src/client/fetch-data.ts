import { FetchError } from './fetch-error';

export async function fetchData<T>(
  url: string,
  method = 'GET',
  { body, headers, signal }: RequestInit = {},
): Promise<T> {
  const response = await fetch(url, {
    method,
    body,
    headers:
      body && !(body instanceof FormData)
        ? { 'Content-Type': 'application/json', ...headers }
        : headers,
    signal,
  });

  if (!response.ok) {
    throw new FetchError(await response.text(), response.status);
  }

  return response.json();
}
