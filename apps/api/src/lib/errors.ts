export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly title: string,
    detail?: string,
  ) {
    super(detail ?? title);
    this.name = new.target.name;
  }
}

export class BadRequestError extends AppError {
  constructor(detail?: string) {
    super(400, 'Bad Request', detail);
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
  constructor(detail?: string) {
    super(409, 'Conflict', detail);
  }
}
