import prisma from "../config/prisma.js";
import { v4 as uuidv4 } from "uuid";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QuizOptionInput {
  optionText: string;
  isCorrect: boolean;
}

export interface QuizQuestionInput {
  questionText: string;
  points: number;
  sortOrder: number;
  options: QuizOptionInput[];
}

// ─── Assignment CRUD ──────────────────────────────────────────────────────────

export class AssignmentRepository {
  /**
   * Tạo bài tập mới (không bao gồm quiz questions — gọi upsertQuizQuestions riêng)
   */
  public async createAssignment(data: {
    classId: string;
    title: string;
    description?: string;
    deadline: Date;
    typeAssignment?: string;
    status?: string;
  }) {
    const assignmentId = uuidv4();
    return prisma.assignments.create({
      data: {
        assignmentId,
        classId: data.classId,
        title: data.title,
        description: data.description ?? "",
        deadline: data.deadline,
        typeAssignment: data.typeAssignment ?? "ESSAY",
        status: data.status ?? "ACTIVE",
      },
      include: {
        AssignmentAttachments: true,
        QuizQuestions: {
          include: { QuizOptions: true },
          orderBy: { sortOrder: "asc" },
        },
      },
    });
  }

  /**
   * Lấy danh sách bài tập của một lớp
   */
  public async findAssignmentsByClassId(classId: string) {
    return prisma.assignments.findMany({
      where: { classId },
      orderBy: { createdAt: "desc" },
      include: {
        AssignmentAttachments: true,
        QuizQuestions: {
          include: { QuizOptions: true },
          orderBy: { sortOrder: "asc" },
        },
        _count: {
          select: { Submissions: true },
        },
      },
    });
  }

  /**
   * Lấy chi tiết một bài tập theo ID (bao gồm quiz questions đầy đủ)
   */
  public async findAssignmentById(assignmentId: string) {
    return prisma.assignments.findUnique({
      where: { assignmentId },
      include: {
        AssignmentAttachments: true,
        QuizQuestions: {
          include: { QuizOptions: true },
          orderBy: { sortOrder: "asc" },
        },
        Classes: {
          select: { classId: true, className: true, teacherId: true },
        },
      },
    });
  }

  /**
   * Cập nhật thông tin cơ bản của bài tập (không bao gồm quiz questions)
   */
  public async updateAssignment(
    assignmentId: string,
    data: {
      title?: string;
      description?: string;
      deadline?: Date;
      typeAssignment?: string;
      status?: string;
    }
  ) {
    return prisma.assignments.update({
      where: { assignmentId },
      data,
      include: {
        AssignmentAttachments: true,
        QuizQuestions: {
          include: { QuizOptions: true },
          orderBy: { sortOrder: "asc" },
        },
      },
    });
  }

  /**
   * Xóa bài tập
   */
  public async deleteAssignment(assignmentId: string) {
    return prisma.assignments.delete({ where: { assignmentId } });
  }

  // ─── Quiz Questions ────────────────────────────────────────────────────────

  /**
   * Xóa toàn bộ câu hỏi của bài tập (Cascade sẽ xóa cả QuizOptions)
   */
  public async deleteQuizQuestions(assignmentId: string) {
    return prisma.quizQuestions.deleteMany({ where: { assignmentId } });
  }

  /**
   * Upsert (xóa cũ → thêm mới) toàn bộ câu hỏi trắc nghiệm của bài tập.
   * Chạy trong một transaction để đảm bảo tính nguyên vẹn dữ liệu.
   */
  public async upsertQuizQuestions(
    assignmentId: string,
    questions: QuizQuestionInput[]
  ) {
    return prisma.$transaction(async (tx) => {
      // 1. Xóa toàn bộ câu hỏi cũ (Cascade xóa cả options)
      await tx.quizQuestions.deleteMany({ where: { assignmentId } });

      // 2. Tạo câu hỏi và đáp án mới
      for (const q of questions) {
        const questionId = uuidv4();
        await tx.quizQuestions.create({
          data: {
            questionId,
            assignmentId,
            questionText: q.questionText,
            points: q.points,
            sortOrder: q.sortOrder,
            QuizOptions: {
              create: q.options.map((opt) => ({
                optionId: uuidv4(),
                optionText: opt.optionText,
                isCorrect: opt.isCorrect,
              })),
            },
          },
        });
      }

      // 3. Trả về danh sách câu hỏi đã tạo
      return tx.quizQuestions.findMany({
        where: { assignmentId },
        include: { QuizOptions: true },
        orderBy: { sortOrder: "asc" },
      });
    });
  }

  // ─── Attachments ──────────────────────────────────────────────────────────

  /**
   * Thêm nhiều file đính kèm vào bài tập
   */
  public async createAttachments(
    assignmentId: string,
    attachments: { fileName: string; fileUrl: string; fileSize?: number }[]
  ) {
    const data = attachments.map((a) => ({
      attachmentId: uuidv4(),
      assignmentId,
      fileName: a.fileName,
      fileUrl: a.fileUrl,
      fileSize: a.fileSize ? BigInt(a.fileSize) : null,
    }));
    return prisma.assignmentAttachments.createMany({ data });
  }

  /**
   * Xóa một file đính kèm theo ID
   */
  public async deleteAttachment(attachmentId: string) {
    return prisma.assignmentAttachments.delete({ where: { attachmentId } });
  }

  /**
   * Xóa tất cả file đính kèm của một bài tập
   */
  public async deleteAllAttachments(assignmentId: string) {
    return prisma.assignmentAttachments.deleteMany({ where: { assignmentId } });
  }

  // ─── Submissions ───────────────────────────────────────────────────────────

  /**
   * Lấy danh sách bài nộp của bài tập (dành cho giáo viên)
   */
  public async findSubmissionsByAssignmentId(assignmentId: string) {
    return prisma.submissions.findMany({
      where: { assignmentId },
      include: {
        Users: {
          select: {
            userId: true,
            name: true,
            email: true,
          },
        },
        SubmissionAttachments: true,
        StudentQuizAnswers: {
          include: {
            QuizQuestions: { select: { questionId: true, questionText: true, points: true } },
            QuizOptions: { select: { optionId: true, optionText: true, isCorrect: true } },
          },
        },
        Grades: true,
      },
      orderBy: { submittedAt: "desc" },
    });
  }

  // ─── Grades ────────────────────────────────────────────────────────────────

  /**
   * Tạo hoặc cập nhật điểm số cho bài nộp
   */
  public async upsertGrade(payload: {
    submissionId: string;
    studentId: string;
    classId: string;
    assignmentId: string;
    score: number;
    comment?: string;
  }) {
    const { submissionId, studentId, classId, assignmentId, score, comment } = payload;

    const existingGrade = await prisma.grades.findFirst({
      where: { submissionId },
    });

    if (existingGrade) {
      return prisma.grades.update({
        where: { gradeId: existingGrade.gradeId },
        data: { score, comment, gradedAt: new Date() },
      });
    } else {
      return prisma.grades.create({
        data: {
          gradeId: uuidv4(),
          submissionId,
          studentId,
          classId,
          assignmentId,
          score,
          comment,
          gradedAt: new Date(),
        },
      });
    }
  }
}
