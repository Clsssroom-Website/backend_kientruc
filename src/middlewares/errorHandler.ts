import { type NextFunction, type Request, type Response } from "express";
import { isAppError } from "../errors/index.js";

// Global error handler middleware
const errorHandler = (err: any, _req: Request, res: Response, _next: NextFunction) => {
  // 1. Custom AppError subclasses: Handle known application errors
  if (isAppError(err)) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      code: err.code,
      errors: err.details || [],
    });
  }

  // 2. ORM/Database errors (Prisma): Map known Prisma errors to HTTP status codes
  if (err.name === "PrismaClientKnownRequestError") {
    // P2002: Unique constraint failed
    if (err.code === "P2002") {
      return res.status(409).json({
        success: false,
        message: "A record with this value already exists.",
        code: "CONFLICT",
        errors: [err.meta],
      });
    }
    // P2025: Record to update/delete not found
    if (err.code === "P2025") {
      return res.status(404).json({
        success: false,
        message: "Database record not found.",
        code: "NOT_FOUND",
        errors: [err.meta],
      });
    }
  }

  // 3. Fallback: Catch-all for unhandled errors
  const isDev = process.env.NODE_ENV === "development";
  return res.status(500).json({
    success: false,
    message: isDev ? err.message : "Internal Server Error",
    code: "INTERNAL_SERVER_ERROR",
    errors: isDev ? [{ name: err.name, stack: err.stack }] : [],
  });
};

export default errorHandler;