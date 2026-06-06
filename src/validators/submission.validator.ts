import { z } from "zod";

export const joinClassSchema = {
  body: z.object({
    joinCode: z.string().min(1, "Mã tham gia không được để trống"),
  }),
};

export const submitQuizAssignmentSchema = {
  body: z.object({
    answers: z.union([
      z.string(),
      z.array(
        z.object({
          questionId: z.string().min(1, "ID câu hỏi không được để trống"),
          selectedOptionId: z.string().min(1, "ID đáp án không được để trống"),
        })
      )
    ]).refine((val) => {
      if (typeof val === "string") {
        try {
          const parsed = JSON.parse(val);
          return Array.isArray(parsed);
        } catch {
          return false;
        }
      }
      return true;
    }, { message: "Answers phải là một mảng hoặc chuỗi JSON hợp lệ" }),
  }),
};

export const submitEssayAssignmentSchema = {
  files: z.custom<Express.Multer.File[]>()
    .refine((files) => files && Array.isArray(files) && files.length > 0, {
      message: "Vui lòng đính kèm ít nhất một file cho bài tập tự luận.",
    }),
};

export type JoinClassInput = z.infer<typeof joinClassSchema.body>;
export type SubmitQuizAssignmentInput = z.infer<typeof submitQuizAssignmentSchema.body>;
