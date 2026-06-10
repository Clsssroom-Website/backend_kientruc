import { Response, NextFunction } from "express";
import { AuthRequest } from "../middlewares/authMiddleware.js";
import { DocumentFacade } from "../facades/document.facade.js";
import { ValidationError, BadRequestError } from "../errors/index.js";
import { uploadDocumentSchema } from "../validators/document.validator.js";

/**
 * DocumentController
 * ─────────────────────────────────────────────────────────────────────────────
 * Facade Pattern: Controller này chỉ biết đến DocumentFacade.
 *
 * Controller chỉ lo:
 *   1. Đọc userId từ req.user (authMiddleware đã xác thực)
 *   2. Validate input (Zod) — chỉ validate format, không validate nghiệp vụ
 *   3. Parse multipart fields (keepAttachmentIds JSON string → array)
 *   4. Gọi facade.method()
 *   5. Trả Response
 *
 * Kiểm tra quyền teacher/student và logic upload MinIO
 * đã được đẩy hoàn toàn vào DocumentFacade → DocumentService.
 */
export class DocumentController {
  constructor(private readonly facade: DocumentFacade) {}

  // ─── Mutations ─────────────────────────────────────────────────────────────

  /**
   * POST /api/v1/documents/upload
   * Upload tài liệu mới (chỉ teacher chủ lớp).
   * Body (multipart/form-data): classId, title, description?, files
   */
  upload = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Validate body bằng Zod schema
      const parsed = uploadDocumentSchema.body.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError("Dữ liệu đầu vào không hợp lệ", parsed.error.issues);
      }

      const { classId, title, description } = parsed.data;
      const files = (req.files as Express.Multer.File[]) ?? [];
      const userId = req.user!.userId;

      const data = await this.facade.uploadDocument(userId, classId, title, description, files);

      res.status(201).json({
        success: true,
        message: "Tải tài liệu lên thành công.",
        data,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * PUT /api/v1/documents/:documentId
   * Cập nhật tài liệu (chỉ teacher chủ lớp).
   * Body (multipart/form-data): title?, description?, keepAttachmentIds? (JSON), files?
   */
  update = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { title, description } = req.body;

      // Parse keepAttachmentIds từ JSON string (multipart/form-data)
      let keepAttachmentIds: string[] | undefined;
      if (req.body.keepAttachmentIds !== undefined) {
        keepAttachmentIds =
          typeof req.body.keepAttachmentIds === "string"
            ? JSON.parse(req.body.keepAttachmentIds)
            : req.body.keepAttachmentIds;
      }

      const data = await this.facade.updateDocument(req.user!.userId, req.params.documentId as string, {
        title,
        description,
        keepAttachmentIds,
        files: req.files as Express.Multer.File[] | undefined,
      });

      res.status(200).json({
        success: true,
        message: "Cập nhật tài liệu thành công.",
        data,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * DELETE /api/v1/documents/:documentId
   * Xóa tài liệu và toàn bộ file đính kèm (chỉ teacher chủ lớp).
   */
  delete = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.facade.deleteDocument(req.user!.userId, req.params.documentId as string);
      res.status(200).json({
        success: true,
        message: "Xóa tài liệu thành công.",
      });
    } catch (error) {
      next(error);
    }
  };

  // ─── Queries ───────────────────────────────────────────────────────────────

  /**
   * GET /api/v1/documents/class/:classId
   * Lấy danh sách tài liệu của lớp (teacher + student đã tham gia đều xem được).
   */
  getDocumentsByClassId = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { classId } = req.params;
      if (!classId) throw new BadRequestError("classId là bắt buộc trong URL.");

      const data = await this.facade.getDocumentsByClassId(req.user!.userId, classId as string);

      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/v1/documents/attachment/:attachmentId/download
   * Lấy presigned URL để xem hoặc tải file.
   * Query: ?action=download → force download | không có → inline preview
   */
  getAttachmentDownloadUrl = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { attachmentId } = req.params;
      if (!attachmentId) throw new BadRequestError("attachmentId là bắt buộc trong URL.");

      const action = req.query.action as string | undefined;
      const data = await this.facade.getAttachmentDownloadUrl(req.user!.userId, attachmentId as string, action);

      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };
}

// ─── Singleton instance (dùng trong Routes) ──────────────────────────────────
export const documentController = new DocumentController(new DocumentFacade());
