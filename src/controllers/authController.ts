import { type Request, type Response, type NextFunction } from "express";
import * as AuthService from "../services/auth.service.js";

const isProduction = process.env.NODE_ENV === "production";

// POST /api/v1/auth/register
export const register = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await AuthService.register(req.body);

    res.status(201).json({
      success: true,
      message: "Đăng ký thành công!",
      data: {
        user: result.user,
      },
    });
  } catch (err: any) {
    console.error("Error in register controller:", err);
    const statusCode = err.statusCode || 500;
    const message = err.message || "Đăng ký thất bại. Vui lòng thử lại sau.";
    res.status(statusCode).json({ success: false, message });
  }
};

// POST /api/v1/auth/login
export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await AuthService.login(req.body);

    // Set Refresh Token as HttpOnly cookie
    res.cookie("refreshToken", result.refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.status(200).json({
      success: true,
      message: "Đăng nhập thành công!",
      data: {
        accessToken: result.accessToken,
        user: result.user,
      },
    });
  } catch (err: any) {
    console.error("Error in login controller:", err);
    const statusCode = err.statusCode || 500;
    const message = err.message || "Đăng nhập thất bại. Vui lòng thử lại sau.";
    res.status(statusCode).json({ success: false, message });
  }
};

// POST /api/v1/auth/refresh-token
export const refreshToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.cookies;
    if (!refreshToken) {
      res.status(401).json({ success: false, message: "Không tìm thấy refresh token!" });
      return;
    }

    const accessToken = await AuthService.refreshAccessToken(refreshToken);

    res.status(200).json({
      success: true,
      data: { accessToken },
    });
  } catch (err: any) {
    console.error("Error in refresh token controller:", err);
    const statusCode = err.statusCode || 401;
    const message = err.message || "Refresh token thất bại.";
    res.status(statusCode).json({ success: false, message });
  }
};

// POST /api/v1/auth/logout
export const logout = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.cookies;
    
    if (refreshToken) {
      await AuthService.logout(refreshToken);
    }

    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: isProduction,
      sameSite: "strict",
    });

    res.status(200).json({ success: true, message: "Đăng xuất thành công!" });
  } catch (err) {
    console.error("Error in logout controller:", err);
    res.status(500).json({ success: false, message: "Đăng xuất thất bại." });
  }
};