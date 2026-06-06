import { Router } from "express";
import {
  joinClass,
  getEnrolledClasses,
  getClassDetails,
  getAssignments,
  getAssignmentDetail,
  submitAssignment,
  submitQuizAssignment,
  getSubmissionAndGrade,
  getDashboard,
  getGrades,
} from "../controllers/studentController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { uploadMultipleMiddleware } from "../middlewares/uploadMiddleware.js";
import { ensureClassActive } from "../middlewares/classMiddleware.js";
import { validate } from "../middlewares/validate.js";
import { joinClassSchema, submitQuizAssignmentSchema, submitEssayAssignmentSchema } from "../validators/submission.validator.js";

const router = Router();

// ─── Dashboard ────────────────────────────────────────────────────────────────

// GET /api/v1/students/dashboard
router.get("/dashboard", authMiddleware, getDashboard);

// ─── Class ────────────────────────────────────────────────────────────────────

// POST /api/v1/students/classes/join
router.post("/classes/join", authMiddleware, validate(joinClassSchema), joinClass);

// GET /api/v1/students/classes
router.get("/classes", authMiddleware, getEnrolledClasses);

// GET /api/v1/students/classes/:classId
router.get("/classes/:classId", authMiddleware, getClassDetails);

// GET /api/v1/students/classes/:classId/grades
router.get("/classes/:classId/grades", authMiddleware, getGrades);

// GET /api/v1/students/classes/:classId/assignments
router.get("/classes/:classId/assignments", authMiddleware, getAssignments);

// ─── Assignment Detail ────────────────────────────────────────────────────────

// GET /api/v1/students/assignments/:assignmentId
// Xem chi tiết bài tập (quiz questions không có isCorrect)
router.get("/assignments/:assignmentId", authMiddleware, getAssignmentDetail);

// ─── Submission ───────────────────────────────────────────────────────────────

// POST /api/v1/students/assignments/:assignmentId/submit
// Nộp bài tự luận (ESSAY) kèm file
router.post("/assignments/:assignmentId/submit", authMiddleware, ensureClassActive, uploadMultipleMiddleware, validate(submitEssayAssignmentSchema), submitAssignment);

// POST /api/v1/students/assignments/:assignmentId/submit-quiz
// Nộp bài trắc nghiệm: body { answers: [{questionId, selectedOptionId}] }
router.post("/assignments/:assignmentId/submit-quiz", authMiddleware, ensureClassActive, validate(submitQuizAssignmentSchema), submitQuizAssignment);

// GET /api/v1/students/assignments/:assignmentId/submission
// Xem bài nộp và điểm số
router.get("/assignments/:assignmentId/submission", authMiddleware, getSubmissionAndGrade);

export default router;
