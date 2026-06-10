import { Response, NextFunction } from "express";
import { AuthRequest } from "../middlewares/authMiddleware.js";
import { DashboardFacade } from "../facades/dashboard.facade.js";
import { ForbiddenError } from "../errors/index.js";

/**
 * DashboardController
 * ─────────────────────────────────────────────────────────────────────────────
 * Facade Pattern: Controller này chỉ biết đến DashboardFacade.
 *
 * Controller chỉ lo:
 *   1. Xác thực role teacher
 *   2. Parse query params (limit, page)
 *   3. Gọi facade.method()
 *   4. Trả Response
 */
export class DashboardController {
  constructor(private readonly facade: DashboardFacade) {}

  // ─── Guard ─────────────────────────────────────────────────────────────────

  /** Xác nhận user có role teacher, trả về teacherId */
  private ensureTeacher(req: AuthRequest): string {
    if (req.user!.role !== "teacher") {
      throw new ForbiddenError("Chỉ Giáo viên mới có quyền truy cập Dashboard.");
    }
    return req.user!.userId;
  }

  // ─── Handlers ──────────────────────────────────────────────────────────────

  /**
   * GET /api/v1/dashboard
   * Lấy toàn bộ dữ liệu Dashboard của giáo viên (stats + classes + submissions + upcoming + activities).
   * Query: ?limit=10 — số bài nộp chờ chấm tối đa (tuỳ chọn)
   */
  getDashboard = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const teacherId = this.ensureTeacher(req);
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
      const data = await this.facade.getTeacherDashboard(teacherId, limit);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/dashboard/stats
   * Chỉ lấy số liệu tổng hợp — nhẹ hơn, dùng để polling/refresh widget nhanh.
   * Trả về: { totalClasses, totalStudents, pendingGrades }
   */
  getDashboardStats = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const teacherId = this.ensureTeacher(req);
      const data = await this.facade.getDashboardStats(teacherId);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/dashboard/submissions-to-grade
   * Lấy danh sách bài nộp ESSAY chưa có điểm, kèm phân trang và presigned URL.
   * Query: ?page=1&limit=10
   */
  getPendingSubmissionsToGrade = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const teacherId = this.ensureTeacher(req);
      const page  = req.query.page  ? parseInt(req.query.page  as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
      const data = await this.facade.getPendingEssaySubmissionsPaginated(teacherId, page, limit);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };
}

// ─── Singleton instance (dùng trong Routes) ──────────────────────────────────
export const dashboardController = new DashboardController(new DashboardFacade());
