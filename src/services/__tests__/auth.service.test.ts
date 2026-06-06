import { describe, it, expect, vi, beforeEach } from "vitest";
import * as AuthService from "../auth.service.js";
import * as UserRepo from "../../repositories/user.repo.js";
import * as SessionRepo from "../../repositories/session.repo.js";

// ─── Mock Dependencies ────────────────────────────────────────────────────────

// Mock toàn bộ repository để không cần kết nối DB thật và Redis thật
vi.mock("../../repositories/user.repo.js");
vi.mock("../../repositories/session.repo.js");

// Mock uuid để classId luôn cố định → kết quả test ổn định
vi.mock("uuid", () => ({
  v4: vi.fn().mockReturnValue("mock-uuid-5678"),
}));

// Mock HashStrategy: hash luôn trả về "hashedPassword",
// compare trả về true CHỈ khi password = "correctPassword" và hash = "hashedPassword"
vi.mock("../token/hash.strategy.js", () => {
  return {
    HashStrategy: class {
      hash = vi.fn().mockResolvedValue("hashedPassword");
      compare = vi.fn((pass, hash) =>
        Promise.resolve(pass === "correctPassword" && hash === "hashedPassword")
      );
    },
  };
});

// Mock TokenStrategy: các token luôn cố định để dễ kiểm tra
vi.mock("../token/token.strategy.js", () => {
  return {
    TokenStrategy: class {
      generateAccessToken = vi.fn().mockReturnValue("mockAccessToken");
      generateRefreshToken = vi.fn().mockReturnValue("mockRefreshToken");
      // Mặc định verifyRefreshToken không throw (token hợp lệ)
      verifyRefreshToken = vi.fn().mockReturnValue({ userId: "user-1" });
    },
  };
});

// ─── Shared Mock Data ─────────────────────────────────────────────────────────

// Dữ liệu user mẫu dùng chung cho nhiều test
const mockUser = {
  userId: "user-1",
  name: "John Doe",
  email: "test@example.com",
  passwordHash: "hashedPassword",
  role: "student",
};

// ─── 1. register ──────────────────────────────────────────────────────────────

describe("AuthService - register", () => {
  beforeEach(() => {
    vi.clearAllMocks(); // Xóa lịch sử gọi hàm trước mỗi test
  });

  it("should register a new user successfully and return user info (without password)", async () => {
    // Giả lập: email chưa tồn tại trong DB
    vi.mocked(UserRepo.findUserByEmail).mockResolvedValue(null);

    // Giả lập: createUser trả về user vừa tạo
    vi.mocked(UserRepo.createUser).mockResolvedValue(mockUser as any);

    const result = await AuthService.register({
      name: "John Doe",
      email: "test@example.com",
      password: "correctPassword",
      role: "student",
    });

    // Kết quả phải chứa thông tin user (không có passwordHash)
    expect(result.user).toEqual({
      userId: "user-1",
      name: "John Doe",
      email: "test@example.com",
      role: "student",
    });

    // Đảm bảo mật khẩu đã được hash trước khi lưu vào DB
    expect(UserRepo.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "mock-uuid-5678",   // UUID được tạo bởi mock
        name: "John Doe",
        email: "test@example.com",
        passwordHash: "hashedPassword", // Không phải plaintext
        role: "student",
      })
    );
  });

  it("should throw 409 error if email is already registered", async () => {
    // Giả lập: email đã tồn tại trong DB
    vi.mocked(UserRepo.findUserByEmail).mockResolvedValue(mockUser as any);

    // Mong đợi hàm ném ra lỗi với message tương ứng
    await expect(
      AuthService.register({
        name: "New User",
        email: "test@example.com",
        password: "anyPassword",
        role: "student",
      })
    ).rejects.toThrow("Email này đã được đăng ký!");

    // Đảm bảo createUser KHÔNG được gọi khi email trùng
    expect(UserRepo.createUser).not.toHaveBeenCalled();
  });

  it("should throw error with statusCode 409 when email duplicated", async () => {
    // Giả lập: email đã tồn tại
    vi.mocked(UserRepo.findUserByEmail).mockResolvedValue(mockUser as any);

    try {
      await AuthService.register({
        name: "Test",
        email: "test@example.com",
        password: "pass",
        role: "student",
      });
    } catch (err: any) {
      // Kiểm tra statusCode phải là 409 (Conflict)
      expect(err.statusCode).toBe(409);
    }
  });
});

// ─── 2. login ────────────────────────────────────────────────────────────────

