import prisma from "../config/prisma.js";

// Lấy danh sách tất cả users
export const findAllUsers = async () => {
  return prisma.users.findMany({
    select: { userId: true, name: true, email: true, role: true },
  });
};

// Tìm user theo email
export const findUserByEmail = async (email: string) => {
  return prisma.users.findUnique({ where: { email } });
};

// Tìm user theo ID
export const findUserById = async (userId: string) => {
  return prisma.users.findUnique({
    where: { userId },
    select: { userId: true, name: true, email: true, role: true },
  });
};

// Tạo user mới
export const createUser = async (data: {
  userId: string;
  name: string;
  email: string;
  passwordHash: string;
  role: string;
}) => {
  return prisma.users.create({ data });
};
