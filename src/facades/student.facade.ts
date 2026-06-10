import { BadRequestError } from "../errors/index.js";
import * as ClassService from "../services/class.service.js";
import * as StudentService from "../services/student.service.js";
import { createStorageService } from "../services/storage/storage.factory.js";

/**
 * StudentFacade
 * ─────────────────────────────────────────────────────────────────────────────
 * Facade Pattern: cung cấp một giao diện đơn giản, thống nhất cho toàn bộ
 * luồng nghiệp vụ của Học Sinh.
 *
 * Controller chỉ phụ thuộc vào StudentFacade — không cần biết bên trong
 * đang sử dụng ClassService, StudentService hay MinioStorageService.
 *
 * Sơ đồ:
 *   StudentController
 *       └── StudentFacade ──► ClassService   (joinClass, getJoinedClasses)
 *                        ──► StudentService  (getDetails, submit, grades...)
 *                        ──► StorageService  (uploadFile cho essay submission)
 */
export class StudentFacade {
  /** Storage riêng cho bucket nộp bài của học sinh */
  private readonly submissionStorage = createStorageService("classroom-submissions");

  // ─── Class ─────────────────────────────────────────────────────────────────

  /**
   * Học sinh tham gia lớp học bằng joinCode hoặc joinLink.
   * Uỷ quyền hoàn toàn cho ClassService.joinClass.
   */
  async joinClass(studentId: string, joinCode: string) {
    if (!joinCode || !joinCode.trim()) {
      throw new BadRequestError("Vui lòng cung cấp mã tham gia (joinCode).");
    }
    return ClassService.joinClass(studentId, joinCode.trim());
  }

  /**
   * Lấy danh sách lớp học mà học sinh đã tham gia.
   * @param search từ khoá tìm kiếm tên lớp (tuỳ chọn)
   */
  async getEnrolledClasses(studentId: string, search?: string) {
    return ClassService.getJoinedClassesByStudentId(studentId, search);
  }

  /**
   * Lấy chi tiết một lớp học theo góc nhìn học sinh
   * (ẩn joinCode, joinLink — bảo mật).
   */
  async getClassDetails(studentId: string, classId: string) {
    return StudentService.getClassDetailsForStudent(studentId, classId);
  }

  // ─── Assignment ────────────────────────────────────────────────────────────

  /**
   * Lấy danh sách bài tập của một lớp học (học sinh chỉ thấy bài của lớp mình).
   */
  async getAssignments(studentId: string, classId: string) {
    return StudentService.getAssignmentsForStudent(studentId, classId);
  }

  /**
   * Lấy chi tiết bài tập.
   * Với bài trắc nghiệm: câu hỏi trả về KHÔNG có trường isCorrect.
   */
  async getAssignmentDetail(studentId: string, assignmentId: string) {
    return StudentService.getAssignmentForStudent(studentId, assignmentId);
  }

  // ─── Submission ────────────────────────────────────────────────────────────

  /**
   * Nộp bài tự luận (ESSAY) kèm file đính kèm.
   *
   * Facade chịu trách nhiệm:
   *   1. Upload từng file lên MinIO (submissionStorage)
   *   2. Chuyển danh sách URL + metadata cho StudentService lưu DB
   *
   * Controller không cần biết chi tiết về storage.
   */
  async submitEssayAssignment(
    studentId: string,
    assignmentId: string,
    files: Express.Multer.File[]
  ) {
    // Bước 1: Upload tất cả file lên MinIO
    const attachments: { fileName: string; fileUri: string; fileSize: number }[] = [];

    for (const file of files ?? []) {
      const result = await this.submissionStorage.uploadFile(
        file.buffer,
        file.originalname,
        file.mimetype
      );
      attachments.push({
        fileName: file.originalname,
        fileUri: result.url,
        fileSize: result.size,
      });
    }

    // Bước 2: Lưu submission vào DB qua StudentService
    return StudentService.submitEssayAssignment(studentId, assignmentId, attachments);
  }

  /**
   * Nộp bài trắc nghiệm (MULTIPLE_CHOICE).
   * Facade validate format answers trước khi chuyển cho StudentService chấm điểm.
   *
   * @param answers mảng { questionId, selectedOptionId }
   */
  async submitQuizAssignment(
    studentId: string,
    assignmentId: string,
    answers: { questionId: string; selectedOptionId: string }[]
  ) {
    if (!Array.isArray(answers) || answers.length === 0) {
      throw new BadRequestError(
        "Vui lòng cung cấp danh sách câu trả lời (answers) hợp lệ."
      );
    }

    // Validate từng phần tử
    for (const ans of answers) {
      if (!ans.questionId || !ans.selectedOptionId) {
        throw new BadRequestError(
          "Mỗi câu trả lời phải có đầy đủ questionId và selectedOptionId."
        );
      }
    }

    return StudentService.submitQuizAssignment(studentId, assignmentId, answers);
  }

  /**
   * Xem bài nộp đã lưu và điểm số tương ứng của học sinh.
   * Trả về null nếu học sinh chưa nộp bài.
   */
  async getSubmissionAndGrade(studentId: string, assignmentId: string) {
    return StudentService.getSubmissionAndGrade(studentId, assignmentId);
  }

  // ─── Dashboard & Grades ────────────────────────────────────────────────────

  /**
   * Lấy toàn bộ dữ liệu Dashboard của học sinh:
   * stats, danh sách lớp, điểm gần đây, bài sắp đến hạn, hoạt động gần đây.
   */
  async getDashboard(studentId: string) {
    return StudentService.getStudentDashboard(studentId);
  }

  /**
   * Lấy danh sách điểm của học sinh trong một lớp học cụ thể.
   */
  async getGrades(studentId: string, classId: string) {
    return StudentService.getGradesForStudent(studentId, classId);
  }
}