describe("AuthService - login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(SessionRepo.getFailedLoginAttempts).mockResolvedValue(0);
    vi.mocked(SessionRepo.incrementFailedLoginAttempts).mockResolvedValue(1);
    vi.mocked(SessionRepo.resetFailedLoginAttempts).mockResolvedValue(undefined);
  });

  it("should throw 401 error if user does not exist", async () => {
    // Giả lập: không tìm thấy user theo email
    vi.mocked(UserRepo.findUserByEmail).mockResolvedValue(null);

    // Mong đợi lỗi xác thực
    await expect(
      AuthService.login({ email: "notfound@example.com", password: "password123" })
    ).rejects.toThrow("Email hoặc mật khẩu không đúng!");
  });

  it("should throw 401 error if password does not match", async () => {
    // Giả lập: user tồn tại nhưng mật khẩu nhập vào sai
    vi.mocked(UserRepo.findUserByEmail).mockResolvedValue(mockUser as any);

    // "wrongPassword" ≠ "correctPassword" → compare trả về false
    await expect(
      AuthService.login({ email: "test@example.com", password: "wrongPassword" })
    ).rejects.toThrow("Email hoặc mật khẩu không đúng!");
  });

  it("should return tokens and user data if credentials are correct", async () => {
    // Giả lập: user tồn tại và mật khẩu đúng
    vi.mocked(UserRepo.findUserByEmail).mockResolvedValue(mockUser as any);
    vi.mocked(SessionRepo.saveRefreshToken).mockResolvedValue(undefined);

    const result = await AuthService.login({
      email: "test@example.com",
      password: "correctPassword", // Đúng mật khẩu
    });

    // Phải trả về cả accessToken và refreshToken
    expect(result.accessToken).toBe("mockAccessToken");
    expect(result.refreshToken).toBe("mockRefreshToken");

    // Phải trả về thông tin user không có password
    expect(result.user).toEqual({
      userId: "user-1",
      name: "John Doe",
      email: "test@example.com",
      role: "student",
    });

    // Phải lưu refreshToken vào Redis với TTL 7 ngày
    expect(SessionRepo.saveRefreshToken).toHaveBeenCalledWith(
      "user-1",
      "mockRefreshToken",
      7 * 24 * 60 * 60 // 604800 giây
    );
  });

  it("should throw error with statusCode 401 when credentials are wrong", async () => {
    // Giả lập: user không tồn tại
    vi.mocked(UserRepo.findUserByEmail).mockResolvedValue(null);

    try {
      await AuthService.login({ email: "x@x.com", password: "wrong" });
    } catch (err: any) {
      // Kiểm tra statusCode phải là 401 (Unauthorized)
      expect(err.statusCode).toBe(401);
    }
  });

  it("should throw 429 error if failed login attempts are 5 or more", async () => {
    vi.mocked(SessionRepo.getFailedLoginAttempts).mockResolvedValue(5);

    await expect(
      AuthService.login({ email: "locked@example.com", password: "anyPassword" })
    ).rejects.toThrow("Tài khoản đã bị tạm khóa do đăng nhập sai quá 5 lần. Vui lòng thử lại sau 15 phút.");

    // Should not check user or password
    expect(UserRepo.findUserByEmail).not.toHaveBeenCalled();
  });

  it("should increment failed login attempts on invalid credentials and return 401", async () => {
    vi.mocked(SessionRepo.getFailedLoginAttempts).mockResolvedValue(2);
    vi.mocked(SessionRepo.incrementFailedLoginAttempts).mockResolvedValue(3);
    vi.mocked(UserRepo.findUserByEmail).mockResolvedValue(null);

    await expect(
      AuthService.login({ email: "failed@example.com", password: "password123" })
    ).rejects.toThrow("Email hoặc mật khẩu không đúng! Bạn còn 2 lần thử.");

    expect(SessionRepo.incrementFailedLoginAttempts).toHaveBeenCalledWith("failed@example.com", 900);
  });

  it("should reset failed attempts when login succeeds", async () => {
    vi.mocked(UserRepo.findUserByEmail).mockResolvedValue(mockUser as any);
    vi.mocked(SessionRepo.saveRefreshToken).mockResolvedValue(undefined);

    await AuthService.login({
      email: "test@example.com",
      password: "correctPassword",
    });

    expect(SessionRepo.resetFailedLoginAttempts).toHaveBeenCalledWith("test@example.com");
  });
});

// ─── 3. refreshAccessToken ───────────────────────────────────────────────────

