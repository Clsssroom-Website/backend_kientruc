import { describe, it, expect, vi, beforeEach } from "vitest";
import * as DashboardService from "../dashboard.service.js";
import * as DashboardRepo from "../../repositories/dashboard.repo.js";

// Mock Dashboard Repository để không kết nối DB thật khi test
vi.mock("../../repositories/dashboard.repo.js");

// Dữ liệu mock mẫu cho Class
const mockRawClasses = [
  {
    classId: "class-1",
    className: "Lớp Toán 10A",
    joinCode: "MATH10",
    status: "ACTIVE",
    createdAt: new Date("2026-01-01"),
    _count: {
      ClassEnrollments: 35,
      Assignments: 4,
    },
  },
];

// Dữ liệu mock mẫu cho Submission đang chờ chấm (Pending)
const mockRawSubmissions = [
  {
    submissionId: "sub-1",
    submittedAt: new Date("2026-05-27T10:00:00Z"),
    Assignments: {
      assignmentId: "assign-1",
      title: "Bài tập đại số",
      typeAssignment: "ESSAY",
      Classes: {
        classId: "class-1",
        className: "Lớp Toán 10A",
      },
    },
    Users: {
      userId: "student-1",
      name: "Nguyễn Văn A",
      email: "vana@gmail.com",
    },
  },
];

// Dữ liệu mock cho Hoạt động gần đây (Recent Activities)
const mockRawActivities = [
  {
    submissionId: "sub-1",
    submittedAt: new Date("2026-05-27T10:00:00Z"),
    Assignments: {
      title: "Bài tập đại số",
      Classes: {
        className: "Lớp Toán 10A",
      },
    },
    Users: {
      name: "Nguyễn Văn A",
    },
  },
];

describe("DashboardService - getDashboardStats", () => {
  beforeEach(() => {
    vi.clearAllMocks(); // Xóa lịch sử gọi mock trước mỗi test
  });

  it("should return correct stats from repository", async () => {
    // Giả lập các hàm đếm số liệu trả về các con số cố định
    vi.mocked(DashboardRepo.countClassesByTeacherId).mockResolvedValue(5);
    vi.mocked(DashboardRepo.countDistinctStudentsByTeacherId).mockResolvedValue(120);
    vi.mocked(DashboardRepo.countPendingEssaySubmissionsByTeacherId).mockResolvedValue(8);

    const stats = await DashboardService.getDashboardStats("teacher-1");

    // Kết quả trả về phải khớp với dữ liệu giả lập
    expect(stats).toEqual({
      totalClasses: 5,
      totalStudents: 120,
      pendingGrades: 8,
    });

    expect(DashboardRepo.countClassesByTeacherId).toHaveBeenCalledWith("teacher-1");
    expect(DashboardRepo.countDistinctStudentsByTeacherId).toHaveBeenCalledWith("teacher-1");
    expect(DashboardRepo.countPendingEssaySubmissionsByTeacherId).toHaveBeenCalledWith("teacher-1");
  });
});

