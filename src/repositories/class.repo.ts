import prisma from "../config/prisma.js";

// Lấy danh sách lớp học theo teacherId
export const findAllClassesByTeacherId = async (teacherId: string, searchQuery?: string) => {
  const whereClause: any = { teacherId };

  if (searchQuery) {
    whereClause.OR = [
      { className: { contains: searchQuery } },
      { description: { contains: searchQuery } },
      { room: { contains: searchQuery } },
    ];
  }

  return prisma.classes.findMany({
    where: whereClause,
    include: {
      _count: {
        select: { ClassEnrollments: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
};

// Tạo lớp học
export const createClass = async (data: {
  classId: string;
  teacherId: string;
  className: string;
  description?: string;
  room?: string;
  topic?: string;
  joinCode: string;
  joinLink?: string;
  status?: string;
}) => {
  return prisma.classes.create({ data });
};

// Tìm lớp học qua mã tham gia
export const findClassByJoinCode = async (joinCode: string) => {
  return prisma.classes.findUnique({ where: { joinCode } });
};

// Tìm lớp học theo ID
export const findClassById = async (classId: string) => {
  return prisma.classes.findUnique({ where: { classId } });
};

// Cập nhật lớp học
export const updateClass = async (classId: string, data: any) => {
  return prisma.classes.update({
    where: { classId },
    data,
  });
};

// Xóa lớp học
export const deleteClass = async (classId: string) => {
  return prisma.classes.delete({
    where: { classId },
  });
};

// Kiểm tra học sinh đã tham gia lớp chưa
export const checkEnrollmentExists = async (classId: string, studentId: string) => {
  return prisma.classEnrollments.findFirst({
    where: { classId, studentId },
  });
};

// Xóa học sinh khỏi lớp
export const deleteEnrollment = async (classId: string, studentId: string) => {
  return prisma.classEnrollments.deleteMany({
    where: { classId, studentId },
  });
};

// Thêm học sinh vào lớp học
export const createEnrollment = async (data: {
  enrollmentId: string;
  classId: string;
  studentId: string;
}) => {
  return prisma.classEnrollments.create({ data });
};

// Lấy danh sách học sinh trong lớp
export const findStudentsByClassId = async (classId: string) => {
  return prisma.classEnrollments.findMany({
    where: { classId },
    include: {
      Users: {
        select: {
          userId: true,
          name: true,
          email: true,
          role: true,
        },
      },
    },
    orderBy: { joinTime: "asc" },
  });
};

// Lấy danh sách lớp học mà học sinh đã tham gia
export const findJoinedClassesByStudentId = async (studentId: string, searchQuery?: string) => {
  const classWhereClause: any = {};
  if (searchQuery) {
    classWhereClause.OR = [
      { className: { contains: searchQuery } },
      { description: { contains: searchQuery } },
      { room: { contains: searchQuery } },
    ];
  }

  return prisma.classEnrollments.findMany({
    where: { 
      studentId,
      ...(searchQuery ? { Classes: classWhereClause } : {})
    },
    include: {
      Classes: {
        include: {
          _count: {
            select: { ClassEnrollments: true } // Lấy sĩ số lớp
          }
        }
      },
    },
    orderBy: { joinTime: "desc" },
  });
};

// Lấy bảng tin lớp học
export const findAssignmentsByClassId = async (classId: string) => {
  return prisma.assignments.findMany({
    where: { classId },
    orderBy: { createdAt: "desc" },
    include: {
      AssignmentAttachments: true,
      _count: {
        select: { Submissions: true },
      },
    },
  });
};

// Lấy bảng tin lớp học
export const findDocumentsByClassId = async (classId: string) => {
  return prisma.documents.findMany({
    where: { classId },
    orderBy: { uploadTime: "desc" },
    include: {
      DocumentAttachments: true,
    },
  });
};

// Lấy toàn bộ dữ liệu phục vụ tính điểm trung bình lớp học
export const findClassGradebookData = async (classId: string) => {
  // Lấy tất cả bài tập trong lớp học
  const assignments = await prisma.assignments.findMany({
    where: { classId },
    select: {
      assignmentId: true,
      title: true,
      deadline: true,
      typeAssignment: true,
    },
    orderBy: { createdAt: "asc" },
  });

  // Lấy danh sách học sinh tham gia lớp
  const enrollments = await prisma.classEnrollments.findMany({
    where: { classId, status: "JOINED" },
    include: {
      Users: {
        select: {
          userId: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: { Users: { name: "asc" } },
  });

  // Lấy tất cả điểm trong lớp học
  const grades = await prisma.grades.findMany({
    where: { classId },
    select: {
      gradeId: true,
      studentId: true,
      assignmentId: true,
      score: true,
      comment: true,
      gradedAt: true,
    },
  });

  // Lấy tất cả bài nộp của các bài tập thuộc lớp học
  // (dùng để phát hiện học sinh quá hạn mà chưa nộp bài)
  const assignmentIds = assignments.map((a) => a.assignmentId);
  const submissions = assignmentIds.length > 0
    ? await prisma.submissions.findMany({
        where: { assignmentId: { in: assignmentIds } },
        select: {
          submissionId: true,
          studentId: true,
          assignmentId: true,
        },
      })
    : [];

  return { assignments, enrollments, grades, submissions };
};

