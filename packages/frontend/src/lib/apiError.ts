/**
 * A failed API response: the server's own message plus its HTTP status.
 * Kept apart from api.ts so tests that mock the API client still get the real class.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
