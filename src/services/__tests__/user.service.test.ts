import { describe, it, expect, vi, beforeEach } from "vitest";
import * as UserService from "../user.service.js";
import * as UserRepo from "../../repositories/user.repo.js";
import { NotFoundError } from "../../errors/index.js";

// Mock User Repository để tránh kết nối đến database thật
vi.mock("../../repositories/user.repo.js");

// Dữ liệu mock mẫu của User
const mockUsersList = [
  { userId: "user-1", name: "Alice", email: "alice@test.com", role: "student" },
  { userId: "user-2", name: "Bob", email: "bob@test.com", role: "teacher" },
];

const mockUser = {
  userId: "user-1",
  name: "Alice",
  email: "alice@test.com",
  role: "student",
};

describe("UserService - getAllUsers", () => {
  beforeEach(() => {
    vi.clearAllMocks(); // Xóa lịch sử gọi mock trước mỗi test case
  });

  it("should return a list of all users", async () => {
    // Giả lập UserRepo.findAllUsers trả về danh sách mock
    vi.mocked(UserRepo.findAllUsers).mockResolvedValue(mockUsersList);

    const result = await UserService.getAllUsers();

    // Kết quả trả về phải trùng khớp với danh sách mock và đúng độ dài
    expect(result).toHaveLength(2);
    expect(result).toEqual(mockUsersList);
    expect(UserRepo.findAllUsers).toHaveBeenCalledTimes(1);
  });

  it("should return an empty array if there are no users in DB", async () => {
    // Giả lập DB trống
    vi.mocked(UserRepo.findAllUsers).mockResolvedValue([]);

    const result = await UserService.getAllUsers();

    expect(result).toEqual([]);
    expect(UserRepo.findAllUsers).toHaveBeenCalledTimes(1);
  });
});

describe("UserService - getUserById", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return user data if userId exists", async () => {
    // Giả lập tìm thấy user theo ID
    vi.mocked(UserRepo.findUserById).mockResolvedValue(mockUser);

    const result = await UserService.getUserById("user-1");

    // Kết quả trả về phải khớp với user mock
    expect(result).toEqual(mockUser);
    expect(UserRepo.findUserById).toHaveBeenCalledWith("user-1");
  });

  it("should throw NotFoundError if userId does not exist", async () => {
    // Giả lập không tìm thấy user (trả về null)
    vi.mocked(UserRepo.findUserById).mockResolvedValue(null);

    // Mong đợi ném lỗi NotFoundError
    await expect(UserService.getUserById("ghost-id"))
      .rejects.toThrow(NotFoundError);

    expect(UserRepo.findUserById).toHaveBeenCalledWith("ghost-id");
  });
});
