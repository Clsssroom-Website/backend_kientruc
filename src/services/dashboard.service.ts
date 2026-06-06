import * as DashboardRepo from "../repositories/dashboard.repo.js";
import { MinioStorageService } from "./storage/minioStorage.js";

const submissionStorageService = new MinioStorageService("classroom-submissions");

const serializeSubmissionAttachments = async (attachments: any[]) => {
  return Promise.all(
    attachments.map(async (att) => {
      let presignedUrl = att.fileUri;
      let downloadUrl = att.fileUri;
      try {
        presignedUrl = await submissionStorageService.getPresignedUrl(att.fileUri, false, att.fileName || "download");
        downloadUrl = await submissionStorageService.getPresignedUrl(att.fileUri, true, att.fileName || "download");
      } catch {
        console.error("Lỗi khi tạo presigned URL cho bài nộp:", att.fileUri);
      }
      return {
        attachmentId: att.attachmentId,
        fileName: att.fileName,
        fileUrl: presignedUrl,
        downloadUrl,
        fileSize: att.fileSize ? att.fileSize.toString() : null,
      };
    })
  );
};

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface DashboardStatsDTO {
  totalClasses: number;
  totalStudents: number;
  pendingGrades: number;
}

export interface ClassSummaryDTO {
  classId: string;
  className: string;
  joinCode: string | null;
  status: string | null;
  studentCount: number;
  assignmentCount: number;
  createdAt: Date | null;
}

export interface SubmissionToGradeDTO {
  submissionId: string;
  assignmentId: string;
  assignmentTitle: string;
  assignmentType: string | null;
  classId: string;
  className: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  submittedAt: Date | null;
  attachments?: any[];
}

export interface UpcomingAssignmentDTO {
  assignmentId: string;
  title: string;
  classId: string;
  className: string;
  deadline: Date;
  typeAssignment: string | null;
  totalSubmissions: number;
  /** "urgent" nếu còn < 2 ngày, "upcoming" nếu còn >= 2 ngày */
  urgency: "urgent" | "upcoming";
}

export interface RecentActivityDTO {
  submissionId: string;
  studentName: string;
  assignmentTitle: string;
  className: string;
  submittedAt: Date | null;
}

export interface TeacherDashboardDTO {
  stats: DashboardStatsDTO;
  classes: ClassSummaryDTO[];
  pendingSubmissions: SubmissionToGradeDTO[];
  upcomingAssignments: UpcomingAssignmentDTO[];
  recentActivities: RecentActivityDTO[];
}

// ─── Helper ───────────────────────────────────────────────────────────────────

const URGENT_THRESHOLD_DAYS = 2;

const resolveUrgency = (deadline: Date): "urgent" | "upcoming" => {
  const diffMs = deadline.getTime() - Date.now();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays < URGENT_THRESHOLD_DAYS ? "urgent" : "upcoming";
};

// ─── Service (Facade) ─────────────────────────────────────────────────────────

/**
 * Lấy toàn bộ dữ liệu cho trang Dashboard của giáo viên trong một lần gọi.
 * Pattern: Facade — orchestrates multiple repository calls and maps to DTOs.
 */
