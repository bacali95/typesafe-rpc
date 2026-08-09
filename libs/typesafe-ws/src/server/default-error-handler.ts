import type { WsErrorPayload } from '../shared';

export async function defaultErrorHandler(error: unknown): Promise<WsErrorPayload> {
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
