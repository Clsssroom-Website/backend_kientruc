import * as DashboardService from "../services/dashboard.service.js";

/**
 * DashboardFacade
 * ─────────────────────────────────────────────────────────────────────────────
 * Facade Pattern: cung cấp giao diện đơn giản, thống nhất cho toàn bộ
 * nghiệp vụ Dashboard của Giáo Viên.
 *
 * Controller chỉ phụ thuộc vào DashboardFacade — không import DashboardService trực tiếp.
 *
 * Sơ đồ:
 *   DashboardController
 *       └── DashboardFacade ──► DashboardService (stats, classes, submissions, activities)
 *
 * Lưu ý: DashboardService bản thân đã là một "service facade" orchestrating nhiều
 * DashboardRepo calls song song. DashboardFacade ở đây bổ sung thêm lớp cách ly
 * giữa Controller và Service layer.
 */
export class DashboardFacade {

  /**
   * Lấy toàn bộ dữ liệu trang Dashboard của giáo viên trong một lần gọi.
   * Bao gồm: stats, danh sách lớp, bài chờ chấm, bài sắp hết hạn, hoạt động gần đây.
   *
   * @param teacherId  ID giáo viên đang đăng nhập
   * @param limit      Số lượng bài nộp chờ chấm tối đa (mặc định 10)
   */
  async getTeacherDashboard(teacherId: string, limit?: number) {
    return DashboardService.getTeacherDashboard(teacherId, limit);
  }

  /**
   * Chỉ lấy số liệu tổng hợp (stats) — nhẹ hơn, dùng để polling/refresh widget.
   * Trả về: { totalClasses, totalStudents, pendingGrades }
   */
  async getDashboardStats(teacherId: string) {
    return DashboardService.getDashboardStats(teacherId);
  }

  /**
   * Lấy danh sách bài nộp ESSAY chưa có điểm kèm phân trang.
   * Có sinh presigned URL cho file đính kèm của từng bài nộp.
   *
   * @param teacherId  ID giáo viên đang đăng nhập
   * @param page       Trang hiện tại (mặc định 1)
   * @param limit      Số bản ghi mỗi trang (mặc định 10)
   */
  async getPendingEssaySubmissionsPaginated(teacherId: string, page = 1, limit = 10) {
    return DashboardService.getPendingEssaySubmissionsPaginated(teacherId, page, limit);
  }
}
