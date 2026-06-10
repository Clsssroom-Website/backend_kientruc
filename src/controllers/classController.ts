import { Request, Response, NextFunction } from "express";
import { ClassFacade } from "../facades/class.facade.js";
import { UnauthorizedError, ForbiddenError, ValidationError } from "../errors/index.js";
import { createClassSchema, updateClassSchema } from "../validators/class.validator.js";

/**
 * ClassController
 * ─────────────────────────────────────────────────────────────────────────────
 * Facade Pattern: Controller này chỉ biết đến ClassFacade.
 * Mọi business logic (CRUD lớp, bảng điểm, học sinh) đã được đẩy vào Facade.
 *
 * Controller chỉ lo:
 *   1. Xác thực user (đăng nhập / role)
 *   2. Validate input (Zod)
 *   3. Gọi facade.method()
 *   4. Trả Response
 */
export class ClassController {
  constructor(private readonly facade: ClassFacade) {}

  // ─── Guards ────────────────────────────────────────────────────────────────

  /** Xác nhận user đã đăng nhập, trả về { userId, role } */
  private ensureAuth(req: Request): { userId: string; role: string } {
    const user = (req as any).user;
    if (!user?.userId) throw new UnauthorizedError("Vui lòng đăng nhập.");
    return { userId: user.userId, role: user.role };
  }

  /** Xác nhận user đã đăng nhập và có role teacher, trả về teacherId */
  private ensureTeacher(req: Request): string {
    const { userId, role } = this.ensureAuth(req);
    if (role !== "teacher") throw new ForbiddenError("Chỉ có Giáo viên mới được phép thao tác.");
    return userId;
  }

  // ─── Queries ───────────────────────────────────────────────────────────────

  /**
   * GET /api/v1/classes
   * Lấy danh sách lớp học theo role:
   *   - teacher → lớp do mình tạo
   *   - student → lớp đã tham gia
   * Facade xử lý phân nhánh role, Controller không cần if/else.
   */
  getAllClasses = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userId, role } = this.ensureAuth(req);
      const search = req.query.search ? String(req.query.search) : undefined;
      const data = await this.facade.getAllClasses(userId, role, search);
      res.status(200).json({ success: true, message: "Lấy danh sách lớp học thành công!", data });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/classes/:id
   * Lấy chi tiết 1 lớp học.
   */
  getClassById = async (req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> => {
    try {
      this.ensureAuth(req);
      const data = await this.facade.getClassById(req.params.id);
      res.status(200).json({ success: true, message: "Lấy chi tiết lớp học thành công!", data });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/classes/:id/stream
   * Lấy bảng tin lớp học (bài tập + tài liệu).
   */
  getClassStream = async (req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> => {
    try {
      this.ensureAuth(req);
      const data = await this.facade.getClassStream(req.params.id);
      res.status(200).json({ success: true, message: "Lấy bảng tin lớp học thành công!", data });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/classes/:id/students
   * Lấy danh sách học sinh trong lớp (chỉ teacher).
   */
  getClassStudents = async (req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> => {
    try {
      this.ensureTeacher(req);
      const data = await this.facade.getClassStudents(req.params.id);
      res.status(200).json({ success: true, message: "Lấy danh sách học sinh thành công!", data });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/classes/:id/grades
   * Lấy bảng điểm toàn lớp (chỉ teacher chủ lớp).
   */
  getClassGrades = async (req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> => {
    try {
      const teacherId = this.ensureTeacher(req);
      const data = await this.facade.getClassGrades(teacherId, req.params.id);
      res.status(200).json({ success: true, message: "Lấy danh sách điểm số lớp học thành công!", data });
    } catch (error) {
      next(error);
    }
  };

  // ─── Mutations ─────────────────────────────────────────────────────────────

  /**
   * POST /api/v1/classes
   * Tạo lớp học mới (chỉ teacher).
   */
  createClass = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const teacherId = this.ensureTeacher(req);

      // Validate input bằng Zod schema
      const parsed = createClassSchema.safeParse({ body: req.body });
      if (!parsed.success) {
        throw new ValidationError("Dữ liệu đầu vào không hợp lệ", parsed.error.issues);
      }

      const data = await this.facade.createClass(teacherId, parsed.data.body);
      res.status(201).json({ success: true, message: "Tạo lớp học thành công!", data });
    } catch (error) {
      next(error);
    }
  };

  /**
   * PUT /api/v1/classes/:id
   * Cập nhật thông tin lớp học (chỉ teacher chủ lớp).
   */
  updateClass = async (req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> => {
    try {
      const teacherId = this.ensureTeacher(req);

      // Validate input bằng Zod schema
      const parsed = updateClassSchema.safeParse({ body: req.body });
      if (!parsed.success) {
        throw new ValidationError("Dữ liệu đầu vào không hợp lệ", parsed.error.issues);
      }

      const data = await this.facade.updateClass(teacherId, req.params.id, parsed.data.body);
      res.status(200).json({ success: true, message: "Cập nhật lớp học thành công!", data });
    } catch (error) {
      next(error);
    }
  };

  /**
   * DELETE /api/v1/classes/:id
   * Xóa lớp học (chỉ teacher chủ lớp).
   */
  deleteClass = async (req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> => {
    try {
      const teacherId = this.ensureTeacher(req);
      await this.facade.deleteClass(teacherId, req.params.id);
      res.status(200).json({ success: true, message: "Xóa lớp học thành công!" });
    } catch (error) {
      next(error);
    }
  };

  /**
   * DELETE /api/v1/classes/:id/students/:studentId
   * Xóa học sinh khỏi lớp học (chỉ teacher chủ lớp).
   */
  removeStudentFromClass = async (req: Request<{ id: string; studentId: string }>, res: Response, next: NextFunction): Promise<void> => {
    try {
      const teacherId = this.ensureTeacher(req);
      await this.facade.removeStudentFromClass(teacherId, req.params.id, req.params.studentId);
      res.status(200).json({ success: true, message: "Đã xóa học sinh khỏi lớp thành công!" });
    } catch (error) {
      next(error);
    }
  };
}

// ─── Singleton instance (dùng trong Routes) ──────────────────────────────────
export const classController = new ClassController(new ClassFacade());