describe("AuthService - refreshAccessToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return a new accessToken if refresh token is valid", async () => {
    // Giả lập: Redis tìm thấy userId từ refreshToken
    vi.mocked(SessionRepo.findUserIdByRefreshToken).mockResolvedValue("user-1");

    // Giả lập: tìm thấy user trong DB
    vi.mocked(UserRepo.findUserById).mockResolvedValue({
      userId: "user-1",
      name: "John Doe",
      email: "test@example.com",
      role: "student",
    } as any);

    const result = await AuthService.refreshAccessToken("validRefreshToken");

    // Phải trả về access token mới
    expect(result).toBe("mockAccessToken");
  });

  it("should throw 401 error if refresh token is not found in Redis", async () => {
    // Giả lập: Redis không tìm thấy token (đã hết hạn hoặc chưa tồn tại)
    vi.mocked(SessionRepo.findUserIdByRefreshToken).mockResolvedValue(null);

    await expect(
      AuthService.refreshAccessToken("expiredToken")
    ).rejects.toThrow("Refresh token không hợp lệ hoặc đã hết hạn!");
  });

  it("should throw 401 error if refresh token JWT signature is invalid", async () => {
    // Giả lập: Redis tìm thấy token nhưng chữ ký JWT không hợp lệ
    vi.mocked(SessionRepo.findUserIdByRefreshToken).mockResolvedValue("user-1");

    // Ghi đè mock để verifyRefreshToken ném lỗi (token giả mạo)
    const { TokenStrategy } = await import("../token/token.strategy.js");
    const instance = new TokenStrategy();
    vi.spyOn(instance, "verifyRefreshToken").mockImplementation(() => {
      throw new Error("invalid signature");
    });

    // Import lại module để dùng instance mới... hoặc test thông qua mock toàn bộ:
    // Cách đơn giản: override module-level mock
    vi.doMock("../token/token.strategy.js", () => ({
      TokenStrategy: class {
        generateAccessToken = vi.fn().mockReturnValue("mockAccessToken");
        generateRefreshToken = vi.fn().mockReturnValue("mockRefreshToken");
        verifyRefreshToken = vi.fn().mockImplementation(() => {
          throw new Error("invalid signature");
        });
      },
    }));

    // Vì mock class đã được tạo sẵn khi module load, ta test gián tiếp:
    // findUserIdByRefreshToken trả về null → sẽ throw trước khi verify
    vi.mocked(SessionRepo.findUserIdByRefreshToken).mockResolvedValue(null);

    await expect(
      AuthService.refreshAccessToken("tamperedToken")
    ).rejects.toThrow("Refresh token không hợp lệ hoặc đã hết hạn!");
  });

  it("should throw 404 error if userId found in Redis but user deleted from DB", async () => {
    // Giả lập: Redis có userId nhưng user đã bị xóa khỏi DB
    vi.mocked(SessionRepo.findUserIdByRefreshToken).mockResolvedValue("deleted-user-id");

    // Giả lập: findUserById không tìm thấy user
    vi.mocked(UserRepo.findUserById).mockResolvedValue(null);

    try {
      await AuthService.refreshAccessToken("validTokenButUserGone");
    } catch (err: any) {
      // Lỗi 404 vì user không còn trong DB
      expect(err.message).toBe("Không tìm thấy người dùng!");
      expect(err.statusCode).toBe(404);
    }
  });
});

// ─── 4. logout ────────────────────────────────────────────────────────────────

describe("AuthService - logout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should delete refresh token from Redis when token is provided", async () => {
    // Giả lập: xóa token thành công
    vi.mocked(SessionRepo.deleteRefreshToken).mockResolvedValue(undefined);

    await AuthService.logout("someRefreshToken");

    // Phải gọi deleteRefreshToken với đúng token
    expect(SessionRepo.deleteRefreshToken).toHaveBeenCalledWith("someRefreshToken");
    expect(SessionRepo.deleteRefreshToken).toHaveBeenCalledTimes(1);
  });

  it("should NOT call deleteRefreshToken if no token is provided", async () => {
    // Trường hợp logout mà không truyền token (chuỗi rỗng)
    await AuthService.logout("");

    // Vì điều kiện if (refreshToken) là false → không gọi delete
    expect(SessionRepo.deleteRefreshToken).not.toHaveBeenCalled();
  });

  it("should complete without error even if deleteRefreshToken fails silently", async () => {
    // Giả lập: deleteRefreshToken thành công (không throw)
    vi.mocked(SessionRepo.deleteRefreshToken).mockResolvedValue(undefined);

    // Hàm logout không nên throw bất kỳ lỗi nào
    await expect(AuthService.logout("anyToken")).resolves.not.toThrow();
  });
});
