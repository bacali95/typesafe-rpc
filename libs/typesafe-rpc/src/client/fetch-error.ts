import { core } from 'zod';

export class FetchError extends Error {
  constructor(
    public readonly key: string,
    message: string,
    public readonly status: number,
    public readonly data?: any,
    public readonly issues?: core.$ZodIssue[],
  ) {
    super(message);
  }
}
