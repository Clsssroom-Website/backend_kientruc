import { Response, NextFunction } from "express";
import { AuthRequest } from "../middlewares/authMiddleware.js";
import { AssignmentFacade } from "../facades/assignment.facade.js";
import { UnauthorizedError, ForbiddenError } from "../errors/index.js";

/**
 * AssignmentController
 * ─────────────────────────────────────────────────────────────────────────────
 * Facade Pattern: Controller này chỉ biết đến AssignmentFacade.
 *
 * Controller chỉ lo:
 *   1. Xác thực role teacher
 *   2. Đọc và parse input từ Request (multipart JSON strings → objects)
 *   3. Gọi facade.method()
 *   4. Trả Response
 *
 * Không còn logic nghiệp vụ nào trong Controller:
 *   - Validate score/comment → đã chuyển vào Facade
 *   - Kiểm tra loại bài MULTIPLE_CHOICE → đã chuyển vào Facade
 *   - Truy cập repo trực tiếp → đã bị loại bỏ
 */
export class AssignmentController {
  constructor(private readonly facade: AssignmentFacade) {}

  // ─── Guard ─────────────────────────────────────────────────────────────────

  /** Xác nhận user đã đăng nhập và có role teacher, trả về teacherId */
  private ensureTeacher(req: AuthRequest): string {
    const user = req.user;
    if (!user?.userId) throw new UnauthorizedError("Vui lòng đăng nhập.");
    if (user.role !== "teacher")
      throw new ForbiddenError("Chỉ Giáo viên mới được thực hiện hành động này.");
    return user.userId;
  }

  // ─── Queries ───────────────────────────────────────────────────────────────

  /**
   * GET /api/v1/classes/:id/assignments
   * Lấy danh sách bài tập của lớp (chỉ teacher chủ lớp).
   */
  getAssignments = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const teacherId = this.ensureTeacher(req);
      const data = await this.facade.getAssignments(teacherId, req.params.id as string);
      res.status(200).json({ success: true, message: "Lấy danh sách bài tập thành công!", data });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/classes/:id/assignments/:assignmentId
   * Lấy chi tiết bài tập kèm quiz questions + isCorrect (chỉ teacher).
   */
  getAssignmentDetail = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const teacherId = this.ensureTeacher(req);
      const data = await this.facade.getAssignmentDetail(teacherId, req.params.assignmentId as string);
      res.status(200).json({ success: true, message: "Lấy chi tiết bài tập thành công!", data });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/classes/:id/assignments/:assignmentId/submissions
   * Lấy danh sách bài nộp của học sinh (chỉ teacher chủ lớp).
   */
  getSubmissions = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const teacherId = this.ensureTeacher(req);
      const data = await this.facade.getSubmissions(teacherId, req.params.assignmentId as string);
      res.status(200).json({ success: true, message: "Lấy danh sách bài nộp thành công!", data });
    } catch (error) {
      next(error);
    }
  };

  // ─── Mutations ─────────────────────────────────────────────────────────────

  /**
   * POST /api/v1/classes/:id/assignments
   * Tạo bài tập mới (chỉ teacher chủ lớp).
   * Body (multipart/form-data):
   *   - title, description?, deadline, typeAssignment?
   *   - questions?: JSON string — bắt buộc nếu typeAssignment = "MULTIPLE_CHOICE"
   *   - files?: file đính kèm (chỉ ESSAY)
   */
  createAssignment = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const teacherId = this.ensureTeacher(req);
      const classId = req.params.id as string;
      const { title, description, deadline, typeAssignment } = req.body;

      // Parse questions từ JSON string (multipart/form-data)
      let questions: any[] | undefined;
      if (req.body.questions !== undefined) {
        questions =
          typeof req.body.questions === "string"
            ? JSON.parse(req.body.questions)
            : req.body.questions;
      }

      const data = await this.facade.createAssignment(teacherId, classId, {
        title,
        description,
        deadline,
        typeAssignment,
        questions,
        files: req.files as Express.Multer.File[] | undefined,
      });

      res.status(201).json({ success: true, message: "Tạo bài tập thành công!", data });
    } catch (error) {
      next(error);
    }
  };

  /**
   * PUT /api/v1/classes/:id/assignments/:assignmentId
   * Cập nhật bài tập (chỉ teacher chủ lớp).
   * Body (multipart/form-data):
   *   - title?, description?, deadline?, typeAssignment?
   *   - questions?: JSON string
   *   - keepAttachmentIds?: JSON string (array of IDs giữ lại)
   *   - files?: file đính kèm mới
   */
  updateAssignment = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const teacherId = this.ensureTeacher(req);
      const assignmentId = req.params.assignmentId as string;
      const { title, description, deadline, typeAssignment } = req.body;

      // Parse keepAttachmentIds
      let keepAttachmentIds: string[] | undefined;
      if (req.body.keepAttachmentIds !== undefined) {
        keepAttachmentIds =
          typeof req.body.keepAttachmentIds === "string"
            ? JSON.parse(req.body.keepAttachmentIds)
            : req.body.keepAttachmentIds;
      }

      // Parse questions
      let questions: any[] | undefined;
      if (req.body.questions !== undefined) {
        questions =
          typeof req.body.questions === "string"
            ? JSON.parse(req.body.questions)
            : req.body.questions;
      }

      const data = await this.facade.updateAssignment(teacherId, assignmentId, {
        title,
        description,
        deadline,
        typeAssignment,
        questions,
        keepAttachmentIds,
        files: req.files as Express.Multer.File[] | undefined,
      });

      res.status(200).json({ success: true, message: "Cập nhật bài tập thành công!", data });
    } catch (error) {
      next(error);
    }
  };

  /**
   * DELETE /api/v1/classes/:id/assignments/:assignmentId
   * Xóa bài tập (chỉ teacher chủ lớp).
   */
  deleteAssignment = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const teacherId = this.ensureTeacher(req);
      await this.facade.deleteAssignment(teacherId, req.params.assignmentId as string);
      res.status(200).json({ success: true, message: "Xóa bài tập thành công!" });
    } catch (error) {
      next(error);
    }
  };

  /**
   * DELETE /api/v1/classes/:id/assignments/:assignmentId/attachments/:attachmentId
   * Xóa một file đính kèm đơn lẻ (chỉ teacher chủ lớp).
   */
  deleteAttachment = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const teacherId = this.ensureTeacher(req);
      await this.facade.deleteAttachment(
        teacherId,
        req.params.assignmentId as string,
        req.params.attachmentId as string
      );
      res.status(200).json({ success: true, message: "Xóa file đính kèm thành công!" });
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/classes/:id/assignments/:assignmentId/submissions/:submissionId/grade
   * Chấm điểm bài nộp tự luận (chỉ teacher chủ lớp).
   * Facade kiểm tra loại bài và validate score/comment — Controller không cần lo.
   * Body: { score: number (0-10), comment?: string (max 1000 ký tự) }
   */
  gradeSubmission = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const teacherId = this.ensureTeacher(req);
      await this.facade.gradeSubmission(
        teacherId,
        req.params.assignmentId as string,
        req.params.submissionId as string,
        { score: req.body.score, comment: req.body.comment }
      );
      res.status(200).json({ success: true, message: "Chấm điểm thành công!" });
    } catch (error) {
      next(error);
    }
  };
}

// ─── Singleton instance (dùng trong Routes) ──────────────────────────────────
export const assignmentController = new AssignmentController(new AssignmentFacade());
