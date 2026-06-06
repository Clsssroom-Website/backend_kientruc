import { Router } from "express";
import { requireRole } from "../middlewares/roleMiddleware.js";
import { uploadMultipleMiddleware } from "../middlewares/uploadMiddleware.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { ensureClassActive } from "../middlewares/classMiddleware.js";
import { validate } from "../middlewares/validate.js";
import { createAssignmentSchema, updateAssignmentSchema } from "../validators/assignment.validator.js";
import { gradeSubmissionSchema } from "../validators/grade.validator.js";
import { assignmentController } from "../controllers/assignmentController.js";

const router = Router();

// ─── Teacher: Assignment CRUD ──────────────────────────────────────────────────

// GET /api/v1/classes/:id/assignments — danh sách bài tập của lớp
router.get(
  "/:id/assignments",
  authMiddleware,
  assignmentController.getAssignments.bind(assignmentController)
);

// GET /api/v1/classes/:id/assignments/:assignmentId — chi tiết bài tập (bao gồm quiz + isCorrect)
router.get(
  "/:id/assignments/:assignmentId",
  authMiddleware,
  requireRole(["teacher"]),
  assignmentController.getAssignmentDetail.bind(assignmentController)
);

// POST /api/v1/classes/:id/assignments — tạo bài tập mới
router.post(
  "/:id/assignments",
  authMiddleware,
  requireRole(["teacher"]),
  ensureClassActive,
  uploadMultipleMiddleware,
  validate(createAssignmentSchema),
  assignmentController.createAssignment.bind(assignmentController)
);

// PUT /api/v1/classes/:id/assignments/:assignmentId — cập nhật bài tập
router.put(
  "/:id/assignments/:assignmentId",
  authMiddleware,
  requireRole(["teacher"]),
  ensureClassActive,
  uploadMultipleMiddleware,
  validate(updateAssignmentSchema),
  assignmentController.updateAssignment.bind(assignmentController)
);

// DELETE /api/v1/classes/:id/assignments/:assignmentId — xóa bài tập
router.delete(
  "/:id/assignments/:assignmentId",
  authMiddleware,
  requireRole(["teacher"]),
  ensureClassActive,
  assignmentController.deleteAssignment.bind(assignmentController)
);

// DELETE /api/v1/classes/:id/assignments/:assignmentId/attachments/:attachmentId — xóa 1 file đính kèm
router.delete(
  "/:id/assignments/:assignmentId/attachments/:attachmentId",
  authMiddleware,
  requireRole(["teacher"]),
  ensureClassActive,
  assignmentController.deleteAttachment.bind(assignmentController)
);

// ─── Teacher: Submission & Grading ────────────────────────────────────────────

// GET /api/v1/classes/:id/assignments/:assignmentId/submissions — xem bài nộp
router.get(
  "/:id/assignments/:assignmentId/submissions",
  authMiddleware,
  requireRole(["teacher"]),
  assignmentController.getSubmissions.bind(assignmentController)
);

// POST /api/v1/classes/:id/assignments/:assignmentId/submissions/:submissionId/grade — chấm điểm
router.post(
  "/:id/assignments/:assignmentId/submissions/:submissionId/grade",
  authMiddleware,
  requireRole(["teacher"]),
  ensureClassActive,
  validate(gradeSubmissionSchema),
  assignmentController.gradeSubmission.bind(assignmentController)
);

export default router;