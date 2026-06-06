import { z } from "zod";

export const createAssignmentSchema = {
  body: z.object({
    title: z.string()
      .min(1, "Tiêu đề bài tập không được để trống")
      .max(255, "Tiêu đề quá dài"),
    description: z.string().nullable().optional(),
    deadline: z.string()
      .min(1, "Hạn nộp bài không được để trống")
      .refine((val) => !isNaN(Date.parse(val)), {
        message: "Định dạng hạn nộp bài không hợp lệ (cần định dạng ISO Date)",
      }),
    typeAssignment: z.string().nullable().optional(),
    questions: z.any().optional(), // Câu hỏi trắc nghiệm truyền lên dưới dạng chuỗi JSON
  }),
};

export const updateAssignmentSchema = {
  body: z.object({
    title: z.string()
      .min(1, "Tiêu đề bài tập không được để trống")
      .max(255, "Tiêu đề quá dài")
      .optional(),
    description: z.string().nullable().optional(),
    deadline: z.string()
      .refine((val) => !isNaN(Date.parse(val)), {
        message: "Định dạng hạn nộp bài không hợp lệ",
      })
      .optional(),
    typeAssignment: z.string().nullable().optional(),
    questions: z.any().optional(),
    keepAttachmentIds: z.any().optional(),
  }),
};

export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema.body>;
export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema.body>;
