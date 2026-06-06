import express from "express";
import { getAllUsers, getUserById } from "../controllers/userController.js";

const router = express.Router();

// GET /api/users - Lấy danh sách tất cả users
router.get("/", getAllUsers);

// GET /api/users/:id - Lấy thông tin một user
router.get("/:id", getUserById);

export default router;
