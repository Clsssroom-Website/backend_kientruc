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

// ─── Teacher: Assignment CRUD ─────────────────────────────────────────────────

// GET /api/v1/classes/:id/assignments
router.get(
  "/:id/assignments",
  authMiddleware,
  assignmentController.getAssignments
);

// GET /api/v1/classes/:id/assignments/:assignmentId
router.get(
  "/:id/assignments/:assignmentId",
  authMiddleware,
  requireRole(["teacher"]),
  assignmentController.getAssignmentDetail
);

// POST /api/v1/classes/:id/assignments
router.post(
  "/:id/assignments",
  authMiddleware,
  requireRole(["teacher"]),
  ensureClassActive,
  uploadMultipleMiddleware,
  validate(createAssignmentSchema),
  assignmentController.createAssignment
);

// PUT /api/v1/classes/:id/assignments/:assignmentId
router.put(
  "/:id/assignments/:assignmentId",
  authMiddleware,
  requireRole(["teacher"]),
  ensureClassActive,
  uploadMultipleMiddleware,
  validate(updateAssignmentSchema),
  assignmentController.updateAssignment
);

// DELETE /api/v1/classes/:id/assignments/:assignmentId
router.delete(
  "/:id/assignments/:assignmentId",
  authMiddleware,
  requireRole(["teacher"]),
  ensureClassActive,
  assignmentController.deleteAssignment
);

// DELETE /api/v1/classes/:id/assignments/:assignmentId/attachments/:attachmentId
router.delete(
  "/:id/assignments/:assignmentId/attachments/:attachmentId",
  authMiddleware,
  requireRole(["teacher"]),
  ensureClassActive,
  assignmentController.deleteAttachment
);

// ─── Teacher: Submission & Grading ───────────────────────────────────────────

// GET /api/v1/classes/:id/assignments/:assignmentId/submissions
router.get(
  "/:id/assignments/:assignmentId/submissions",
  authMiddleware,
  requireRole(["teacher"]),
  assignmentController.getSubmissions
);

// POST /api/v1/classes/:id/assignments/:assignmentId/submissions/:submissionId/grade
router.post(
  "/:id/assignments/:assignmentId/submissions/:submissionId/grade",
  authMiddleware,
  requireRole(["teacher"]),
  ensureClassActive,
  validate(gradeSubmissionSchema),
  assignmentController.gradeSubmission
);

export default router;