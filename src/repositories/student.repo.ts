import prisma from "../config/prisma.js";
import { v4 as uuidv4 } from "uuid";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StudentAnswerInput {
  questionId: string;
  selectedOptionId: string;
}

// ─── Assignment Queries (Student-facing) ─────────────────────────────────────

/**
 * Lấy danh sách bài tập của 1 lớp học (dành cho học sinh)
 * Trả về câu hỏi kèm options nhưng KHÔNG bao gồm isCorrect
 */
export const findAssignmentsByClassId = async (classId: string) => {
  return prisma.assignments.findMany({
    where: { classId },
    orderBy: { createdAt: "desc" },
    include: {
      AssignmentAttachments: true,
      QuizQuestions: {
        orderBy: { sortOrder: "asc" },
        select: {
          questionId: true,
          questionText: true,
          points: true,
          sortOrder: true,
          QuizOptions: {
            select: {
              optionId: true,
              optionText: true,
              // isCorrect bị ẩn khỏi view của học sinh
            },
          },
        },
      },
    },
  });
};

/**
 * Lấy chi tiết bài tập (dành cho học sinh — không lộ isCorrect)
 */
export const findAssignmentById = async (assignmentId: string) => {
  return prisma.assignments.findUnique({
    where: { assignmentId },
    include: {
      AssignmentAttachments: true,
      QuizQuestions: {
        orderBy: { sortOrder: "asc" },
        select: {
          questionId: true,
          questionText: true,
          points: true,
          sortOrder: true,
          QuizOptions: {
            select: {
              optionId: true,
              optionText: true,
              // isCorrect bị ẩn khỏi view của học sinh
            },
          },
        },
      },
      Classes: {
        select: {
          classId: true,
          className: true,
          teacherId: true,
        },
      },
    },
  });
};

/**
 * Lấy câu hỏi kèm đáp án đúng (dùng nội bộ để chấm điểm — không trả về cho client)
 */
export const findQuizQuestionsWithAnswers = async (assignmentId: string) => {
  return prisma.quizQuestions.findMany({
    where: { assignmentId },
    orderBy: { sortOrder: "asc" },
    include: {
      QuizOptions: {
        select: {
          optionId: true,
          optionText: true,
          isCorrect: true,
        },
      },
    },
  });
};

// ─── Submission Queries ────────────────────────────────────────────────────────

/**
 * Tìm bài nộp của 1 học sinh cho 1 bài tập
 */
export const findSubmissionByStudentAndAssignment = async (studentId: string, assignmentId: string) => {
  return prisma.submissions.findFirst({
    where: { studentId, assignmentId },
    include: {
      SubmissionAttachments: true,
      StudentQuizAnswers: {
        include: {
          QuizQuestions: {
            select: { questionId: true, questionText: true, points: true },
          },
          QuizOptions: {
            select: { optionId: true, optionText: true },
          },
        },
      },
      Grades: true,
    },
  });
};

/**
 * Lấy chi tiết 1 bài nộp theo ID
 */
export const findSubmissionById = async (submissionId: string) => {
  return prisma.submissions.findUnique({
    where: { submissionId },
    include: {
      SubmissionAttachments: true,
      StudentQuizAnswers: {
        include: {
          QuizQuestions: {
            select: { questionId: true, questionText: true, points: true },
          },
          QuizOptions: {
            select: { optionId: true, optionText: true },
          },
        },
      },
      Grades: true,
    },
  });
};

// ─── Submission Mutations ──────────────────────────────────────────────────────

/**
 * Tạo bài nộp trong một transaction:
 * 1. Tạo Submission
 * 2. Lưu file đính kèm (nếu có)
 * 3. Lưu câu trả lời trắc nghiệm (nếu có)
 * 4. Tạo Grade tự động (nếu là bài trắc nghiệm)
 */