describe("DashboardService - getTeacherDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should retrieve all dashboard components and map them to DTOs correctly", async () => {
    const futureDeadline = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000); // Còn 5 ngày nữa (upcoming)

    const mockRawUpcoming = [
      {
        assignmentId: "assign-2",
        title: "Kiểm tra 15 phút hình học",
        deadline: futureDeadline,
        typeAssignment: "MULTIPLE_CHOICE",
        Classes: {
          classId: "class-1",
          className: "Lớp Toán 10A",
        },
        _count: {
          Submissions: 22,
        },
      },
    ];

    // Giả lập dữ liệu trả về cho tất cả các query song song
    vi.mocked(DashboardRepo.countClassesByTeacherId).mockResolvedValue(3);
    vi.mocked(DashboardRepo.countDistinctStudentsByTeacherId).mockResolvedValue(45);
    vi.mocked(DashboardRepo.countPendingEssaySubmissionsByTeacherId).mockResolvedValue(2);
    vi.mocked(DashboardRepo.findClassSummariesByTeacherId).mockResolvedValue(mockRawClasses as any);
    vi.mocked(DashboardRepo.findPendingEssaySubmissions).mockResolvedValue(mockRawSubmissions as any);
    vi.mocked(DashboardRepo.findUpcomingAssignmentsByTeacherId).mockResolvedValue(mockRawUpcoming as any);
    vi.mocked(DashboardRepo.findRecentSubmissionsByTeacherId).mockResolvedValue(mockRawActivities as any);

    const result = await DashboardService.getTeacherDashboard("teacher-1");

    // 1. Kiểm tra Stats
    expect(result.stats).toEqual({
      totalClasses: 3,
      totalStudents: 45,
      pendingGrades: 2,
    });

    // 2. Kiểm tra map Classes
    expect(result.classes).toHaveLength(1);
    expect(result.classes[0]).toEqual({
      classId: "class-1",
      className: "Lớp Toán 10A",
      joinCode: "MATH10",
      status: "ACTIVE",
      studentCount: 35,
      assignmentCount: 4,
      createdAt: mockRawClasses[0].createdAt,
    });

    // 3. Kiểm tra map Pending Submissions
    expect(result.pendingSubmissions).toHaveLength(1);
    expect(result.pendingSubmissions[0]).toEqual({
      submissionId: "sub-1",
      assignmentId: "assign-1",
      assignmentTitle: "Bài tập đại số",
      assignmentType: "ESSAY",
      classId: "class-1",
      className: "Lớp Toán 10A",
      studentId: "student-1",
      studentName: "Nguyễn Văn A",
      studentEmail: "vana@gmail.com",
      submittedAt: mockRawSubmissions[0].submittedAt,
    });

    // 4. Kiểm tra map Upcoming Assignments (độ khẩn cấp: upcoming)
    expect(result.upcomingAssignments).toHaveLength(1);
    expect(result.upcomingAssignments[0]).toEqual({
      assignmentId: "assign-2",
      title: "Kiểm tra 15 phút hình học",
      classId: "class-1",
      className: "Lớp Toán 10A",
      deadline: futureDeadline,
      typeAssignment: "MULTIPLE_CHOICE",
      totalSubmissions: 22,
      urgency: "upcoming", // > 2 ngày
    });

    // 5. Kiểm tra map Hoạt động gần đây
    expect(result.recentActivities).toHaveLength(1);
    expect(result.recentActivities[0]).toEqual({
      submissionId: "sub-1",
      studentName: "Nguyễn Văn A",
      assignmentTitle: "Bài tập đại số",
      className: "Lớp Toán 10A",
      submittedAt: mockRawActivities[0].submittedAt,
    });
  });

  it("should mark assignment as urgent if deadline is less than 2 days away", async () => {
    const urgentDeadline = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000); // 1 ngày nữa (urgent)

    const mockRawUpcomingUrgent = [
      {
        assignmentId: "assign-urgent",
        title: "Nộp bài tập khẩn cấp",
        deadline: urgentDeadline,
        typeAssignment: "ESSAY",
        Classes: {
          classId: "class-1",
          className: "Lớp Toán 10A",
        },
        _count: {
          Submissions: 5,
        },
      },
    ];

    vi.mocked(DashboardRepo.countClassesByTeacherId).mockResolvedValue(1);
    vi.mocked(DashboardRepo.countDistinctStudentsByTeacherId).mockResolvedValue(10);
    vi.mocked(DashboardRepo.countPendingEssaySubmissionsByTeacherId).mockResolvedValue(0);
    vi.mocked(DashboardRepo.findClassSummariesByTeacherId).mockResolvedValue([]);
    vi.mocked(DashboardRepo.findPendingEssaySubmissions).mockResolvedValue([]);
    vi.mocked(DashboardRepo.findUpcomingAssignmentsByTeacherId).mockResolvedValue(mockRawUpcomingUrgent as any);
    vi.mocked(DashboardRepo.findRecentSubmissionsByTeacherId).mockResolvedValue([]);

    const result = await DashboardService.getTeacherDashboard("teacher-1");

    // Deadline < 2 ngày -> urgency phải được giải quyết thành "urgent"
    expect(result.upcomingAssignments[0].urgency).toBe("urgent");
  });
});
