import { Router } from "express";
import { classController } from "../controllers/classController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { ensureClassActive } from "../middlewares/classMiddleware.js";

const router = Router();

// ─── GET ──────────────────────────────────────────────────────────────────────

// GET /api/v1/classes
// Teacher → lớp do mình tạo | Student → lớp đã tham gia
router.get("/", authMiddleware, classController.getAllClasses);

// GET /api/v1/classes/:id
router.get("/:id", authMiddleware, classController.getClassById);

// GET /api/v1/classes/:id/stream
router.get("/:id/stream", authMiddleware, classController.getClassStream);

// GET /api/v1/classes/:id/students (chỉ teacher)
router.get("/:id/students", authMiddleware, classController.getClassStudents);

// GET /api/v1/classes/:id/grades (chỉ teacher chủ lớp)
router.get("/:id/grades", authMiddleware, classController.getClassGrades);

// ─── POST ─────────────────────────────────────────────────────────────────────

// POST /api/v1/classes (chỉ teacher)
router.post("/", authMiddleware, classController.createClass);

// ─── PUT ──────────────────────────────────────────────────────────────────────

// PUT /api/v1/classes/:id (chỉ teacher chủ lớp, lớp phải ACTIVE)
router.put("/:id", authMiddleware, ensureClassActive, classController.updateClass);

// ─── DELETE ───────────────────────────────────────────────────────────────────

// DELETE /api/v1/classes/:id/students/:studentId (chỉ teacher chủ lớp, lớp phải ACTIVE)
router.delete("/:id/students/:studentId", authMiddleware, ensureClassActive, classController.removeStudentFromClass);

// DELETE /api/v1/classes/:id (chỉ teacher chủ lớp, lớp phải ACTIVE)
router.delete("/:id", authMiddleware, ensureClassActive, classController.deleteClass);

export default router;
