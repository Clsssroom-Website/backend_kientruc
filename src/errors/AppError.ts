export class AppError extends Error {
  public statusCode: number;
  public code: string;
  public details: any[] | null;

  constructor(message: string, statusCode: number, code: string, details: any[] | null = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequestError extends AppError {
  constructor(message: string = "Bad Request", details: any[] | null = null) {
    super(message, 400, "BAD_REQUEST", details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = "Unauthorized", details: any[] | null = null) {
    super(message, 401, "UNAUTHORIZED", details);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = "Forbidden", details: any[] | null = null) {
    super(message, 403, "FORBIDDEN", details);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = "Not Found", details: any[] | null = null) {
    super(message, 404, "NOT_FOUND", details);
  }
}

export class ConflictError extends AppError {
  constructor(message: string = "Conflict", details: any[] | null = null) {
    super(message, 409, "CONFLICT", details);
  }
}

export class ValidationError extends AppError {
  constructor(message: string = "Validation Error", details: any[] | null = null) {
    super(message, 422, "VALIDATION_ERROR", details);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message: string = "Too Many Requests", details: any[] | null = null) {
    super(message, 429, "TOO_MANY_REQUESTS", details);
  }
}

export class InternalServerError extends AppError {
  constructor(message: string = "Internal Server Error", details: any[] | null = null) {
    super(message, 500, "INTERNAL_SERVER_ERROR", details);
  }
}

export const isAppError = (err: any): err is AppError => {
  return err instanceof AppError;
};