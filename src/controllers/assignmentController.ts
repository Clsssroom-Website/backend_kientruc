import { Response, NextFunction } from "express";
import { AuthRequest } from "../middlewares/authMiddleware.js";
import { AssignmentService } from "../services/assignment.service.js";
import { BadRequestError, ForbiddenError, UnauthorizedError } from "../errors/index.js";

const assignmentService = new AssignmentService();

// ─── Guards ───────────────────────────────────────────────────────────────────

/** Lấy teacherId và xác thực role teacher */
const ensureTeacher = (req: AuthRequest): string => {
  const user = req.user;
  if (!user?.userId) throw new UnauthorizedError("Vui lòng đăng nhập.");
  if (user.role !== "teacher") throw new ForbiddenError("Chỉ Giáo viên mới được thực hiện hành động này.");
  return user.userId;
};

// ─── Controller ───────────────────────────────────────────────────────────────

export class AssignmentController {
  /**
   * GET /api/v1/classes/:id/assignments
   * Teacher lấy danh sách bài tập của lớp
   */
  public async getAssignments(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const teacherId = ensureTeacher(req);
      const classId = req.params.id as string;
      const assignments = await assignmentService.getAssignmentsByClassId(teacherId, classId);
      res.status(200).json({ success: true, message: "Lấy danh sách bài tập thành công!", data: assignments });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/classes/:id/assignments/:assignmentId
   * Teacher lấy chi tiết bài tập (bao gồm quiz questions + isCorrect)
   */
  public async getAssignmentDetail(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const teacherId = ensureTeacher(req);
      const assignmentId = req.params.assignmentId as string;
      const assignment = await assignmentService.getAssignmentById(teacherId, assignmentId);
      res.status(200).json({ success: true, message: "Lấy chi tiết bài tập thành công!", data: assignment });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/classes/:id/assignments
   * Teacher tạo bài tập mới.
   * Body (multipart/form-data):
   *   - title, description, deadline, typeAssignment (required)
   *   - questions: JSON string (array) — bắt buộc nếu typeAssignment = "MULTIPLE_CHOICE"
   *   - files: file đính kèm (tùy chọn, chỉ dùng cho ESSAY)
   */
  public async createAssignment(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const teacherId = ensureTeacher(req);
      const classId = req.params.id as string;

      const { title, description, deadline, typeAssignment } = req.body;

      if (!title || String(title).trim() === "") {
        throw new BadRequestError("Tiêu đề bài tập không được để trống.");
      }
      if (!deadline) {
        throw new BadRequestError("Hạn nộp bài không được để trống.");
      }

      // Parse questions nếu được gửi dưới dạng JSON string
      let questions: any[] | undefined;
      if (req.body.questions !== undefined) {
        questions =
          typeof req.body.questions === "string"
            ? JSON.parse(req.body.questions)
            : req.body.questions;
      }

      const files = req.files as Express.Multer.File[] | undefined;

      const assignment = await assignmentService.createAssignment(teacherId, classId, {
        title,
        description,
        deadline,
        typeAssignment,
        questions,
        files,
      });

      res.status(201).json({ success: true, message: "Tạo bài tập thành công!", data: assignment });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/v1/classes/:id/assignments/:assignmentId
   * Teacher cập nhật bài tập
   * Body (multipart/form-data):
   *   - title?, description?, deadline?, typeAssignment?
   *   - questions?: JSON string (array) — cập nhật toàn bộ câu hỏi
   *   - keepAttachmentIds?: JSON string (array of IDs)
   *   - files?: file đính kèm mới
   */
  public async updateAssignment(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const teacherId = ensureTeacher(req);
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

      const files = req.files as Express.Multer.File[] | undefined;

      const updated = await assignmentService.updateAssignment(teacherId, assignmentId, {
        title,
        description,
        deadline,
        typeAssignment,
        questions,
        keepAttachmentIds,
        files,
      });

      res.status(200).json({ success: true, message: "Cập nhật bài tập thành công!", data: updated });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/v1/classes/:id/assignments/:assignmentId
   * Teacher xóa bài tập
   */
  public async deleteAssignment(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const teacherId = ensureTeacher(req);
      const assignmentId = req.params.assignmentId as string;
      await assignmentService.deleteAssignment(teacherId, assignmentId);
      res.status(200).json({ success: true, message: "Xóa bài tập thành công!" });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/v1/classes/:id/assignments/:assignmentId/attachments/:attachmentId
   * Teacher xóa một file đính kèm
   */
  public async deleteAttachment(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const teacherId = ensureTeacher(req);
      const assignmentId = req.params.assignmentId as string;
      const attachmentId = req.params.attachmentId as string;
      await assignmentService.deleteAttachment(teacherId, assignmentId, attachmentId);
      res.status(200).json({ success: true, message: "Xóa file đính kèm thành công!" });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/classes/:id/assignments/:assignmentId/submissions
   * Teacher lấy danh sách bài nộp của học sinh
   */
  public async getSubmissions(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const teacherId = ensureTeacher(req);
      const assignmentId = req.params.assignmentId as string;
      const submissions = await assignmentService.getSubmissionsByAssignmentId(teacherId, assignmentId);
      res.status(200).json({ success: true, message: "Lấy danh sách bài nộp thành công!", data: submissions });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/classes/:id/assignments/:assignmentId/submissions/:submissionId/grade
   * Teacher chấm điểm bài nộp (chỉ dành cho bài tự luận - ESSAY)
   * Body: { score: number (0-10), comment?: string (max 1000 ký tự) }
   */
  public async gradeSubmission(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const teacherId = ensureTeacher(req);
      const assignmentId = req.params.assignmentId as string;
      const submissionId = req.params.submissionId as string;
      const { score, comment } = req.body;

      // 1. Validate score
      const parsedScore = parseFloat(score);
      if (isNaN(parsedScore) || parsedScore < 0 || parsedScore > 10) {
        throw new BadRequestError("Điểm số phải là số từ 0 đến 10.");
      }
      // Làm tròn 2 chữ số thập phân (tránh 8.9999... hoặc 10.0001)
      const roundedScore = Math.round(parsedScore * 100) / 100;

      // 2. Validate comment
      if (comment !== undefined && comment !== null) {
        if (typeof comment !== "string") {
          throw new BadRequestError("Nhận xét không hợp lệ.");
        }
        if (comment.length > 1000) {
          throw new BadRequestError("Nhận xét không được vượt quá 1000 ký tự.");
        }
      }

      // 3. Chặn chấm điểm thủ công cho bài trắc nghiệm
      const assignment = await assignmentService["assignmentRepo"].findAssignmentById(assignmentId);
      if (assignment && assignment.typeAssignment === "MULTIPLE_CHOICE") {
        throw new BadRequestError("Bài trắc nghiệm được chấm điểm tự động, không thể chấm thủ công.");
      }

      await assignmentService.gradeSubmission(teacherId, assignmentId, submissionId, {
        score: roundedScore,
        comment: comment?.trim(),
      });

      res.status(200).json({ success: true, message: "Chấm điểm thành công!" });
    } catch (error) {
      next(error);
    }
  }
}


export const assignmentController = new AssignmentController();
