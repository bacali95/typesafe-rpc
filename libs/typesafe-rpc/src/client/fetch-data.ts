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
    let key, message, data;
    try {
      const parsedData = JSON.parse(error);
      key = parsedData.key || 'internalError';
      message = parsedData.message || 'Internal Server Error';
      data = parsedData.data;
    } catch {
      key = 'internalError';
      message = error;
    }
    if (typeof window !== 'undefined' && typeof window.document !== 'undefined') {
      throw new FetchError(key, message, response.status, data);
    }
    throw new Response(error, { status: response.status });
  }

  return response.json();
}
