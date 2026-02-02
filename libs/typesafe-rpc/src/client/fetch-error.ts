export class FetchError extends Error {
  constructor(
    message: string,
    public readonly key: string | undefined,
    public readonly status: number,
  ) {
    super(message);
  }
}
