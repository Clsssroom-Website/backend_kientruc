import * as ClassService from "../services/class.service.js";
import { ForbiddenError } from "../errors/index.js";
import type { CreateClassInput, UpdateClassInput } from "../validators/class.validator.js";

/**
 * ClassFacade
 * ─────────────────────────────────────────────────────────────────────────────
 * Facade Pattern: cung cấp một giao diện đơn giản, thống nhất cho toàn bộ
 * nghiệp vụ quản lý Lớp Học (Class).
 *
 * Controller chỉ phụ thuộc vào ClassFacade — không import ClassService trực tiếp.
 *
 * Sơ đồ:
 *   ClassController
 *       └── ClassFacade ──► ClassService  (CRUD lớp học, học sinh, bảng điểm)
 *
 * Lưu ý: getAllClasses phục vụ CẢ teacher lẫn student (role-based routing
 * trong Facade, không để trong Controller).
 */
export class ClassFacade {
  // ─── Queries ───────────────────────────────────────────────────────────────

  /**
   * Lấy danh sách lớp học theo role của người dùng:
   * - teacher → lớp do mình tạo
   * - student → lớp đã tham gia
   *
   * Logic phân nhánh role được đặt trong Facade thay vì Controller.
   */
  async getAllClasses(userId: string, role: string, search?: string) {
    if (role === "teacher") {
      return ClassService.getAllClassesByTeacherId(userId, search);
    }
    if (role === "student") {
      return ClassService.getJoinedClassesByStudentId(userId, search);
    }
    throw new ForbiddenError("Role không hợp lệ.");
  }

  /**
   * Lấy chi tiết một lớp học theo classId.
   */
  async getClassById(classId: string) {
    return ClassService.getClassById(classId);
  }

  /**
   * Lấy bảng tin (stream) của lớp học:
   * danh sách bài tập + tài liệu, sắp xếp theo thời gian mới nhất.
   */
  async getClassStream(classId: string) {
    return ClassService.getClassStream(classId);
  }

  /**
   * Lấy danh sách học sinh đang tham gia lớp học (chỉ teacher).
   */
  async getClassStudents(classId: string) {
    return ClassService.getClassStudents(classId);
  }

  /**
   * Lấy bảng điểm toàn lớp — bao gồm điểm từng học sinh theo từng bài tập
   * và điểm trung bình (chỉ teacher chủ lớp).
   */
  async getClassGrades(teacherId: string, classId: string) {
    return ClassService.getClassGrades(teacherId, classId);
  }

  // ─── Mutations ─────────────────────────────────────────────────────────────

  /**
   * Tạo lớp học mới — tự sinh joinCode, tạo joinLink.
   */
  async createClass(teacherId: string, data: CreateClassInput) {
    return ClassService.createClass(teacherId, data);
  }

  /**
   * Cập nhật thông tin lớp học (chỉ teacher chủ lớp).
   */
  async updateClass(teacherId: string, classId: string, data: UpdateClassInput) {
    return ClassService.updateClass(teacherId, classId, data);
  }

  /**
   * Xóa lớp học (chỉ teacher chủ lớp).
   */
  async deleteClass(teacherId: string, classId: string) {
    return ClassService.deleteClass(teacherId, classId);
  }

  /**
   * Xóa học sinh khỏi lớp học (chỉ teacher chủ lớp).
   */
  async removeStudentFromClass(teacherId: string, classId: string, studentId: string) {
    return ClassService.removeStudentFromClass(teacherId, classId, studentId);
  }
}
