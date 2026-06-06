import { Request, Response, NextFunction } from "express";
import * as ClassService from "../services/class.service.js";
import { UnauthorizedError, ForbiddenError, BadRequestError, ValidationError } from "../errors/index.js";
import { createClassSchema, updateClassSchema } from "../validators/class.validator.js";

// GET /api/v1/classes - API lấy danh sách lớp học theo teacherId hoặc studentId
export const getAllClasses = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userPayload = (req as any).user;
    if (!userPayload || !userPayload.userId) {
      throw new UnauthorizedError("Vui lòng đăng nhập.");
    }

    const searchQuery = req.query.search ? String(req.query.search) : undefined;

    let classes;
    if (userPayload.role === "teacher") {
      classes = await ClassService.getAllClassesByTeacherId(userPayload.userId, searchQuery);
    } else if (userPayload.role === "student") {
      classes = await ClassService.getJoinedClassesByStudentId(userPayload.userId, searchQuery);
    } else {
      throw new ForbiddenError("Role không hợp lệ.");
    }

    res.status(200).json({ success: true, message: "Lấy danh sách lớp học thành công!", data: classes });
  } catch (error: any) {
    console.log(error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: "Lỗi khi lấy danh sách lớp học: " + (error.message || "Internal Server Error"),
    });
  }
};

// POST /api/v1/classes - API tạo lớp học
export const createClass = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userPayload = (req as any).user;
    if (!userPayload || !userPayload.userId) {
      throw new UnauthorizedError("Vui lòng đăng nhập.");
    }
    if (userPayload.role !== "teacher") {
      throw new ForbiddenError("Chỉ có Giáo viên mới được phép tạo lớp học.");
    }

    const teacherId = userPayload.userId;

    // Validate input bằng Zod schema
    const parsed = createClassSchema.safeParse({ body: req.body });
    if (!parsed.success) {
      throw new ValidationError("Dữ liệu đầu vào không hợp lệ", parsed.error.issues);
    }

    const { className, description, room, topic } = parsed.data.body;

    const newClass = await ClassService.createClass(teacherId, {
      className,
      description,
      room,
      topic,
    });

    res.status(201).json({ success: true, message: "Tạo lớp học thành công!", data: newClass });
  } catch (error: any) {
    console.log(error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: "Lỗi khi tạo lớp học: " + (error.message || "Internal Server Error"),
    });
  }
};

// GET /api/v1/classes/:id - API lấy chi tiết 1 lớp học
export const getClassById = async (req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userPayload = (req as any).user;
    if (!userPayload || !userPayload.userId) throw new UnauthorizedError("Vui lòng đăng nhập.");
    
    // NOTE: Cần kiểm tra xem user này có trong lớp học hay không, hoặc là teacher. 
    // Tam thời chỉ fetch lớp học.
    const classId = req.params.id as string;
    const classroom = await ClassService.getClassById(classId);

    res.status(200).json({ success: true, message: "Lấy chi tiết lớp học thành công!", data: classroom });
  } catch (error: any) {
    console.log(error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: "Lỗi khi lấy chi tiết lớp học: " + (error.message || "Internal Server Error"),
    });
  }
};

// GET /api/v1/classes/:id/stream - API lấy bảng tin lớp học (Bài tập và Tài liệu)
export const getClassStream = async (req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userPayload = (req as any).user;
    if (!userPayload || !userPayload.userId) throw new UnauthorizedError("Vui lòng đăng nhập.");

    const classId = req.params.id as string;
    const stream = await ClassService.getClassStream(classId);

    res.status(200).json({ success: true, message: "Lấy bảng tin lớp học thành công!", data: stream });
  } catch (error: any) {
    console.log(error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: "Lỗi khi lấy bảng tin lớp học: " + (error.message || "Internal Server Error"),
    });
  }
};


