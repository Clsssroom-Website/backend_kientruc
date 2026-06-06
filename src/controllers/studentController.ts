import { Request, Response, NextFunction } from "express";
import * as ClassService from "../services/class.service.js";
import * as StudentService from "../services/student.service.js";
import { UnauthorizedError, ForbiddenError, BadRequestError } from "../errors/index.js";

// ─── Guards ───────────────────────────────────────────────────────────────────

const ensureStudentRole = (req: Request): string => {
  const userPayload = (req as any).user;
  if (!userPayload || !userPayload.userId) {
    throw new UnauthorizedError("Vui lòng đăng nhập.");
  }
  if (userPayload.role !== "student") {
    throw new ForbiddenError("Chỉ có Học sinh mới được phép thực hiện hành động này.");
  }
  return userPayload.userId;
};

// ─── Class handlers ───────────────────────────────────────────────────────────

/** POST /api/v1/students/classes/join */
export const joinClass = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const studentId = ensureStudentRole(req);
    const { joinCode } = req.body;
    if (!joinCode) throw new BadRequestError("Vui lòng cung cấp mã tham gia (joinCode).");
    const targetClass = await ClassService.joinClass(studentId, joinCode);
    res.status(200).json({ success: true, message: "Tham gia lớp học thành công!", data: targetClass });
  } catch (error) {
    next(error);
  }
};

/** GET /api/v1/students/classes */
export const getEnrolledClasses = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const studentId = ensureStudentRole(req);
    const classes = await ClassService.getJoinedClassesByStudentId(studentId);
    res.status(200).json({ success: true, message: "Lấy danh sách lớp học tham gia thành công!", data: classes });
  } catch (error) {
    next(error);
  }
};

/** GET /api/v1/students/classes/:classId */
export const getClassDetails = async (req: Request<{ classId: string }>, res: Response, next: NextFunction): Promise<void> => {
  try {
    const studentId = ensureStudentRole(req);
    const { classId } = req.params;
    const classDetails = await StudentService.getClassDetailsForStudent(studentId, classId);
    res.status(200).json({ success: true, message: "Lấy chi tiết lớp học thành công!", data: classDetails });
  } catch (error) {
    next(error);
  }
};

/** GET /api/v1/students/classes/:classId/assignments */
export const getAssignments = async (req: Request<{ classId: string }>, res: Response, next: NextFunction): Promise<void> => {
  try {
    const studentId = ensureStudentRole(req);
    const { classId } = req.params;
    const assignments = await StudentService.getAssignmentsForStudent(studentId, classId);
    res.status(200).json({ success: true, message: "Lấy danh sách bài tập thành công!", data: assignments });
  } catch (error) {
    next(error);
  }
};

// ─── Assignment Detail ────────────────────────────────────────────────────────

/**
 * GET /api/v1/students/assignments/:assignmentId
 * Học sinh xem chi tiết bài tập (quiz questions không có isCorrect)
 */
export const getAssignmentDetail = async (req: Request<{ assignmentId: string }>, res: Response, next: NextFunction): Promise<void> => {
  try {
    const studentId = ensureStudentRole(req);
    const { assignmentId } = req.params;
    const assignment = await StudentService.getAssignmentForStudent(studentId, assignmentId);
    res.status(200).json({ success: true, message: "Lấy chi tiết bài tập thành công!", data: assignment });
  } catch (error) {
    next(error);
  }
};

// ─── Submission handlers ──────────────────────────────────────────────────────

/**
 * POST /api/v1/students/assignments/:assignmentId/submit
 * Nộp bài tự luận (ESSAY) kèm file
 */
export const submitAssignment = async (req: Request<{ assignmentId: string }>, res: Response, next: NextFunction): Promise<void> => {
  try {
    const studentId = ensureStudentRole(req);
    const { assignmentId } = req.params;
    const files = req.files as Express.Multer.File[];
    const attachments: { fileName: string; fileUri: string; fileSize: number }[] = [];

    if (files && files.length > 0) {
      const { MinioStorageService } = await import("../services/storage/minioStorage.js");
      const storageService = new MinioStorageService("classroom-submissions");
      for (const file of files) {
        const result = await storageService.uploadFile(file.buffer, file.originalname, file.mimetype);
        attachments.push({ fileName: file.originalname, fileUri: result.url, fileSize: result.size });
      }
    }

    const submission = await StudentService.submitEssayAssignment(studentId, assignmentId, attachments);
    res.status(201).json({ success: true, message: "Nộp bài tập thành công!", data: submission });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/students/assignments/:assignmentId/submit-quiz
 * Nộp bài trắc nghiệm (MULTIPLE_CHOICE)
 * Body: { answers: [{ questionId: string, selectedOptionId: string }] }
 */
export const submitQuizAssignment = async (req: Request<{ assignmentId: string }>, res: Response, next: NextFunction): Promise<void> => {
  try {
    const studentId = ensureStudentRole(req);
    const { assignmentId } = req.params;

    // Parse answers — có thể là array hoặc JSON string
    let answers: { questionId: string; selectedOptionId: string }[];
    const rawAnswers = req.body.answers;
    if (!rawAnswers) {
      throw new BadRequestError("Vui lòng cung cấp danh sách câu trả lời (answers).");
    }
    answers = typeof rawAnswers === "string" ? JSON.parse(rawAnswers) : rawAnswers;

    if (!Array.isArray(answers) || answers.length === 0) {
      throw new BadRequestError("Danh sách câu trả lời (answers) không hợp lệ.");
    }

    // Validate từng answer có đủ fields
    for (const ans of answers) {
      if (!ans.questionId || !ans.selectedOptionId) {
        throw new BadRequestError("Mỗi câu trả lời phải có questionId và selectedOptionId.");
      }
    }

    const result = await StudentService.submitQuizAssignment(studentId, assignmentId, answers);
    res.status(201).json({ success: true, message: "Nộp bài trắc nghiệm thành công!", data: result });
  } catch (error) {
    next(error);
  }
};

/** GET /api/v1/students/assignments/:assignmentId/submission */
export const getSubmissionAndGrade = async (req: Request<{ assignmentId: string }>, res: Response, next: NextFunction): Promise<void> => {
  try {
    const studentId = ensureStudentRole(req);
    const { assignmentId } = req.params;
    const submission = await StudentService.getSubmissionAndGrade(studentId, assignmentId);
    res.status(200).json({
      success: true,
      message: submission ? "Lấy thông tin bài nộp thành công!" : "Bạn chưa nộp bài tập này.",
      data: submission,
    });
  } catch (error) {
    next(error);
  }
};

// ─── Dashboard & Grades ───────────────────────────────────────────────────────

/** GET /api/v1/students/dashboard */
export const getDashboard = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const studentId = ensureStudentRole(req);
    const dashboardData = await StudentService.getStudentDashboard(studentId);
    res.status(200).json({ success: true, message: "Lấy dữ liệu Dashboard thành công!", data: dashboardData });
  } catch (error) {
    next(error);
  }
};

/** GET /api/v1/students/classes/:classId/grades */
export const getGrades = async (req: Request<{ classId: string }>, res: Response, next: NextFunction): Promise<void> => {
  try {
    const studentId = ensureStudentRole(req);
    const { classId } = req.params;
    const grades = await StudentService.getGradesForStudent(studentId, classId);
    res.status(200).json({ success: true, message: "Lấy danh sách điểm số thành công!", data: grades });
  } catch (error) {
    next(error);
  }
};
