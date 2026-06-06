import { z } from "zod";

export const createClassSchema = z.object({
  body: z.object({
    className: z
      .string()
      .min(1, "Tên lớp không được để trống.")
      .max(100, "Tên lớp không được vượt quá 100 ký tự."),
    description: z
      .string()
      .max(500, "Mô tả không được vượt quá 500 ký tự.")
      .optional(),
    room: z
      .string()
      .max(50, "Tên phòng không được vượt quá 50 ký tự.")
      .optional(),
    topic: z
      .string()
      .max(100, "Chủ đề không được vượt quá 100 ký tự.")
      .optional(),
  }),
});

export const updateClassSchema = z.object({
  body: z.object({
    className: z
      .string()
      .min(1, "Tên lớp không được để trống.")
      .max(100, "Tên lớp không được vượt quá 100 ký tự.")
      .optional(),
    description: z
      .string()
      .max(500, "Mô tả không được vượt quá 500 ký tự.")
      .optional(),
    room: z
      .string()
      .max(50, "Tên phòng không được vượt quá 50 ký tự.")
      .optional(),
    topic: z
      .string()
      .max(100, "Chủ đề không được vượt quá 100 ký tự.")
      .optional(),
    status: z
      .enum(["ACTIVE", "ENDED"], {
        message: "Trạng thái lớp học không hợp lệ.",
      })
      .optional(),
  }),
});

export type CreateClassInput = z.infer<typeof createClassSchema>["body"];
export type UpdateClassInput = z.infer<typeof updateClassSchema>["body"];

