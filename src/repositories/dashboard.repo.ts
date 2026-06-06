import prisma from "../config/prisma.js";

// ─── Stats ────────────────────────────────────────────────────────────────────

/** Đếm tổng số lớp học của giáo viên */
export const countClassesByTeacherId = async (teacherId: string): Promise<number> => {
  return prisma.classes.count({ where: { teacherId } });
};

/**
 * Đếm tổng học sinh duy nhất (không trùng) trong tất cả lớp của giáo viên.
 * Mỗi học sinh chỉ tính 1 lần dù tham gia nhiều lớp.
 */
export const countDistinctStudentsByTeacherId = async (teacherId: string): Promise<number> => {
  const classes = await prisma.classes.findMany({
    where: { teacherId },
    select: { classId: true },
  });
  const classIds = classes.map((c) => c.classId);
  if (classIds.length === 0) return 0;

  const result = await prisma.classEnrollments.groupBy({
    by: ["studentId"],
    where: { classId: { in: classIds } },
  });
  return result.length;
};

/**
 * Đếm số bài nộp (chỉ loại ESSAY) chưa được chấm điểm trong các lớp của giáo viên.
 * Bài chưa chấm = Submission chưa có bản ghi Grade tương ứng.
 */
export const countPendingEssaySubmissionsByTeacherId = async (teacherId: string): Promise<number> => {
  const classes = await prisma.classes.findMany({
    where: { teacherId },
    select: { classId: true },
  });
  const classIds = classes.map((c) => c.classId);
  if (classIds.length === 0) return 0;

  return prisma.submissions.count({
    where: {
      Assignments: {
        classId: { in: classIds },
        typeAssignment: "ESSAY",
      },
      Grades: { none: {} },
    },
  });
};

// ─── My Classes ───────────────────────────────────────────────────────────────

/** Lấy danh sách lớp học của giáo viên kèm số học sinh và số bài tập */
export const findClassSummariesByTeacherId = async (teacherId: string, limit = 5) => {
  return prisma.classes.findMany({
    where: { teacherId },
    take: limit,
    orderBy: { createdAt: "desc" },
    select: {
      classId: true,
      className: true,
      joinCode: true,
      status: true,
      createdAt: true,
      _count: {
        select: {
          ClassEnrollments: true,
          Assignments: true,
        },
      },
    },
  });
};

// ─── Submissions to Grade ─────────────────────────────────────────────────────

/** Lấy danh sách bài nộp ESSAY chưa có điểm trong các lớp của giáo viên */
export const findPendingEssaySubmissions = async (teacherId: string, limit = 10) => {
  const classes = await prisma.classes.findMany({
    where: { teacherId },
    select: { classId: true },
  });
  const classIds = classes.map((c) => c.classId);
  if (classIds.length === 0) return [];

  return prisma.submissions.findMany({
    where: {
      Assignments: {
        classId: { in: classIds },
        typeAssignment: "ESSAY",
      },
      Grades: { none: {} },
    },
    take: limit,
    orderBy: { submittedAt: "desc" },
    select: {
      submissionId: true,
      submittedAt: true,
      status: true,
      Assignments: {
        select: {
          assignmentId: true,
          title: true,
          typeAssignment: true,
          Classes: {
            select: { classId: true, className: true },
          },
        },
      },
      Users: {
        select: { userId: true, name: true, email: true },
      },
    },
  });
};

// ─── Upcoming Assignments ─────────────────────────────────────────────────────

/** Lấy danh sách bài tập sắp đến hạn (trong vòng N ngày) của giáo viên */
export const findUpcomingAssignmentsByTeacherId = async (
  teacherId: string,
  withinDays = 7,
  limit = 10
) => {
  const now = new Date();
  const future = new Date();
  future.setDate(future.getDate() + withinDays);

  const classes = await prisma.classes.findMany({
    where: { teacherId },
    select: { classId: true },
  });
  const classIds = classes.map((c) => c.classId);
  if (classIds.length === 0) return [];

  return prisma.assignments.findMany({
    where: {
      classId: { in: classIds },
      status: "ACTIVE",
      deadline: { gte: now, lte: future },
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
      _count: {
        select: { Submissions: true },
      },
    },
  });
};

// ─── Recent Activities ────────────────────────────────────────────────────────

/** Lấy các bài nộp gần đây nhất trong tất cả lớp của giáo viên */
export const findRecentSubmissionsByTeacherId = async (teacherId: string, limit = 10) => {
  const classes = await prisma.classes.findMany({
    where: { teacherId },
    select: { classId: true },
  });
  const classIds = classes.map((c) => c.classId);
  if (classIds.length === 0) return [];

  return prisma.submissions.findMany({
    where: {
      Assignments: { classId: { in: classIds } },
    },
    take: limit,
    orderBy: { submittedAt: "desc" },
    select: {
      submissionId: true,
      submittedAt: true,
      Assignments: {
        select: {
          title: true,
          Classes: { select: { className: true } },
        },
      },
      Users: { select: { name: true } },
    },
  });
};

/** Lấy danh sách bài nộp ESSAY chưa có điểm có phân trang */
export const findPendingEssaySubmissionsPaginated = async (
  teacherId: string,
  page: number,
  limit: number
) => {
  const classes = await prisma.classes.findMany({
    where: { teacherId },
    select: { classId: true },
  });
  const classIds = classes.map((c) => c.classId);
  if (classIds.length === 0) return { total: 0, submissions: [] };

  const whereClause = {
    Assignments: {
      classId: { in: classIds },
      typeAssignment: "ESSAY",
    },
    Grades: { none: {} },
  };

  const [total, submissions] = await Promise.all([
    prisma.submissions.count({ where: whereClause }),
    prisma.submissions.findMany({
      where: whereClause,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { submittedAt: "desc" },
      select: {
        submissionId: true,
        submittedAt: true,
        status: true,
        Assignments: {
          select: {
            assignmentId: true,
            title: true,
            typeAssignment: true,
            Classes: {
              select: { classId: true, className: true },
            },
          },
        },
        Users: {
          select: { userId: true, name: true, email: true },
        },
        SubmissionAttachments: true,
      },
    }),
  ]);

  return { total, submissions };
};
