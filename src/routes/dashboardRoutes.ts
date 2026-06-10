import { Router } from "express";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { dashboardController } from "../controllers/dashboardController.js";

const router = Router();

// Tất cả route dashboard yêu cầu xác thực
router.use(authMiddleware);

/**
 * GET /api/v1/dashboard
 * Lấy toàn bộ dữ liệu Dashboard của giáo viên đang đăng nhập.
 * Query: ?limit=10 — số bài nộp chờ chấm tối đa
 *
 * Response: { success, data: { stats, classes, pendingSubmissions, upcomingAssignments, recentActivities } }
 */
router.get("/", dashboardController.getDashboard);

/**
 * GET /api/v1/dashboard/stats
 * Chỉ lấy số liệu tổng hợp (nhẹ hơn, dùng để refresh nhanh).
 *
 * Response: { success, data: { totalClasses, totalStudents, pendingGrades } }
 */
router.get("/stats", dashboardController.getDashboardStats);

/**
 * GET /api/v1/dashboard/submissions-to-grade
 * Lấy danh sách bài nộp ESSAY chưa có điểm kèm phân trang.
 * Query: ?page=1&limit=10
 */
router.get("/submissions-to-grade", dashboardController.getPendingSubmissionsToGrade);

export default router;
