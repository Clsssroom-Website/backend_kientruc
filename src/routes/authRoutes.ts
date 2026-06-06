import { Router } from "express";
import { register, login, refreshToken, logout } from "../controllers/authController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { validate } from "../middlewares/validate.js";
import { RegisterSchema, LoginSchema } from "../domain/validators/auth.validator.js";

const router = Router();

router.post("/register", validate({ body: RegisterSchema }), register);
router.post("/login", validate({ body: LoginSchema }), login);
router.post("/refresh-token", refreshToken);
router.post("/logout", authMiddleware, logout);

export default router;
