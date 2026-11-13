/**
 * An error the client caused or is allowed to see. The error handler turns it
 * into the envelope `{status, error, errors?}`; anything else becomes a 500.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly errors?: string[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const unauthenticated = (message: string): ApiError => new ApiError(401, message);
export const forbidden = (message = 'Authorization error'): ApiError => new ApiError(403, message);
export const notFound = (message: string): ApiError => new ApiError(404, message);
export const conflict = (message: string): ApiError => new ApiError(409, message);
export const invalid = (errors: string[]): ApiError => new ApiError(422, 'Validation error', errors);

export const RETRY = 'Loan was changed by another request, retry';
