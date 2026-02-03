export class FetchError extends Error {
  constructor(
    public readonly key: string,
    message: string,
    public readonly status: number,
    public readonly data?: any,
  ) {
    super(message);
  }
}