export const getTeacherDashboard = async (teacherId: string, submissionsLimit: number = 10): Promise<TeacherDashboardDTO> => {
  // Chạy song song để giảm latency
  const [
    totalClasses,
    totalStudents,
    pendingGrades,
    rawClasses,
    rawSubmissions,
    rawUpcoming,
    rawActivities,
  ] = await Promise.all([
    DashboardRepo.countClassesByTeacherId(teacherId),
    DashboardRepo.countDistinctStudentsByTeacherId(teacherId),
    DashboardRepo.countPendingEssaySubmissionsByTeacherId(teacherId),
    DashboardRepo.findClassSummariesByTeacherId(teacherId, 5),
    DashboardRepo.findPendingEssaySubmissions(teacherId, submissionsLimit),
    DashboardRepo.findUpcomingAssignmentsByTeacherId(teacherId, 7, 10),
    DashboardRepo.findRecentSubmissionsByTeacherId(teacherId, 10),
  ]);

  const stats: DashboardStatsDTO = { totalClasses, totalStudents, pendingGrades };

  const classes: ClassSummaryDTO[] = rawClasses.map((c) => ({
    classId: c.classId,
    className: c.className,
    joinCode: c.joinCode,
    status: c.status,
    studentCount: c._count.ClassEnrollments,
    assignmentCount: c._count.Assignments,
    createdAt: c.createdAt,
  }));

  const pendingSubmissions: SubmissionToGradeDTO[] = rawSubmissions.map((s) => ({
    submissionId: s.submissionId,
    assignmentId: s.Assignments.assignmentId,
    assignmentTitle: s.Assignments.title,
    assignmentType: s.Assignments.typeAssignment,
    classId: s.Assignments.Classes.classId,
    className: s.Assignments.Classes.className,
    studentId: s.Users.userId,
    studentName: s.Users.name,
    studentEmail: s.Users.email,
    submittedAt: s.submittedAt,
  }));

  const upcomingAssignments: UpcomingAssignmentDTO[] = rawUpcoming.map((a) => ({
    assignmentId: a.assignmentId,
    title: a.title,
    classId: a.Classes.classId,
    className: a.Classes.className,
    deadline: a.deadline,
    typeAssignment: a.typeAssignment,
    totalSubmissions: a._count.Submissions,
    urgency: resolveUrgency(a.deadline),
  }));

  const recentActivities: RecentActivityDTO[] = rawActivities.map((s) => ({
    submissionId: s.submissionId,
    studentName: s.Users.name,
    assignmentTitle: s.Assignments.title,
    className: s.Assignments.Classes.className,
    submittedAt: s.submittedAt,
  }));

  return { stats, classes, pendingSubmissions, upcomingAssignments, recentActivities };
};

/**
 * Chỉ lấy stats (tổng hợp số liệu) — dùng khi chỉ cần refresh widgets.
 */
export const getDashboardStats = async (teacherId: string): Promise<DashboardStatsDTO> => {
  const [totalClasses, totalStudents, pendingGrades] = await Promise.all([
    DashboardRepo.countClassesByTeacherId(teacherId),
    DashboardRepo.countDistinctStudentsByTeacherId(teacherId),
    DashboardRepo.countPendingEssaySubmissionsByTeacherId(teacherId),
  ]);
  return { totalClasses, totalStudents, pendingGrades };
};

export interface SubmissionsToGradePaginatedDTO {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  submissions: SubmissionToGradeDTO[];
}

/**
 * Lấy danh sách bài nộp ESSAY chưa có điểm kèm phân trang và nén file URL (cho giáo viên)
 */
export const getPendingEssaySubmissionsPaginated = async (
  teacherId: string,
  page = 1,
  limit = 10
): Promise<SubmissionsToGradePaginatedDTO> => {
  const p = Math.max(1, page);
  const l = Math.max(1, limit);

  const { total, submissions: rawSubmissions } = await DashboardRepo.findPendingEssaySubmissionsPaginated(
    teacherId,
    p,
    l
  );

  const submissions = await Promise.all(
    rawSubmissions.map(async (s) => {
      const attachments = await serializeSubmissionAttachments(s.SubmissionAttachments);
      return {
        submissionId: s.submissionId,
        assignmentId: s.Assignments.assignmentId,
        assignmentTitle: s.Assignments.title,
        assignmentType: s.Assignments.typeAssignment,
        classId: s.Assignments.Classes.classId,
        className: s.Assignments.Classes.className,
        studentId: s.Users.userId,
        studentName: s.Users.name,
        studentEmail: s.Users.email,
        submittedAt: s.submittedAt,
        attachments,
      };
    })
  );

  const totalPages = Math.ceil(total / l);

  return {
    total,
    page: p,
    limit: l,
    totalPages,
    submissions,
  };
};
