import * as UserRepo from "../repositories/user.repo.js";
import { NotFoundError } from "../errors/index.js";

// Lấy danh sách tất cả users
export const getAllUsers = async () => {
  return UserRepo.findAllUsers();
};

// Lấy thông tin user theo ID
export const getUserById = async (userId: string) => {
  const user = await UserRepo.findUserById(userId);
  if (!user) {
    throw new NotFoundError("Không tìm thấy người dùng (User not found).");
  }
  return user;
};
