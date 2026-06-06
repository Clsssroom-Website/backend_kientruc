import { z } from "zod";

export const RegisterSchema = z.object({
  name: z.string().trim().min(1, "Họ tên không được để trống.").min(2, "Họ tên phải có ít nhất 2 ký tự.").max(255, "Họ tên không được vượt quá 255 ký tự."),
  email: z.email({ message: "Email không hợp lệ." }).trim().min(1, "Vui lòng nhập địa chỉ email.").max(255, "Email không được vượt quá 255 ký tự."),
  password: z.string().min(1, "Vui lòng nhập mật khẩu.").min(7, "Mật khẩu phải có ít nhất 7 ký tự.").max(20, "Mật khẩu không được vượt quá 20 ký tự."),
  role: z.enum(["student", "teacher"], {
    message: "Vai trò chọn không hợp lệ.",
  }),
});

export const LoginSchema = z.object({
  email: z.email({ message: "Email không hợp lệ." }).trim().min(1, "Vui lòng nhập địa chỉ email.").max(255, "Email không được vượt quá 255 ký tự."),
  password: z.string().min(1, "Vui lòng nhập mật khẩu.").max(20, "Mật khẩu không được vượt quá 20 ký tự."),
});

export type RegisterDTO = z.infer<typeof RegisterSchema>;
export type LoginDTO = z.infer<typeof LoginSchema>;
