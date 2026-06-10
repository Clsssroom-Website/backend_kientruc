import { Router } from "express";
import { studentController } from "../controllers/studentController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { uploadMultipleMiddleware } from "../middlewares/uploadMiddleware.js";
import { ensureClassActive } from "../middlewares/classMiddleware.js";
import { validate } from "../middlewares/validate.js";
import {
  joinClassSchema,
  submitQuizAssignmentSchema,
  submitEssayAssignmentSchema,
} from "../validators/submission.validator.js";

const router = Router();

// ─── Dashboard ────────────────────────────────────────────────────────────────

// GET /api/v1/students/dashboard
router.get("/dashboard", authMiddleware, studentController.getDashboard);

// ─── Class ────────────────────────────────────────────────────────────────────

// POST /api/v1/students/classes/join
router.post(
  "/classes/join",
  authMiddleware,
  validate(joinClassSchema),
  studentController.joinClass
);

// GET /api/v1/students/classes
router.get("/classes", authMiddleware, studentController.getEnrolledClasses);

// GET /api/v1/students/classes/:classId
router.get("/classes/:classId", authMiddleware, studentController.getClassDetails);

// GET /api/v1/students/classes/:classId/grades
router.get("/classes/:classId/grades", authMiddleware, studentController.getGrades);

// GET /api/v1/students/classes/:classId/assignments
router.get(
  "/classes/:classId/assignments",
  authMiddleware,
  studentController.getAssignments
);

// ─── Assignment Detail ────────────────────────────────────────────────────────

// GET /api/v1/students/assignments/:assignmentId
router.get(
  "/assignments/:assignmentId",
  authMiddleware,
  studentController.getAssignmentDetail
);

// ─── Submission ───────────────────────────────────────────────────────────────

// POST /api/v1/students/assignments/:assignmentId/submit
// Nộp bài tự luận (ESSAY) kèm file — Facade lo upload MinIO
router.post(
  "/assignments/:assignmentId/submit",
  authMiddleware,
  ensureClassActive,
  uploadMultipleMiddleware,
  validate(submitEssayAssignmentSchema),
  studentController.submitAssignment
);

// POST /api/v1/students/assignments/:assignmentId/submit-quiz
// Nộp bài trắc nghiệm: body { answers: [{questionId, selectedOptionId}] }
router.post(
  "/assignments/:assignmentId/submit-quiz",
  authMiddleware,
  ensureClassActive,
  validate(submitQuizAssignmentSchema),
  studentController.submitQuizAssignment
);

// GET /api/v1/students/assignments/:assignmentId/submission
// Xem bài nộp và điểm số
router.get(
  "/assignments/:assignmentId/submission",
  authMiddleware,
  studentController.getSubmissionAndGrade
);

export default router;
