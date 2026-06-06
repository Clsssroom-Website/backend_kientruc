import { AssignmentRepository, QuizQuestionInput } from "../repositories/assignment.repo.js";
import { MinioStorageService, IStorageService } from "./storage/minioStorage.js";
import { NotFoundError, ForbiddenError, BadRequestError } from "../errors/index.js";
import prisma from "../config/prisma.js";
import { eventBus } from "../events/eventBus.js";

export class AssignmentService {
  private assignmentRepo: AssignmentRepository;
  private storageService: IStorageService;

  constructor() {
    this.assignmentRepo = new AssignmentRepository();
    this.storageService = new MinioStorageService("classroom-assignments");
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /** Kiểm tra teacher có quyền trên bài tập không */
  private async ensureTeacherOwnsAssignment(teacherId: string, assignmentId: string) {
    const assignment = await this.assignmentRepo.findAssignmentById(assignmentId);
    if (!assignment) throw new NotFoundError("Không tìm thấy bài tập.");
    const cls = assignment.Classes as any;
    if (cls?.teacherId !== teacherId) {
      throw new ForbiddenError("Bạn không có quyền thao tác với bài tập này.");
    }
    return assignment;
  }

  /** Validate danh sách câu hỏi trắc nghiệm */
  private validateQuizQuestions(questions: any[]): QuizQuestionInput[] {
    return questions.map((q, i) => {
      if (!q.questionText || String(q.questionText).trim() === "") {
        throw new BadRequestError(`Câu hỏi ${i + 1} không được để trống nội dung.`);
      }
      if (!Array.isArray(q.options) || q.options.length < 2) {
        throw new BadRequestError(`Câu hỏi ${i + 1} phải có ít nhất 2 đáp án.`);
      }
      const hasCorrect = q.options.some((o: any) => o.isCorrect === true);
      if (!hasCorrect) {
        throw new BadRequestError(`Câu hỏi ${i + 1} phải có ít nhất 1 đáp án đúng.`);
      }
      return {
        questionText: String(q.questionText).trim(),
        points: Number(q.points) > 0 ? Number(q.points) : 1,
        sortOrder: Number(q.sortOrder) > 0 ? Number(q.sortOrder) : i + 1,
        options: q.options.map((o: any) => ({
          optionText: String(o.optionText ?? "").trim(),
          isCorrect: Boolean(o.isCorrect),
        })),
      };
    });
  }

  /** Serialize BigInt fileSize và sinh presigned URL cho assignment attachments */
  private async serializeAttachments(assignment: any) {
    if (!assignment) return assignment;

    let processedAttachments = [];
    if (assignment.AssignmentAttachments && assignment.AssignmentAttachments.length > 0) {
      processedAttachments = await Promise.all(
        assignment.AssignmentAttachments.map(async (att: any) => {
          let presignedUrl = att.fileUrl;
          let downloadUrl = att.fileUrl;
          try {
            presignedUrl = await this.storageService.getPresignedUrl(att.fileUrl, false, att.fileName || "download");
            downloadUrl = await this.storageService.getPresignedUrl(att.fileUrl, true, att.fileName || "download");
          } catch {
            console.warn("Could not generate presigned URL for", att.fileUrl);
          }
          return {
            ...att,
            fileSize: att.fileSize != null ? att.fileSize.toString() : null,
            fileUrl: presignedUrl,
            downloadUrl,
          };
        })
      );
    }

    return {
      ...assignment,
      AssignmentAttachments: processedAttachments,
    };
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  /**
   * Tạo bài tập mới — chỉ teacher sở hữu lớp mới được tạo.
   * Nếu typeAssignment = "MULTIPLE_CHOICE", bắt buộc phải có questions[].
   */
  public async createAssignment(
    teacherId: string,
    classId: string,
    data: {
      title: string;
      description?: string;
      deadline: string;
      typeAssignment?: string;
      questions?: any[];
      files?: Express.Multer.File[];
    }
  ) {
    // 1. Kiểm tra lớp tồn tại và teacher có quyền
    const classRecord = await prisma.classes.findUnique({
      where: { classId },
      select: { teacherId: true, className: true },
    });
    if (!classRecord) throw new NotFoundError("Không tìm thấy lớp học.");
    if (classRecord.teacherId !== teacherId) {
      throw new ForbiddenError("Bạn không có quyền giao bài cho lớp học này.");
    }

    // 2. Validate
    if (!data.title || data.title.trim() === "") {
      throw new BadRequestError("Tiêu đề bài tập không được để trống.");
    }
    const deadlineDate = new Date(data.deadline);
    if (isNaN(deadlineDate.getTime())) {
      throw new BadRequestError("Hạn nộp không hợp lệ.");
    }

    const typeAssignment = data.typeAssignment ?? "ESSAY";

    // 3. Validate quiz questions nếu là MULTIPLE_CHOICE
    let validatedQuestions: QuizQuestionInput[] | undefined;
    if (typeAssignment === "MULTIPLE_CHOICE") {
      if (!Array.isArray(data.questions) || data.questions.length === 0) {
        throw new BadRequestError("Bài kiểm tra trắc nghiệm phải có ít nhất 1 câu hỏi.");
      }
      validatedQuestions = this.validateQuizQuestions(data.questions);
    }

    // 4. Lấy tên giáo viên
    const teacherRecord = await prisma.users.findUnique({
      where: { userId: teacherId },
      select: { name: true },
    });
    const teacherName = teacherRecord?.name || "Giáo viên";

    // 5. Tạo bài tập
    const assignment = await this.assignmentRepo.createAssignment({
      classId,
      title: data.title.trim(),
      description: data.description?.trim(),
      deadline: deadlineDate,
      typeAssignment,
    });

    // 6. Lưu quiz questions (nếu có)
    if (validatedQuestions && validatedQuestions.length > 0) {
      await this.assignmentRepo.upsertQuizQuestions(assignment.assignmentId, validatedQuestions);
    }

    // 7. Phát sự kiện
    eventBus.emit("assignment.created", {
      assignmentId: assignment.assignmentId,
      classId,
      title: assignment.title,
      description: assignment.description,
      deadline: assignment.deadline,
      className: classRecord.className,
      teacherName,
    });

    // 8. Upload files lên MinIO và tạo attachments
    if (data.files && data.files.length > 0) {
      const attachmentsToCreate: { fileName: string; fileUrl: string; fileSize?: number }[] = [];
      for (const file of data.files) {
        if (!file.buffer || file.buffer.length === 0) {
          throw new BadRequestError(`File "${file.originalname}" không hợp lệ hoặc rỗng.`);
        }
        const uploadResult = await this.storageService.uploadFile(file.buffer, file.originalname, file.mimetype);
        attachmentsToCreate.push({ fileName: file.originalname, fileUrl: uploadResult.url, fileSize: uploadResult.size });
      }
      await this.assignmentRepo.createAttachments(assignment.assignmentId, attachmentsToCreate);
    }

    // 9. Fetch lại để trả về đầy đủ
    const created = await this.assignmentRepo.findAssignmentById(assignment.assignmentId);
    return this.serializeAttachments(created);
  }

  /**
   * Lấy danh sách bài tập của lớp — teacher sở hữu lớp
   */
  public async getAssignmentsByClassId(teacherId: string, classId: string) {
    const classRecord = await prisma.classes.findUnique({
      where: { classId },
      select: { teacherId: true },
    });
    if (!classRecord) throw new NotFoundError("Không tìm thấy lớp học.");
    if (classRecord.teacherId !== teacherId) {
      throw new ForbiddenError("Bạn không có quyền xem bài tập của lớp học này.");
    }

    const assignments = await this.assignmentRepo.findAssignmentsByClassId(classId);
    const serialized = await Promise.all(
      assignments.map(async (a: any) => {
        const s = await this.serializeAttachments(a);
        return {
          ...s,
          totalSubmissions: a._count?.Submissions ?? 0,
          _count: undefined,
        };
      })
    );
    return serialized;
  }

  /**
   * Lấy chi tiết một bài tập — teacher sở hữu lớp
   */
  public async getAssignmentById(teacherId: string, assignmentId: string) {
    const assignment = await this.ensureTeacherOwnsAssignment(teacherId, assignmentId);
    const serialized = await this.serializeAttachments(assignment);
    const totalSubmissions = await prisma.submissions.count({
      where: { assignmentId },
    });
    return {
      ...serialized,
      totalSubmissions,
    };
  }

  /**
   * Cập nhật bài tập — chỉ teacher sở hữu lớp
   */
  public async updateAssignment(
    teacherId: string,
    assignmentId: string,
    data: {
      title?: string;
      description?: string;
      deadline?: string;
      typeAssignment?: string;
      questions?: any[];
      keepAttachmentIds?: string[];
      files?: Express.Multer.File[];
    }
  ) {
    const assignment = await this.ensureTeacherOwnsAssignment(teacherId, assignmentId);

    // Kiểm tra xem bài tập đã có học sinh nộp bài chưa
    const totalSubmissions = await prisma.submissions.count({
      where: { assignmentId },
    });

    if (totalSubmissions > 0 && data.questions !== undefined) {
      throw new BadRequestError("Không thể chỉnh sửa câu hỏi/đáp án trắc nghiệm vì bài tập đã có học sinh nộp bài.");
    }

    // Validate
    if (data.typeAssignment !== undefined && data.typeAssignment !== assignment.typeAssignment) {
      throw new BadRequestError("Không được phép thay đổi loại bài tập sau khi đã tạo.");
    }

    if (data.title !== undefined && data.title.trim() === "") {
      throw new BadRequestError("Tiêu đề không được để trống.");
    }

    let deadlineDate: Date | undefined;
    if (data.deadline) {
      deadlineDate = new Date(data.deadline);
      if (isNaN(deadlineDate.getTime())) throw new BadRequestError("Hạn nộp không hợp lệ.");
    }

    const typeAssignment = assignment.typeAssignment;

    // Validate quiz questions nếu cập nhật sang MULTIPLE_CHOICE
    let validatedQuestions: QuizQuestionInput[] | undefined;
    if (data.questions !== undefined) {
      if (typeAssignment === "MULTIPLE_CHOICE") {
        if (data.questions.length === 0) {
          throw new BadRequestError("Bài kiểm tra trắc nghiệm phải có ít nhất 1 câu hỏi.");
        }
        validatedQuestions = this.validateQuizQuestions(data.questions);
      }
    }

    // Cập nhật thông tin bài tập
    await this.assignmentRepo.updateAssignment(assignmentId, {
      title: data.title?.trim(),
      description: data.description?.trim(),
      deadline: deadlineDate,
      typeAssignment: data.typeAssignment,
    });

    // Cập nhật quiz questions (nếu cần)
    if (validatedQuestions !== undefined) {
      await this.assignmentRepo.upsertQuizQuestions(assignmentId, validatedQuestions);
    } else if (typeAssignment === "ESSAY" && data.typeAssignment === "ESSAY") {
      // Chuyển sang ESSAY → xóa quiz questions cũ
      await this.assignmentRepo.deleteQuizQuestions(assignmentId);
    }

    // Quản lý attachments
    const hasNewFiles = data.files && data.files.length > 0;
    const isManagingAttachments = data.keepAttachmentIds !== undefined || hasNewFiles;

    if (isManagingAttachments) {
      const oldAttachments = (assignment.AssignmentAttachments as any[]) || [];
      const keepIds = data.keepAttachmentIds ?? [];

      for (const old of oldAttachments) {
        if (!keepIds.includes(old.attachmentId) && old.fileUrl) {
          await (this.storageService as MinioStorageService).deleteFile(old.fileUrl);
        }
      }

      await this.assignmentRepo.deleteAllAttachments(assignmentId);

      const attachmentsToCreate: { fileName: string; fileUrl: string; fileSize?: number }[] = [];

      for (const old of oldAttachments) {
        if (keepIds.includes(old.attachmentId)) {
          attachmentsToCreate.push({
            fileName: old.fileName,
            fileUrl: old.fileUrl,
            fileSize: old.fileSize ? Number(old.fileSize) : undefined,
          });
        }
      }

      if (hasNewFiles) {
        for (const file of data.files!) {
          if (!file.buffer || file.buffer.length === 0) {
            throw new BadRequestError(`File "${file.originalname}" không hợp lệ hoặc rỗng.`);
          }
          const uploadResult = await this.storageService.uploadFile(file.buffer, file.originalname, file.mimetype);
          attachmentsToCreate.push({ fileName: file.originalname, fileUrl: uploadResult.url, fileSize: uploadResult.size });
        }
      }

      if (attachmentsToCreate.length > 0) {
        await this.assignmentRepo.createAttachments(assignmentId, attachmentsToCreate);
      }
    }

    const updated = await this.assignmentRepo.findAssignmentById(assignmentId);
    const serialized = await this.serializeAttachments(updated);
    return {
      ...serialized,
      totalSubmissions,
    };
  }

  /**
   * Xóa một file đính kèm đơn lẻ
   */
  public async deleteAttachment(teacherId: string, assignmentId: string, attachmentId: string) {
    const assignment = await this.ensureTeacherOwnsAssignment(teacherId, assignmentId);
    const attachment = (assignment.AssignmentAttachments as any[])?.find(
      (a) => a.attachmentId === attachmentId
    );
    if (!attachment) throw new NotFoundError("Không tìm thấy file đính kèm.");
    if (attachment.fileUrl) {
      await (this.storageService as MinioStorageService).deleteFile(attachment.fileUrl);
    }
    return this.assignmentRepo.deleteAttachment(attachmentId);
  }

  /**
   * Xóa bài tập — chỉ teacher sở hữu lớp
   */
  public async deleteAssignment(teacherId: string, assignmentId: string) {
    const assignment = await this.ensureTeacherOwnsAssignment(teacherId, assignmentId);

    const totalSubmissions = await prisma.submissions.count({
      where: { assignmentId },
    });
    if (totalSubmissions > 0) {
      throw new BadRequestError("Không thể xóa bài tập này vì đã có học sinh nộp bài.");
    }

    for (const attachment of (assignment.AssignmentAttachments as any[]) ?? []) {
      if (attachment.fileUrl) {
        await (this.storageService as MinioStorageService).deleteFile(attachment.fileUrl);
      }
    }
    await this.assignmentRepo.deleteAllAttachments(assignmentId);
    return this.assignmentRepo.deleteAssignment(assignmentId);
  }

  /**
   * Lấy danh sách bài nộp của bài tập (chỉ dành cho giáo viên)
   */
  public async getSubmissionsByAssignmentId(teacherId: string, assignmentId: string) {
    await this.ensureTeacherOwnsAssignment(teacherId, assignmentId);
    const submissions = await this.assignmentRepo.findSubmissionsByAssignmentId(assignmentId);
    const submissionStorageService = new MinioStorageService("classroom-submissions");

    const serialized = await Promise.all(
      submissions.map(async (sub: any) => {
        const processedAttachments = await Promise.all(
          sub.SubmissionAttachments.map(async (att: any) => {
            let presignedUrl = att.fileUri;
            let downloadUrl = att.fileUri;
            try {
              presignedUrl = await submissionStorageService.getPresignedUrl(att.fileUri, false, att.fileName || "download");
              downloadUrl = await submissionStorageService.getPresignedUrl(att.fileUri, true, att.fileName || "download");
            } catch {
              console.warn("Could not generate presigned URL for submission file:", att.fileUri);
            }
            return {
              attachmentId: att.attachmentId,
              submissionId: att.submissionId,
              fileName: att.fileName,
              fileUrl: presignedUrl,
              downloadUrl,
              fileSize: att.fileSize != null ? att.fileSize.toString() : null,
              uploadedAt: att.uploadedAt,
            };
          })
        );

        return {
          submissionId: sub.submissionId,
          assignmentId: sub.assignmentId,
          studentId: sub.studentId,
          submittedAt: sub.submittedAt,
          status: sub.status,
          student: sub.Users
            ? { userId: sub.Users.userId, name: sub.Users.name, email: sub.Users.email }
            : null,
          SubmissionAttachments: processedAttachments,
          quizAnswers: (sub.StudentQuizAnswers ?? []).map((ans: any) => ({
            questionId: ans.questionId,
            selectedOptionId: ans.selectedOptionId,
            selectedOptionText: ans.QuizOptions?.optionText || "",
            questionText: ans.QuizQuestions?.questionText || "",
            isCorrect: ans.QuizOptions?.isCorrect || false,
          })),
          grade:
            sub.Grades && sub.Grades.length > 0
              ? {
                  gradeId: sub.Grades[0].gradeId,
                  score: sub.Grades[0].score,
                  comment: sub.Grades[0].comment,
                  gradedAt: sub.Grades[0].gradedAt,
                }
              : null,
        };
      })
    );

    return serialized;
  }

  /**
   * Chấm điểm cho bài nộp của học sinh (chỉ dành cho giáo viên)
   */
  public async gradeSubmission(
    teacherId: string,
    assignmentId: string,
    submissionId: string,
    payload: { score: number; comment?: string }
  ) {
    const assignment = await this.ensureTeacherOwnsAssignment(teacherId, assignmentId);
    const submission = await prisma.submissions.findUnique({ where: { submissionId } });
    if (!submission) throw new NotFoundError("Không tìm thấy bài nộp.");
    if (submission.assignmentId !== assignmentId) {
      throw new BadRequestError("Bài nộp không thuộc bài tập này.");
    }

    return this.assignmentRepo.upsertGrade({
      submissionId,
      studentId: submission.studentId,
      classId: assignment.classId,
      assignmentId,
      score: payload.score,
      comment: payload.comment,
    });
  }
}

export const assignmentService = new AssignmentService();
