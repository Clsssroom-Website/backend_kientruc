import { Request, Response, NextFunction } from "express";
import { StudentFacade } from "../facades/student.facade.js";
import { UnauthorizedError, ForbiddenError } from "../errors/index.js";

/**
 * StudentController
 * ─────────────────────────────────────────────────────────────────────────────
 * Facade Pattern: Controller này chỉ biết đến StudentFacade.
 * Mọi logic phối hợp service (ClassService, StudentService, StorageService)
 * đã được đẩy vào Facade — Controller chỉ lo:
 *   1. Xác thực role
 *   2. Đọc input từ Request
 *   3. Gọi facade.method()
 *   4. Trả Response
 */
export class StudentController {
  constructor(private readonly facade: StudentFacade) {}

  // ─── Guard ─────────────────────────────────────────────────────────────────

  /** Xác nhận user đã đăng nhập và có role student, trả về studentId */
  private ensureStudent(req: Request): string {
    const user = (req as any).user;
    if (!user?.userId) throw new UnauthorizedError("Vui lòng đăng nhập.");
    if (user.role !== "student")
      throw new ForbiddenError("Chỉ có Học sinh mới được phép thực hiện hành động này.");
    return user.userId;
  }

  // ─── Class ─────────────────────────────────────────────────────────────────

  /** POST /api/v1/students/classes/join */
  joinClass = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const studentId = this.ensureStudent(req);
      const result = await this.facade.joinClass(studentId, req.body.joinCode);
      res.status(200).json({
        success: true,
        message: "Tham gia lớp học thành công!",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  /** GET /api/v1/students/classes */
  getEnrolledClasses = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const studentId = this.ensureStudent(req);
      const search = req.query.search ? String(req.query.search) : undefined;
      const result = await this.facade.getEnrolledClasses(studentId, search);
      res.status(200).json({
        success: true,
        message: "Lấy danh sách lớp học tham gia thành công!",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  /** GET /api/v1/students/classes/:classId */
  getClassDetails = async (req: Request<{ classId: string }>, res: Response, next: NextFunction): Promise<void> => {
    try {
      const studentId = this.ensureStudent(req);
      const result = await this.facade.getClassDetails(studentId, req.params.classId);
      res.status(200).json({
        success: true,
        message: "Lấy chi tiết lớp học thành công!",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  // ─── Assignment ────────────────────────────────────────────────────────────

  /** GET /api/v1/students/classes/:classId/assignments */
  getAssignments = async (req: Request<{ classId: string }>, res: Response, next: NextFunction): Promise<void> => {
    try {
      const studentId = this.ensureStudent(req);
      const result = await this.facade.getAssignments(studentId, req.params.classId);
      res.status(200).json({
        success: true,
        message: "Lấy danh sách bài tập thành công!",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  /** GET /api/v1/students/assignments/:assignmentId */
  getAssignmentDetail = async (req: Request<{ assignmentId: string }>, res: Response, next: NextFunction): Promise<void> => {
    try {
      const studentId = this.ensureStudent(req);
      const result = await this.facade.getAssignmentDetail(studentId, req.params.assignmentId);
      res.status(200).json({
        success: true,
        message: "Lấy chi tiết bài tập thành công!",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  // ─── Submission ────────────────────────────────────────────────────────────

  /**
   * POST /api/v1/students/assignments/:assignmentId/submit
   * Nộp bài tự luận (ESSAY) kèm file — Facade lo việc upload MinIO.
   */
  submitAssignment = async (req: Request<{ assignmentId: string }>, res: Response, next: NextFunction): Promise<void> => {
    try {
      const studentId = this.ensureStudent(req);
      const files = (req.files as Express.Multer.File[]) ?? [];
      const result = await this.facade.submitEssayAssignment(
        studentId,
        req.params.assignmentId,
        files
      );
      res.status(201).json({
        success: true,
        message: "Nộp bài tập thành công!",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/v1/students/assignments/:assignmentId/submit-quiz
   * Nộp bài trắc nghiệm — Facade validate và chuyển cho StudentService chấm.
   */
  submitQuizAssignment = async (req: Request<{ assignmentId: string }>, res: Response, next: NextFunction): Promise<void> => {
    try {
      const studentId = this.ensureStudent(req);

      // Parse answers: có thể là JSON string hoặc array
      const rawAnswers = req.body.answers;
      const answers: { questionId: string; selectedOptionId: string }[] =
        typeof rawAnswers === "string" ? JSON.parse(rawAnswers) : rawAnswers;

      const result = await this.facade.submitQuizAssignment(
        studentId,
        req.params.assignmentId,
        answers
      );
      res.status(201).json({
        success: true,
        message: "Nộp bài trắc nghiệm thành công!",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  /** GET /api/v1/students/assignments/:assignmentId/submission */
  getSubmissionAndGrade = async (req: Request<{ assignmentId: string }>, res: Response, next: NextFunction): Promise<void> => {
    try {
      const studentId = this.ensureStudent(req);
      const result = await this.facade.getSubmissionAndGrade(studentId, req.params.assignmentId);
      res.status(200).json({
        success: true,
        message: result
          ? "Lấy thông tin bài nộp thành công!"
          : "Bạn chưa nộp bài tập này.",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  // ─── Dashboard & Grades ────────────────────────────────────────────────────

  /** GET /api/v1/students/dashboard */
  getDashboard = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const studentId = this.ensureStudent(req);
      const result = await this.facade.getDashboard(studentId);
      res.status(200).json({
        success: true,
        message: "Lấy dữ liệu Dashboard thành công!",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  /** GET /api/v1/students/classes/:classId/grades */
  getGrades = async (req: Request<{ classId: string }>, res: Response, next: NextFunction): Promise<void> => {
    try {
      const studentId = this.ensureStudent(req);
      const result = await this.facade.getGrades(studentId, req.params.classId);
      res.status(200).json({
        success: true,
        message: "Lấy danh sách điểm số thành công!",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };
}

// ─── Singleton instance (dùng trong Routes) ──────────────────────────────────
export const studentController = new StudentController(new StudentFacade());
