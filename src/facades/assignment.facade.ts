import { AssignmentService } from "../services/assignment.service.js";
import { BadRequestError } from "../errors/index.js";

/**
 * AssignmentFacade
 * ─────────────────────────────────────────────────────────────────────────────
 * Facade Pattern: cung cấp một giao diện đơn giản, thống nhất cho toàn bộ
 * nghiệp vụ Bài Tập (Assignment).
 *
 * Controller chỉ phụ thuộc vào AssignmentFacade — không import AssignmentService
 * hay truy cập repo trực tiếp.
 *
 * Sơ đồ:
 *   AssignmentController
 *       └── AssignmentFacade ──► AssignmentService (CRUD bài tập, nộp bài, chấm điểm)
 *
 * Điểm khác biệt so với Controller cũ:
 *   - Kiểm tra loại bài (MULTIPLE_CHOICE) trước khi chấm thủ công nằm ở Facade
 *     thay vì Controller truy cập assignmentService["assignmentRepo"] trực tiếp.
 *   - Validate score/comment nằm ở Facade (thuộc nghiệp vụ), không nằm ở Controller.
 */
export class AssignmentFacade {
  private readonly service: AssignmentService;

  constructor() {
    // AssignmentService tự khởi tạo repo + storage bên trong
    this.service = new AssignmentService();
  }

  // ─── Queries ───────────────────────────────────────────────────────────────

  /**
   * Lấy danh sách bài tập của một lớp học (chỉ teacher chủ lớp).
   */
  async getAssignments(teacherId: string, classId: string) {
    return this.service.getAssignmentsByClassId(teacherId, classId);
  }

  /**
   * Lấy chi tiết một bài tập kèm câu hỏi trắc nghiệm (có isCorrect — chỉ teacher).
   */
  async getAssignmentDetail(teacherId: string, assignmentId: string) {
    return this.service.getAssignmentById(teacherId, assignmentId);
  }

  /**
   * Lấy danh sách bài nộp của học sinh cho một bài tập (chỉ teacher chủ lớp).
   */
  async getSubmissions(teacherId: string, assignmentId: string) {
    return this.service.getSubmissionsByAssignmentId(teacherId, assignmentId);
  }

  // ─── Mutations ─────────────────────────────────────────────────────────────

  /**
   * Tạo bài tập mới — chỉ teacher chủ lớp.
   * Nếu typeAssignment = "MULTIPLE_CHOICE" thì bắt buộc phải có questions[].
   * File đính kèm được upload lên MinIO bên trong AssignmentService.
   */
  async createAssignment(
    teacherId: string,
    classId: string,
    data: {
      title: string;
      description?: string;
      deadline: string;
      typeAssignment?: string;
      questions?: any[];
      files?: Express.Multer.File[];
    }
  ) {
    return this.service.createAssignment(teacherId, classId, data);
  }

  /**
   * Cập nhật bài tập — chỉ teacher chủ lớp.
   * Hỗ trợ cập nhật thông tin, câu hỏi, file đính kèm (keepAttachmentIds).
   */
  async updateAssignment(
    teacherId: string,
    assignmentId: string,
    data: {
      title?: string;
      description?: string;
      deadline?: string;
      typeAssignment?: string;
      questions?: any[];
      keepAttachmentIds?: string[];
      files?: Express.Multer.File[];
    }
  ) {
    return this.service.updateAssignment(teacherId, assignmentId, data);
  }

  /**
   * Xóa bài tập — chỉ teacher chủ lớp.
   * Không thể xóa nếu đã có học sinh nộp bài.
   */
  async deleteAssignment(teacherId: string, assignmentId: string) {
    return this.service.deleteAssignment(teacherId, assignmentId);
  }

  /**
   * Xóa một file đính kèm đơn lẻ — chỉ teacher chủ lớp.
   */
  async deleteAttachment(teacherId: string, assignmentId: string, attachmentId: string) {
    return this.service.deleteAttachment(teacherId, assignmentId, attachmentId);
  }

  /**
   * Chấm điểm bài nộp tự luận (ESSAY) — chỉ teacher chủ lớp.
   *
   * Facade thực hiện kiểm tra nghiệp vụ:
   *   1. Validate score (0–10) và comment (max 1000 ký tự)
   *   2. Kiểm tra loại bài — bài MULTIPLE_CHOICE không thể chấm thủ công
   *      (Facade dùng public method thay vì truy cập repo trực tiếp như Controller cũ)
   */
  async gradeSubmission(
    teacherId: string,
    assignmentId: string,
    submissionId: string,
    payload: { score: number | string; comment?: string }
  ) {
    // ── 1. Validate score ──────────────────────────────────────────────────────
    const parsedScore = parseFloat(String(payload.score));
    if (isNaN(parsedScore) || parsedScore < 0 || parsedScore > 10) {
      throw new BadRequestError("Điểm số phải là số từ 0 đến 10.");
    }
    const roundedScore = Math.round(parsedScore * 100) / 100;

    // ── 2. Validate comment ────────────────────────────────────────────────────
    if (payload.comment !== undefined && payload.comment !== null) {
      if (typeof payload.comment !== "string") {
        throw new BadRequestError("Nhận xét không hợp lệ.");
      }
      if (payload.comment.length > 1000) {
        throw new BadRequestError("Nhận xét không được vượt quá 1000 ký tự.");
      }
    }

    // ── 3. Kiểm tra loại bài qua public method (không truy cập repo trực tiếp) ─
    const assignmentDetail = await this.service.getAssignmentById(teacherId, assignmentId);
    if (assignmentDetail?.typeAssignment === "MULTIPLE_CHOICE") {
      throw new BadRequestError(
        "Bài trắc nghiệm được chấm điểm tự động, không thể chấm thủ công."
      );
    }

    // ── 4. Thực hiện chấm điểm ────────────────────────────────────────────────
    return this.service.gradeSubmission(teacherId, assignmentId, submissionId, {
      score: roundedScore,
      comment: payload.comment?.trim(),
    });
  }
}
