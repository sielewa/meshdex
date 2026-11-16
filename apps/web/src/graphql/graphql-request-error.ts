export class GraphqlRequestError extends Error {
  constructor(
    message: string,
    /** Empty for transport failures. */
    readonly codes: readonly string[],
    readonly httpStatus: number,
  ) {
    super(message);
    this.name = 'GraphqlRequestError';
  }

  hasCode(code: string): boolean {
    return this.codes.includes(code);
  }
}
