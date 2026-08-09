import type { RpcWsErrorPayload } from '../shared';

export async function defaultWsErrorHandler(error: unknown): Promise<RpcWsErrorPayload> {
  if (error instanceof Response) {
    const text = await error.text();
    try {
      const parsed = JSON.parse(text);
      return {
        key: parsed.key ?? 'internalError',
        message: parsed.message ?? 'Internal Server Error',
        status: error.status,
        data: parsed.data,
        issues: parsed.issues,
      };
    } catch {
      return {
        key: 'internalError',
        message: text || 'Internal Server Error',
        status: error.status,
      };
    }
  }

  return { key: 'internalError', message: 'Internal Server Error' };
}