export const createSubmission = async (
  submissionData: {
    submissionId: string;
    assignmentId: string;
    studentId: string;
    status: string;
  },
  attachments: {
    attachmentId: string;
    fileName: string;
    fileUri: string;
    fileSize: number;
  }[],
  studentAnswers: StudentAnswerInput[] = [],
  gradeData?: {
    gradeId: string;
    score: number;
    comment: string;
    classId: string;
  } | null
) => {
  return prisma.$transaction(async (tx) => {
    // 1. Tạo Submission
    const submission = await tx.submissions.create({
      data: {
        submissionId: submissionData.submissionId,
        assignmentId: submissionData.assignmentId,
        studentId: submissionData.studentId,
        status: submissionData.status,
      },
    });

    // 2. Lưu file đính kèm (nếu có)
    if (attachments.length > 0) {
      await tx.submissionAttachments.createMany({
        data: attachments.map((file) => ({
          attachmentId: file.attachmentId,
          submissionId: submissionData.submissionId,
          fileName: file.fileName,
          fileUri: file.fileUri,
          fileSize: file.fileSize ? BigInt(file.fileSize) : null,
        })),
      });
    }

    // 3. Lưu câu trả lời trắc nghiệm (nếu có)
    if (studentAnswers.length > 0) {
      await tx.studentQuizAnswers.createMany({
        data: studentAnswers.map((ans) => ({
          studentAnswerId: uuidv4(),
          submissionId: submissionData.submissionId,
          questionId: ans.questionId,
          selectedOptionId: ans.selectedOptionId,
        })),
      });
    }

    // 4. Lưu điểm tự động (nếu là bài trắc nghiệm)
    if (gradeData) {
      await tx.grades.create({
        data: {
          gradeId: gradeData.gradeId,
          submissionId: submission.submissionId,
          studentId: submissionData.studentId,
          classId: gradeData.classId,
          assignmentId: submissionData.assignmentId,
          score: gradeData.score,
          comment: gradeData.comment,
        },
      });
    }

    // 5. Trả về submission đầy đủ
    return tx.submissions.findUnique({
      where: { submissionId: submission.submissionId },
      include: {
        SubmissionAttachments: true,
        StudentQuizAnswers: {
          include: {
            QuizQuestions: {
              select: { questionId: true, questionText: true, points: true },
            },
            QuizOptions: {
              select: { optionId: true, optionText: true },
            },
          },
        },
        Grades: true,
      },
    });
  });
};

// ─── Student Dashboard Queries ────────────────────────────────────────────────

export const countEnrolledClasses = async (studentId: string): Promise<number> => {
  return prisma.classEnrollments.count({
    where: { studentId, status: "JOINED" },
  });
};

export const countAssignmentsForStudent = async (studentId: string): Promise<number> => {
  const enrollments = await prisma.classEnrollments.findMany({
    where: { studentId, status: "JOINED" },
    select: { classId: true },
  });
  const classIds = enrollments.map((e) => e.classId);
  if (classIds.length === 0) return 0;
  return prisma.assignments.count({
    where: { classId: { in: classIds }, status: "ACTIVE" },
  });
};

export const countSubmissionsByStudent = async (studentId: string): Promise<number> => {
  return prisma.submissions.count({
    where: { studentId },
  });
};

export const findEnrolledClassSummaries = async (studentId: string, limit = 5) => {
  return prisma.classEnrollments.findMany({
    where: { studentId, status: "JOINED" },
    take: limit,
    orderBy: { joinTime: "desc" },
    select: {
      Classes: {
        select: {
          classId: true,
          className: true,
          status: true,
          createdAt: true,
          Users: {
            select: { name: true },
          },
          _count: {
            select: {
              ClassEnrollments: true,
              Assignments: true,
            },
          },
        },
      },
    },
  });
};

export const findRecentGradesByStudent = async (studentId: string, limit = 10) => {
  return prisma.submissions.findMany({
    where: {
      studentId,
      Grades: { some: {} },
    },
    take: limit,
    orderBy: { submittedAt: "desc" },
    select: {
      submissionId: true,
      submittedAt: true,
      Assignments: {
        select: {
          assignmentId: true,
          title: true,
          Classes: {
            select: { classId: true, className: true },
          },
        },
      },
      Grades: {
        select: {
          score: true,
          comment: true,
          gradedAt: true,
        },
      },
    },
  });
};

export const findUpcomingAssignmentsForStudent = async (studentId: string, limit = 10) => {
  const now = new Date();
  const enrollments = await prisma.classEnrollments.findMany({
    where: { studentId, status: "JOINED" },
    select: { classId: true },
  });
  const classIds = enrollments.map((e) => e.classId);
  if (classIds.length === 0) return [];

  return prisma.assignments.findMany({
    where: {
      classId: { in: classIds },
      status: "ACTIVE",
      deadline: { gte: now },
      Submissions: {
        none: { studentId },
      },
    },
    take: limit,
    orderBy: { deadline: "asc" },
    select: {
      assignmentId: true,
      title: true,
      deadline: true,
      typeAssignment: true,
      Classes: {
        select: { classId: true, className: true },
      },
    },
  });
};

export const findRecentActivitiesByStudent = async (studentId: string, limit = 10) => {
  return prisma.submissions.findMany({
    where: { studentId },
    take: limit,
    orderBy: { submittedAt: "desc" },
    select: {
      submissionId: true,
      submittedAt: true,
      status: true,
      Assignments: {
        select: {
          title: true,
          Classes: { select: { className: true } },
        },
      },
      Grades: {
        select: {
          score: true,
          gradedAt: true,
        },
      },
    },
  });
};

export const findGradesByStudentAndClass = async (studentId: string, classId: string) => {
  return prisma.grades.findMany({
    where: { studentId, classId },
    orderBy: { gradedAt: "desc" },
    include: {
      Assignments: {
        select: {
          title: true,
          deadline: true,
          typeAssignment: true,
        },
      },
    },
  });
};
