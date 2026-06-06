import { Response, NextFunction } from "express";
import { AuthRequest } from "./authMiddleware.js";

export const requireRole = (allowedRoles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, message: "Yêu cầu xác thực!" });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ success: false, message: "Bạn không có quyền truy cập!" });
      return;
    }

    next();
  };
};
