import { Response, NextFunction } from "express";
import { AuthRequest } from "../middlewares/authMiddleware.js";
import * as DashboardService from "../services/dashboard.service.js";
import { ForbiddenError } from "../errors/index.js";

/**
 * Helper: Đảm bảo user đã đăng nhập và có role teacher.
 * Throws ForbiddenError nếu role không hợp lệ (UnauthorizedError đã
 * được authMiddleware xử lý trước đó nên req.user luôn tồn tại ở đây).
 */
const ensureTeacher = (req: AuthRequest): string => {
  if (req.user!.role !== "teacher") {
    throw new ForbiddenError("Chỉ Giáo viên mới có quyền truy cập Dashboard.");
  }
  return req.user!.userId;
};

/**
 * GET /api/v1/dashboard
 * Trả về toàn bộ dữ liệu dashboard (stats + classes + submissions + upcoming + activities).
 */
export const getDashboard = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const teacherId = ensureTeacher(req);
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    const data = await DashboardService.getTeacherDashboard(teacherId, limit);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/dashboard/stats
 * Trả về chỉ các số liệu tổng hợp (totalClasses, totalStudents, pendingGrades).
 * Nhẹ hơn, dùng để polling/refresh nhanh.
 */
export const getDashboardStats = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const teacherId = ensureTeacher(req);
    const data = await DashboardService.getDashboardStats(teacherId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/dashboard/submissions-to-grade
 * Trả về danh sách bài nộp cần chấm có phân trang.
 */
export const getPendingSubmissionsToGrade = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const teacherId = ensureTeacher(req);
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
    const data = await DashboardService.getPendingEssaySubmissionsPaginated(teacherId, page, limit);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};
