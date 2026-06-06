import { type Request, type Response, type NextFunction } from "express";

export const notFoundHandler = (req: Request, res: Response, _next: NextFunction) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found.`,
    code: "ROUTE_NOT_FOUND",
    errors: []
  });
};