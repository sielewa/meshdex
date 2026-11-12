/** A GraphQL request that returned errors, or a non-GraphQL HTTP failure. */
export class GraphqlRequestError extends Error {
  constructor(
    message: string,
    /** `extensions.code` of every returned error; empty for transport failures. */
    readonly codes: readonly string[],
    /** HTTP status of the response. */
    readonly httpStatus: number,
  ) {
    super(message);
    this.name = 'GraphqlRequestError';
  }

  hasCode(code: string): boolean {
    return this.codes.includes(code);
  }
}
