import { z } from "zod";

export const gradeSubmissionSchema = {
  body: z.object({
    score: z.union([z.string(), z.number()]).refine((val) => {
      const parsed = typeof val === "string" ? parseFloat(val) : val;
      return !isNaN(parsed) && parsed >= 0 && parsed <= 10;
    }, {
      message: "Điểm số không hợp lệ (phải từ 0 đến 10)",
    }),
    comment: z.string().nullable().optional(),
  }),
};

export type GradeSubmissionInput = z.infer<typeof gradeSubmissionSchema.body>;