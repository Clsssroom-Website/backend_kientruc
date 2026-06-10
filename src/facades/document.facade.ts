import { DocumentService } from "../services/document.service.js";
import { BadRequestError } from "../errors/index.js";

/**
 * DocumentFacade
 * ─────────────────────────────────────────────────────────────────────────────
 * Facade Pattern: cung cấp một giao diện đơn giản, thống nhất cho toàn bộ
 * nghiệp vụ Tài Liệu (Document).
 *
 * Controller chỉ phụ thuộc vào DocumentFacade — không import DocumentService trực tiếp.
 *
 * Sơ đồ:
 *   DocumentController
 *       └── DocumentFacade ──► DocumentService (upload, CRUD tài liệu, presigned URL)
 *
 * DocumentService đã bao gồm:
 *   - Upload file lên MinIO (classroom-documents bucket)
 *   - Kiểm tra quyền teacher/student
 *   - Quản lý attachments (xóa cũ, thêm mới)
 */
export class DocumentFacade {
  private readonly service: DocumentService;

  constructor() {
    this.service = new DocumentService();
  }

  // ─── Mutations ─────────────────────────────────────────────────────────────

  /**
   * Upload tài liệu mới lên lớp học (chỉ teacher chủ lớp).
   * Facade validate file trước khi chuyển cho Service upload lên MinIO.
   *
   * @param userId   ID của teacher
   * @param classId  ID lớp học
   * @param title    Tiêu đề tài liệu
   * @param description Mô tả (tuỳ chọn)
   * @param files    Danh sách file đính kèm từ Multer
   */
  async uploadDocument(
    userId: string,
    classId: string,
    title: string,
    description: string | undefined,
    files: Express.Multer.File[]
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestError("Vui lòng đính kèm ít nhất một tệp tài liệu.");
    }
    return this.service.uploadDocument(userId, classId, title, description, files);
  }

  /**
   * Cập nhật tài liệu — chỉ teacher chủ lớp.
   * Hỗ trợ cập nhật title, description và quản lý file đính kèm (keepAttachmentIds).
   *
   * @param userId            ID của teacher
   * @param documentId        ID tài liệu cần cập nhật
   * @param title             Tiêu đề mới (tuỳ chọn)
   * @param description       Mô tả mới (tuỳ chọn)
   * @param keepAttachmentIds Danh sách attachmentId cũ cần giữ lại
   * @param files             File đính kèm mới (tuỳ chọn)
   */
  async updateDocument(
    userId: string,
    documentId: string,
    data: {
      title?: string;
      description?: string;
      keepAttachmentIds?: string[];
      files?: Express.Multer.File[];
    }
  ) {
    return this.service.updateDocument(userId, documentId, data);
  }

  /**
   * Xóa tài liệu và toàn bộ file đính kèm (chỉ teacher chủ lớp).
   * Service tự dọn file trên MinIO trước khi xóa DB.
   */
  async deleteDocument(userId: string, documentId: string) {
    return this.service.deleteDocument(userId, documentId);
  }

  // ─── Queries ───────────────────────────────────────────────────────────────

  /**
   * Lấy danh sách tài liệu của một lớp học.
   * Cả teacher lẫn student đã tham gia lớp đều có quyền xem.
   * Kiểm tra quyền được thực hiện bên trong DocumentService.
   */
  async getDocumentsByClassId(userId: string, classId: string) {
    return this.service.getDocumentsByClassId(userId, classId);
  }

  /**
   * Lấy presigned URL để xem hoặc tải file đính kèm.
   * Cả teacher lẫn student đã tham gia lớp đều có quyền.
   *
   * @param userId       ID của người dùng (teacher hoặc student)
   * @param attachmentId ID của file đính kèm
   * @param action       "download" → force download | undefined → inline preview
   */
  async getAttachmentDownloadUrl(userId: string, attachmentId: string, action?: string) {
    return this.service.getAttachmentDownloadUrl(userId, attachmentId, action);
  }
}
