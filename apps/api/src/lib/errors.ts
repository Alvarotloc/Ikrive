/** One problem of an invalid input, listed in the `errors` member of the problem details. */
export interface ProblemError {
  path: string;
  message: string;
}

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly title: string,
    detail?: string,
    readonly errors?: ProblemError[],
    /** `type` of the problem details: a URI that identifies the kind of problem for clients. */
    readonly type = 'about:blank',
  ) {
    super(detail ?? title);
    this.name = new.target.name;
  }
}

export class BadRequestError extends AppError {
  constructor(detail?: string, errors?: ProblemError[]) {
    super(400, 'Bad Request', detail, errors);
  }
}

export class UnauthorizedError extends AppError {
  constructor(detail?: string) {
    super(401, 'Unauthorized', detail);
  }
}

export class ForbiddenError extends AppError {
  constructor(detail?: string) {
    super(403, 'Forbidden', detail);
  }
}

export class NotFoundError extends AppError {
  constructor(detail?: string) {
    super(404, 'Not Found', detail);
  }
}

export class ConflictError extends AppError {
  constructor(detail?: string, { type }: { type?: string } = {}) {
    super(409, 'Conflict', detail, undefined, type);
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(detail?: string) {
    super(413, 'Payload Too Large', detail);
  }
}

export class UnsupportedMediaTypeError extends AppError {
  constructor(detail?: string) {
    super(415, 'Unsupported Media Type', detail);
  }
}
