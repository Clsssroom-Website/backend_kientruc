import { z } from "zod";

export const uploadDocumentSchema = {
  body: z.object({
    classId: z.string().min(1, "classId không được để trống"),
    title: z.string().min(1, "Tiêu đề không được để trống").max(255, "Tiêu đề quá dài"),
    description: z.string().max(2000, "Mô tả quá dài").optional(),
  }),
};

export type UploadDocumentInput = z.infer<typeof uploadDocumentSchema.body>;