// PUT /api/v1/classes/:id - API cập nhật lớp học
export const updateClass = async (req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userPayload = (req as any).user;
    if (!userPayload || !userPayload.userId) throw new UnauthorizedError("Vui lòng đăng nhập.");
    if (userPayload.role !== "teacher") throw new ForbiddenError("Chỉ có Giáo viên mới được phép thao tác.");

    const teacherId = userPayload.userId;
    const classId = req.params.id as string;

    // Validate input bằng Zod schema
    const parsed = updateClassSchema.safeParse({ body: req.body });
    if (!parsed.success) {
      throw new ValidationError("Dữ liệu đầu vào không hợp lệ", parsed.error.issues);
    }

    const updatedClass = await ClassService.updateClass(teacherId, classId, parsed.data.body);

    res.status(200).json({ success: true, message: "Cập nhật lớp học thành công!", data: updatedClass });
  } catch (error: any) {
    console.log(error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: "Lỗi khi cập nhật lớp học: " + (error.message || "Internal Server Error"),
    });
  }
};

// GET /api/v1/classes/:id/students - API lấy danh sách học sinh của lớp học
export const getClassStudents = async (req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userPayload = (req as any).user;
    if (!userPayload || !userPayload.userId) throw new UnauthorizedError("Vui lòng đăng nhập.");
    if (userPayload.role !== "teacher") throw new ForbiddenError("Chỉ có Giáo viên mới được xem danh sách học sinh.");

    const classId = req.params.id as string;
    const students = await ClassService.getClassStudents(classId);

    res.status(200).json({ success: true, message: "Lấy danh sách học sinh thành công!", data: students });
  } catch (error: any) {
    console.log(error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: "Lỗi khi lấy danh sách học sinh: " + (error.message || "Internal Server Error"),
    });
  }
};

// DELETE /api/v1/classes/:id/students/:studentId - API xóa học sinh khỏi lớp
export const removeStudentFromClass = async (req: Request<{ id: string; studentId: string }>, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userPayload = (req as any).user;
    if (!userPayload || !userPayload.userId) throw new UnauthorizedError("Vui lòng đăng nhập.");
    if (userPayload.role !== "teacher") throw new ForbiddenError("Chỉ có Giáo viên mới được phép thao tác.");

    const teacherId = userPayload.userId;
    const classId = req.params.id as string;
    const studentId = req.params.studentId as string;

    await ClassService.removeStudentFromClass(teacherId, classId, studentId);

    res.status(200).json({ success: true, message: "Đã xóa học sinh khỏi lớp thành công!" });
  } catch (error: any) {
    console.log(error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: "Lỗi khi xóa học sinh khỏi lớp: " + (error.message || "Internal Server Error"),
    });
  }
};

// DELETE /api/v1/classes/:id - API xóa lớp học
export const deleteClass = async (req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userPayload = (req as any).user;
    if (!userPayload || !userPayload.userId) throw new UnauthorizedError("Vui lòng đăng nhập.");
    if (userPayload.role !== "teacher") throw new ForbiddenError("Chỉ có Giáo viên mới được phép thao tác.");

    const teacherId = userPayload.userId;
    const classId = req.params.id as string;

    await ClassService.deleteClass(teacherId, classId);

    res.status(200).json({ success: true, message: "Xóa lớp học thành công!" });
  } catch (error: any) {
    console.log(error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: "Lỗi khi xóa lớp học: " + (error.message || "Internal Server Error"),
    });
  }
};

// GET /api/v1/classes/:id/grades - API lấy bảng điểm của lớp học (cho giáo viên)
export const getClassGrades = async (req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userPayload = (req as any).user;
    if (!userPayload || !userPayload.userId) {
      throw new UnauthorizedError("Vui lòng đăng nhập.");
    }
    if (userPayload.role !== "teacher") {
      throw new ForbiddenError("Chỉ có Giáo viên mới được xem danh sách điểm.");
    }

    const classId = req.params.id as string;
    const teacherId = userPayload.userId;

    const gradesSummary = await ClassService.getClassGrades(teacherId, classId);

    res.status(200).json({
      success: true,
      message: "Lấy danh sách điểm số lớp học thành công!",
      data: gradesSummary,
    });
  } catch (error: any) {
    console.log(error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: "Lỗi khi lấy danh sách điểm số lớp học: " + (error.message || "Internal Server Error"),
    });
  }
};

