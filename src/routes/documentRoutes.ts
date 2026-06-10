import { Router } from "express";
import { documentController } from "../controllers/documentController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { requireRole } from "../middlewares/roleMiddleware.js";
import { uploadMultipleDocumentsMiddleware } from "../middlewares/uploadMiddleware.js";
import { ensureClassActive } from "../middlewares/classMiddleware.js";

const router = Router();

// ─── Mutations ────────────────────────────────────────────────────────────────

// POST /api/v1/documents/upload  (chỉ teacher chủ lớp)
router.post(
  "/upload",
  authMiddleware,
  requireRole(["teacher"]),
  uploadMultipleDocumentsMiddleware,
  ensureClassActive,
  documentController.upload
);

// PUT /api/v1/documents/:documentId  (chỉ teacher chủ lớp, lớp phải ACTIVE)
router.put(
  "/:documentId",
  authMiddleware,
  requireRole(["teacher"]),
  ensureClassActive,
  uploadMultipleDocumentsMiddleware,
  documentController.update
);

// DELETE /api/v1/documents/:documentId  (chỉ teacher chủ lớp, lớp phải ACTIVE)
router.delete(
  "/:documentId",
  authMiddleware,
  requireRole(["teacher"]),
  ensureClassActive,
  documentController.delete
);

// ─── Queries ──────────────────────────────────────────────────────────────────

// GET /api/v1/documents/class/:classId  (teacher + student đã tham gia đều xem được)
router.get(
  "/class/:classId",
  authMiddleware,
  documentController.getDocumentsByClassId
);

// GET /api/v1/documents/attachment/:attachmentId/download
// Query: ?action=download → force download | không có → inline preview
router.get(
  "/attachment/:attachmentId/download",
  authMiddleware,
  documentController.getAttachmentDownloadUrl
);

export default router;
