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
    const error = await response.text();
    let key, message;
    try {
      const data = JSON.parse(error);
      key = data.key;
      message = data.message;
    } catch {
      message = error;
    }
    throw new FetchError(message, key, response.status);
  }

  return response.json();
}
