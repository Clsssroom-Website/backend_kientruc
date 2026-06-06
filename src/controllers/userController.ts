import { type NextFunction, type Request, type Response } from "express";
import * as UserService from "../services/user.service.js";

// Lấy danh sách tất cả users
export const getAllUsers = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const users = await UserService.getAllUsers();
    res.json({ success: true, data: users });
  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false, message: "Lấy danh sách users thất bại!" });
  }
};

// Lấy thông tin một user theo ID
export const getUserById = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.params.id;
    const user = await UserService.getUserById(userId);
    
    res.json({ success: true, data: user });
  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false, message: "Lấy thông tin user thất bại!" });
  }
};
