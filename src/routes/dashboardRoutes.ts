import { Router } from "express";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { getDashboard, getDashboardStats, getPendingSubmissionsToGrade } from "../controllers/dashboardController.js";

const router = Router();

// Tất cả route dashboard yêu cầu xác thực
router.use(authMiddleware);

/**
 * GET /api/v1/dashboard
 * Lấy toàn bộ dữ liệu dashboard của giáo viên đang đăng nhập.
 *
 * Response:
 * {
 *   success: true,
 *   data: {
 *     stats: { totalClasses, totalStudents, pendingGrades },
 *     classes: ClassSummaryDTO[],
 *     pendingSubmissions: SubmissionToGradeDTO[],
 *     upcomingAssignments: UpcomingAssignmentDTO[],
 *     recentActivities: RecentActivityDTO[]
 *   }
 * }
 */
router.get("/", getDashboard);

/**
 * GET /api/v1/dashboard/stats
 * Chỉ lấy số liệu tổng hợp (nhẹ hơn, dùng để refresh nhanh).
 *
 * Response:
 * {
 *   success: true,
 *   data: { totalClasses, totalStudents, pendingGrades }
 * }
 */
router.get("/stats", getDashboardStats);

/**
 * GET /api/v1/dashboard/submissions-to-grade
 * Lấy danh sách bài nộp chưa chấm của giáo viên đang đăng nhập có phân trang.
 */
router.get("/submissions-to-grade", getPendingSubmissionsToGrade);

export default router;
