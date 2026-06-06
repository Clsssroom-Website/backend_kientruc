import { describe, it, expect, vi, beforeEach } from "vitest";
import * as StudentService from "../student.service.js";
import * as StudentRepo from "../../repositories/student.repo.js";
import * as ClassRepo from "../../repositories/class.repo.js";
import { NotFoundError, ForbiddenError, BadRequestError } from "../../errors/index.js";

// ─── Mock Dependencies ────────────────────────────────────────────────────────

// Mock repo để không cần kết nối DB thật
vi.mock("../../repositories/student.repo.js");
vi.mock("../../repositories/class.repo.js");

// Mock uuid để các ID luôn cố định, kết quả test ổn định
vi.mock("uuid", () => ({
  v4: vi.fn().mockReturnValue("mock-uuid-abc"),
}));

// Mock MinioStorageService dùng class (bắt buộc dùng class vì service gọi new MinioStorageService(...))
vi.mock("../storage/minioStorage.js", () => ({
  MinioStorageService: class {
    getPresignedUrl = vi.fn().mockResolvedValue("https://minio.example.com/presigned");
  },
}));

// ─── Shared Mock Data ─────────────────────────────────────────────────────────

// Dữ liệu lớp học mẫu
const mockClass = {
  classId: "class-1",
  teacherId: "teacher-1",
  className: "Math 101",
  description: "Intro",
  room: "Room 1",
  topic: "Math",
  joinCode: "MATH10",
  joinLink: null,
  status: "ACTIVE",
  createdAt: new Date(),
};

// Dữ liệu bài tập mẫu (bình thường - còn hạn nộp)
const futureDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const pastDeadline = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

const mockAssignment = {
  assignmentId: "assign-1",
  classId: "class-1",
  title: "Homework 1",
  description: "Do chapter 1",
  deadline: futureDeadline,
  typeAssignment: "homework",
  status: "ACTIVE",
  quizData: null,
  AssignmentAttachments: [],
  Classes: { classId: "class-1", className: "Math 101", teacherId: "teacher-1" },
};

// Dữ liệu bài nộp mẫu
const mockSubmission = {
  submissionId: "sub-1",
  assignmentId: "assign-1",
  studentId: "student-1",
  status: "SUBMITTED",
  quizAnswers: null,
  submittedAt: new Date(),
  SubmissionAttachments: [],
  Grades: [],
};

// ─── 1. getClassDetailsForStudent ─────────────────────────────────────────────

describe("StudentService - getClassDetailsForStudent", () => {
  beforeEach(() => vi.clearAllMocks());

  it("should return class data (without joinCode/joinLink) when student is enrolled", async () => {
    // Giả lập: lớp tồn tại và học sinh đã tham gia
    vi.mocked(ClassRepo.findClassById).mockResolvedValue(mockClass as any);
    vi.mocked(ClassRepo.checkEnrollmentExists).mockResolvedValue({ enrollmentId: "enroll-1" } as any);

    const result = await StudentService.getClassDetailsForStudent("student-1", "class-1");

    // Phải trả về thông tin lớp học
    expect(result.classId).toBe("class-1");
    // joinCode và joinLink phải bị ẩn đi (học sinh không cần biết)
    expect((result as any).joinCode).toBeUndefined();
    expect((result as any).joinLink).toBeUndefined();
  });

  it("should throw NotFoundError when class does not exist", async () => {
    // Giả lập: lớp không tồn tại trong DB
    vi.mocked(ClassRepo.findClassById).mockResolvedValue(null);

    await expect(StudentService.getClassDetailsForStudent("student-1", "bad-class"))
      .rejects.toThrow(NotFoundError);
  });

  it("should throw ForbiddenError when student is not enrolled in the class", async () => {
    // Giả lập: lớp tồn tại nhưng học sinh chưa tham gia
    vi.mocked(ClassRepo.findClassById).mockResolvedValue(mockClass as any);
    vi.mocked(ClassRepo.checkEnrollmentExists).mockResolvedValue(null); // Chưa tham gia

    await expect(StudentService.getClassDetailsForStudent("student-99", "class-1"))
      .rejects.toThrow(ForbiddenError);
  });
});

// ─── 2. getAssignmentsForStudent ──────────────────────────────────────────────

describe("StudentService - getAssignmentsForStudent", () => {
  beforeEach(() => vi.clearAllMocks());

  it("should return assignments list when student is enrolled", async () => {
    // Giả lập: lớp tồn tại, học sinh đã tham gia, có 1 bài tập
    vi.mocked(ClassRepo.findClassById).mockResolvedValue(mockClass as any);
    vi.mocked(ClassRepo.checkEnrollmentExists).mockResolvedValue({ enrollmentId: "e-1" } as any);
    vi.mocked(StudentRepo.findAssignmentsByClassId).mockResolvedValue([mockAssignment] as any);

    const result = await StudentService.getAssignmentsForStudent("student-1", "class-1");

    expect(result).toHaveLength(1);
    expect(result[0].assignmentId).toBe("assign-1");
    expect(result[0].title).toBe("Homework 1");
  });

  it("should throw NotFoundError when class does not exist", async () => {
    // Giả lập: lớp không tồn tại
    vi.mocked(ClassRepo.findClassById).mockResolvedValue(null);

    await expect(StudentService.getAssignmentsForStudent("student-1", "bad-class"))
      .rejects.toThrow(NotFoundError);
  });

  it("should throw ForbiddenError when student is not enrolled", async () => {
    // Giả lập: học sinh không có trong lớp
    vi.mocked(ClassRepo.findClassById).mockResolvedValue(mockClass as any);
    vi.mocked(ClassRepo.checkEnrollmentExists).mockResolvedValue(null);

    await expect(StudentService.getAssignmentsForStudent("student-99", "class-1"))
      .rejects.toThrow(ForbiddenError);
  });

  it("should generate presigned URLs for assignment attachments", async () => {
    // Giả lập: bài tập có file đính kèm trên MinIO
    const assignmentWithFile = {
      ...mockAssignment,
      AssignmentAttachments: [{ fileUrl: "assign/hw.pdf", fileName: "hw.pdf", fileSize: 1024 }],
    };
    vi.mocked(ClassRepo.findClassById).mockResolvedValue(mockClass as any);
    vi.mocked(ClassRepo.checkEnrollmentExists).mockResolvedValue({ enrollmentId: "e-1" } as any);
    vi.mocked(StudentRepo.findAssignmentsByClassId).mockResolvedValue([assignmentWithFile] as any);

    const result = await StudentService.getAssignmentsForStudent("student-1", "class-1");

    // URL file phải được đổi thành presigned URL
    expect(result[0].AssignmentAttachments[0].fileUrl).toBe("https://minio.example.com/presigned");
    expect(result[0].AssignmentAttachments[0].downloadUrl).toBe("https://minio.example.com/presigned");
  });
});

// ─── 3. submitAssignment ──────────────────────────────────────────────────────

// ─── 3. submitEssayAssignment & submitQuizAssignment ──────────────────────────

describe("StudentService - submitEssayAssignment", () => {
  beforeEach(() => vi.clearAllMocks());

  const mockEssayAssignment = {
    ...mockAssignment,
    typeAssignment: "ESSAY",
  };

  const mockFiles = [
    { fileName: "bai_lam.pdf", fileUri: "submissions/abc.pdf", fileSize: 1024 },
  ];

  it("should create submission successfully for an essay assignment", async () => {
    vi.mocked(StudentRepo.findAssignmentById).mockResolvedValue(mockEssayAssignment as any);
    vi.mocked(ClassRepo.checkEnrollmentExists).mockResolvedValue({ enrollmentId: "e-1" } as any);
    vi.mocked(StudentRepo.findSubmissionByStudentAndAssignment).mockResolvedValue(null);
    vi.mocked(StudentRepo.createSubmission).mockResolvedValue({
      ...mockSubmission,
      SubmissionAttachments: mockFiles.map(f => ({ ...f, attachmentId: "att-1" })),
    } as any);

    const result = await StudentService.submitEssayAssignment("student-1", "assign-1", mockFiles);

    expect(StudentRepo.createSubmission).toHaveBeenCalledWith(
      expect.objectContaining({ status: "SUBMITTED", studentId: "student-1", assignmentId: "assign-1" }),
      expect.arrayContaining([
        expect.objectContaining({ fileName: "bai_lam.pdf", fileUri: "submissions/abc.pdf" })
      ]),
      [],
      null
    );
    expect(result.submissionId).toBe("sub-1");
  });

  it("should throw NotFoundError if assignment does not exist", async () => {
    vi.mocked(StudentRepo.findAssignmentById).mockResolvedValue(null);
    await expect(StudentService.submitEssayAssignment("student-1", "bad-assign", mockFiles))
      .rejects.toThrow(NotFoundError);
  });

  it("should throw ForbiddenError if student is not enrolled", async () => {
    vi.mocked(StudentRepo.findAssignmentById).mockResolvedValue(mockEssayAssignment as any);
    vi.mocked(ClassRepo.checkEnrollmentExists).mockResolvedValue(null);

    await expect(StudentService.submitEssayAssignment("student-99", "assign-1", mockFiles))
      .rejects.toThrow(ForbiddenError);
  });

  it("should throw BadRequestError if assignment type is not ESSAY", async () => {
    const wrongTypeAssignment = { ...mockEssayAssignment, typeAssignment: "MULTIPLE_CHOICE" };
    vi.mocked(StudentRepo.findAssignmentById).mockResolvedValue(wrongTypeAssignment as any);
    vi.mocked(ClassRepo.checkEnrollmentExists).mockResolvedValue({ enrollmentId: "e-1" } as any);

    await expect(StudentService.submitEssayAssignment("student-1", "assign-1", mockFiles))
      .rejects.toThrow(BadRequestError);
  });

  it("should throw BadRequestError if deadline has passed", async () => {
    const expiredAssignment = { ...mockEssayAssignment, deadline: pastDeadline };
    vi.mocked(StudentRepo.findAssignmentById).mockResolvedValue(expiredAssignment as any);
    vi.mocked(ClassRepo.checkEnrollmentExists).mockResolvedValue({ enrollmentId: "e-1" } as any);

    await expect(StudentService.submitEssayAssignment("student-1", "assign-1", mockFiles))
      .rejects.toThrow(BadRequestError);
  });

  it("should throw BadRequestError if student already submitted", async () => {
    vi.mocked(StudentRepo.findAssignmentById).mockResolvedValue(mockEssayAssignment as any);
    vi.mocked(ClassRepo.checkEnrollmentExists).mockResolvedValue({ enrollmentId: "e-1" } as any);
    vi.mocked(StudentRepo.findSubmissionByStudentAndAssignment).mockResolvedValue(mockSubmission as any);

    await expect(StudentService.submitEssayAssignment("student-1", "assign-1", mockFiles))
      .rejects.toThrow(BadRequestError);
  });

  it("should throw BadRequestError if files list is empty", async () => {
    vi.mocked(StudentRepo.findAssignmentById).mockResolvedValue(mockEssayAssignment as any);
    vi.mocked(ClassRepo.checkEnrollmentExists).mockResolvedValue({ enrollmentId: "e-1" } as any);
    vi.mocked(StudentRepo.findSubmissionByStudentAndAssignment).mockResolvedValue(null);

    await expect(StudentService.submitEssayAssignment("student-1", "assign-1", []))
      .rejects.toThrow(BadRequestError);
  });
});

describe("StudentService - submitQuizAssignment", () => {
  beforeEach(() => vi.clearAllMocks());

  const mockQuizAssignment = {
    ...mockAssignment,
    typeAssignment: "MULTIPLE_CHOICE",
  };

  const mockQuestions = [
    {
      questionId: "q1",
      points: 2,
      QuizOptions: [
        { optionId: "opt-1a", optionText: "Option A", isCorrect: true },
        { optionId: "opt-1b", optionText: "Option B", isCorrect: false },
      ],
    },
    {
      questionId: "q2",
      points: 3,
      QuizOptions: [
        { optionId: "opt-2a", optionText: "Option A", isCorrect: false },
        { optionId: "opt-2b", optionText: "Option B", isCorrect: true },
      ],
    },
  ];

  it("should auto-grade and create COMPLETED submission successfully", async () => {
    vi.mocked(StudentRepo.findAssignmentById).mockResolvedValue(mockQuizAssignment as any);
    vi.mocked(ClassRepo.checkEnrollmentExists).mockResolvedValue({ enrollmentId: "e-1" } as any);
    vi.mocked(StudentRepo.findSubmissionByStudentAndAssignment).mockResolvedValue(null);
    vi.mocked(StudentRepo.findQuizQuestionsWithAnswers).mockResolvedValue(mockQuestions as any);
    vi.mocked(StudentRepo.createSubmission).mockResolvedValue({
      ...mockSubmission,
      status: "COMPLETED",
      StudentQuizAnswers: [
        { questionId: "q1", selectedOptionId: "opt-1a" },
        { questionId: "q2", selectedOptionId: "opt-2b" },
      ],
    } as any);

    const answers = [
      { questionId: "q1", selectedOptionId: "opt-1a" }, // Correct (2 pts)
      { questionId: "q2", selectedOptionId: "opt-2b" }, // Correct (3 pts)
    ];

    const result = await StudentService.submitQuizAssignment("student-1", "assign-1", answers);

    // Both correct -> 10/10 points
    expect(StudentRepo.createSubmission).toHaveBeenCalledWith(
      expect.objectContaining({ status: "COMPLETED", studentId: "student-1" }),
      [],
      answers,
      expect.objectContaining({ score: 10, comment: expect.stringContaining("Đúng 2/2 câu") })
    );
    expect(result.status).toBe("COMPLETED");
    expect(result.score).toBe(10);
    expect(result.correctAnswers).toBe(2);
  });

  it("should auto-grade partially correct answers", async () => {
    vi.mocked(StudentRepo.findAssignmentById).mockResolvedValue(mockQuizAssignment as any);
    vi.mocked(ClassRepo.checkEnrollmentExists).mockResolvedValue({ enrollmentId: "e-1" } as any);
    vi.mocked(StudentRepo.findSubmissionByStudentAndAssignment).mockResolvedValue(null);
    vi.mocked(StudentRepo.findQuizQuestionsWithAnswers).mockResolvedValue(mockQuestions as any);
    vi.mocked(StudentRepo.createSubmission).mockResolvedValue({
      ...mockSubmission,
      status: "COMPLETED",
      StudentQuizAnswers: [
        { questionId: "q1", selectedOptionId: "opt-1a" },
        { questionId: "q2", selectedOptionId: "opt-2a" },
      ],
    } as any);

    const answers = [
      { questionId: "q1", selectedOptionId: "opt-1a" }, // Correct (2 pts)
      { questionId: "q2", selectedOptionId: "opt-2a" }, // Incorrect (0 pts)
    ];

    const result = await StudentService.submitQuizAssignment("student-1", "assign-1", answers);

    // q1 correct (2 pts out of 5 pts) -> 2/5 * 10 = 4 points
    expect(StudentRepo.createSubmission).toHaveBeenCalledWith(
      expect.objectContaining({ status: "COMPLETED" }),
      [],
      answers,
      expect.objectContaining({ score: 4 })
    );
    expect(result.score).toBe(4);
    expect(result.correctAnswers).toBe(1);
  });

  it("should throw NotFoundError if assignment does not exist", async () => {
    vi.mocked(StudentRepo.findAssignmentById).mockResolvedValue(null);
    await expect(StudentService.submitQuizAssignment("student-1", "bad-assign", []))
      .rejects.toThrow(NotFoundError);
  });

  it("should throw ForbiddenError if student is not enrolled", async () => {
    vi.mocked(StudentRepo.findAssignmentById).mockResolvedValue(mockQuizAssignment as any);
    vi.mocked(ClassRepo.checkEnrollmentExists).mockResolvedValue(null);

    await expect(StudentService.submitQuizAssignment("student-99", "assign-1", []))
      .rejects.toThrow(ForbiddenError);
  });

  it("should throw BadRequestError if assignment type is not MULTIPLE_CHOICE", async () => {
    const wrongTypeAssignment = { ...mockQuizAssignment, typeAssignment: "ESSAY" };
    vi.mocked(StudentRepo.findAssignmentById).mockResolvedValue(wrongTypeAssignment as any);
    vi.mocked(ClassRepo.checkEnrollmentExists).mockResolvedValue({ enrollmentId: "e-1" } as any);

    await expect(StudentService.submitQuizAssignment("student-1", "assign-1", []))
      .rejects.toThrow(BadRequestError);
  });

  it("should throw BadRequestError if deadline has passed", async () => {
    const expiredAssignment = { ...mockQuizAssignment, deadline: pastDeadline };
    vi.mocked(StudentRepo.findAssignmentById).mockResolvedValue(expiredAssignment as any);
    vi.mocked(ClassRepo.checkEnrollmentExists).mockResolvedValue({ enrollmentId: "e-1" } as any);

    await expect(StudentService.submitQuizAssignment("student-1", "assign-1", []))
      .rejects.toThrow(BadRequestError);
  });

  it("should throw BadRequestError if student already submitted", async () => {
    vi.mocked(StudentRepo.findAssignmentById).mockResolvedValue(mockQuizAssignment as any);
    vi.mocked(ClassRepo.checkEnrollmentExists).mockResolvedValue({ enrollmentId: "e-1" } as any);
    vi.mocked(StudentRepo.findSubmissionByStudentAndAssignment).mockResolvedValue(mockSubmission as any);

    await expect(StudentService.submitQuizAssignment("student-1", "assign-1", []))
      .rejects.toThrow(BadRequestError);
  });

  it("should throw BadRequestError if quiz has no questions in database", async () => {
    vi.mocked(StudentRepo.findAssignmentById).mockResolvedValue(mockQuizAssignment as any);
    vi.mocked(ClassRepo.checkEnrollmentExists).mockResolvedValue({ enrollmentId: "e-1" } as any);
    vi.mocked(StudentRepo.findSubmissionByStudentAndAssignment).mockResolvedValue(null);
    vi.mocked(StudentRepo.findQuizQuestionsWithAnswers).mockResolvedValue([]);

    await expect(StudentService.submitQuizAssignment("student-1", "assign-1", []))
      .rejects.toThrow(BadRequestError);
  });

  it("should throw BadRequestError if a selected question does not belong to the assignment", async () => {
    vi.mocked(StudentRepo.findAssignmentById).mockResolvedValue(mockQuizAssignment as any);
    vi.mocked(ClassRepo.checkEnrollmentExists).mockResolvedValue({ enrollmentId: "e-1" } as any);
    vi.mocked(StudentRepo.findSubmissionByStudentAndAssignment).mockResolvedValue(null);
    vi.mocked(StudentRepo.findQuizQuestionsWithAnswers).mockResolvedValue(mockQuestions as any);

    const wrongAnswers = [
      { questionId: "q-non-existent", selectedOptionId: "opt-1a" },
    ];

    await expect(StudentService.submitQuizAssignment("student-1", "assign-1", wrongAnswers))
      .rejects.toThrow(BadRequestError);
  });
});

describe("StudentService - submitAssignment (compatibility wrapper)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("should delegate to submitQuizAssignment if MULTIPLE_CHOICE", async () => {
    const mockQuizAssignment = { ...mockAssignment, typeAssignment: "MULTIPLE_CHOICE" };
    vi.mocked(StudentRepo.findAssignmentById).mockResolvedValue(mockQuizAssignment as any);
    vi.mocked(ClassRepo.checkEnrollmentExists).mockResolvedValue({ enrollmentId: "e-1" } as any);
    vi.mocked(StudentRepo.findSubmissionByStudentAndAssignment).mockResolvedValue(null);
    vi.mocked(StudentRepo.findQuizQuestionsWithAnswers).mockResolvedValue([
      { questionId: "q1", points: 1, QuizOptions: [{ optionId: "opt-1", isCorrect: true }] }
    ] as any);
    vi.mocked(StudentRepo.createSubmission).mockResolvedValue(mockSubmission as any);

    const quizAnswers = [{ questionId: "q1", selectedAnswer: "opt-1" }];
    await StudentService.submitAssignment("student-1", "assign-1", [], quizAnswers);

    expect(StudentRepo.createSubmission).toHaveBeenCalled();
  });

  it("should submit essay successfully if not MULTIPLE_CHOICE", async () => {
    vi.mocked(StudentRepo.findAssignmentById).mockResolvedValue(mockAssignment as any);
    vi.mocked(ClassRepo.checkEnrollmentExists).mockResolvedValue({ enrollmentId: "e-1" } as any);
    vi.mocked(StudentRepo.findSubmissionByStudentAndAssignment).mockResolvedValue(null);
    vi.mocked(StudentRepo.createSubmission).mockResolvedValue(mockSubmission as any);

    await StudentService.submitAssignment("student-1", "assign-1", []);

    expect(StudentRepo.createSubmission).toHaveBeenCalled();
  });
});

// ─── 4. getSubmissionAndGrade ─────────────────────────────────────────────────

describe("StudentService - getSubmissionAndGrade", () => {
  beforeEach(() => vi.clearAllMocks());

  it("should return submission with grade when student has submitted", async () => {
    // Giả lập: bài tập tồn tại, học sinh đã nộp và đã có điểm
    const submissionWithGrade = {
      ...mockSubmission,
      SubmissionAttachments: [],
      Grades: [{ gradeId: "g-1", score: 8.5, comment: "Good", gradedAt: new Date() }],
    };
    vi.mocked(StudentRepo.findAssignmentById).mockResolvedValue(mockAssignment as any);
    vi.mocked(ClassRepo.checkEnrollmentExists).mockResolvedValue({ enrollmentId: "e-1" } as any);
    vi.mocked(StudentRepo.findSubmissionByStudentAndAssignment).mockResolvedValue(submissionWithGrade as any);

    const result = await StudentService.getSubmissionAndGrade("student-1", "assign-1");

    // Phải trả về submission kèm thông tin điểm
    expect(result).not.toBeNull();
    expect(result!.submissionId).toBe("sub-1");
    expect(result!.grade).toMatchObject({ score: 8.5, comment: "Good" });
  });

  it("should return null when student has not submitted yet", async () => {
    // Giả lập: học sinh chưa nộp bài
    vi.mocked(StudentRepo.findAssignmentById).mockResolvedValue(mockAssignment as any);
    vi.mocked(ClassRepo.checkEnrollmentExists).mockResolvedValue({ enrollmentId: "e-1" } as any);
    vi.mocked(StudentRepo.findSubmissionByStudentAndAssignment).mockResolvedValue(null);

    const result = await StudentService.getSubmissionAndGrade("student-1", "assign-1");

    // null = chưa nộp bài (không phải lỗi)
    expect(result).toBeNull();
  });

  it("should return submission with grade=null when not graded yet", async () => {
    // Giả lập: đã nộp bài nhưng giáo viên chưa chấm điểm
    const submissionNoGrade = { ...mockSubmission, SubmissionAttachments: [], Grades: [] };
    vi.mocked(StudentRepo.findAssignmentById).mockResolvedValue(mockAssignment as any);
    vi.mocked(ClassRepo.checkEnrollmentExists).mockResolvedValue({ enrollmentId: "e-1" } as any);
    vi.mocked(StudentRepo.findSubmissionByStudentAndAssignment).mockResolvedValue(submissionNoGrade as any);

    const result = await StudentService.getSubmissionAndGrade("student-1", "assign-1");

    // grade phải là null khi chưa có điểm
    expect(result!.grade).toBeNull();
  });

  it("should throw NotFoundError when assignment does not exist", async () => {
    // Giả lập: bài tập không tồn tại
    vi.mocked(StudentRepo.findAssignmentById).mockResolvedValue(null);

    await expect(StudentService.getSubmissionAndGrade("student-1", "bad-assign"))
      .rejects.toThrow(NotFoundError);
  });

  it("should throw ForbiddenError when student is not enrolled", async () => {
    // Giả lập: học sinh không trong lớp chứa bài tập này
    vi.mocked(StudentRepo.findAssignmentById).mockResolvedValue(mockAssignment as any);
    vi.mocked(ClassRepo.checkEnrollmentExists).mockResolvedValue(null);

    await expect(StudentService.getSubmissionAndGrade("student-99", "assign-1"))
      .rejects.toThrow(ForbiddenError);
  });
});

// ─── 5. getGradesForStudent ───────────────────────────────────────────────────

describe("StudentService - getGradesForStudent", () => {
  beforeEach(() => vi.clearAllMocks());

  it("should return grades when student is enrolled and has grades", async () => {
    // Giả lập: lớp tồn tại, học sinh đã tham gia, có điểm
    const mockGrades = [
      {
        gradeId: "g-1",
        score: 9.0,
        comment: "Excellent",
        gradedAt: new Date(),
        studentId: "student-1",
        classId: "class-1",
        assignmentId: "assign-1",
        Assignments: { title: "Homework 1", deadline: pastDeadline },
      },
    ];
    vi.mocked(ClassRepo.findClassById).mockResolvedValue(mockClass as any);
    vi.mocked(ClassRepo.checkEnrollmentExists).mockResolvedValue({ enrollmentId: "e-1" } as any);
    vi.mocked(StudentRepo.findGradesByStudentAndClass).mockResolvedValue(mockGrades as any);

    const result = await StudentService.getGradesForStudent("student-1", "class-1");

    expect(result).toHaveLength(1);
    expect(result[0].score).toBe(9.0);
    expect(StudentRepo.findGradesByStudentAndClass).toHaveBeenCalledWith("student-1", "class-1");
  });

  it("should throw NotFoundError when class does not exist", async () => {
    // Giả lập: lớp không tồn tại
    vi.mocked(ClassRepo.findClassById).mockResolvedValue(null);

    await expect(StudentService.getGradesForStudent("student-1", "bad-class"))
      .rejects.toThrow(NotFoundError);
  });

  it("should throw ForbiddenError when student is not enrolled", async () => {
    // Giả lập: học sinh không trong lớp
    vi.mocked(ClassRepo.findClassById).mockResolvedValue(mockClass as any);
    vi.mocked(ClassRepo.checkEnrollmentExists).mockResolvedValue(null);

    await expect(StudentService.getGradesForStudent("student-99", "class-1"))
      .rejects.toThrow(ForbiddenError);
  });

  it("should return empty array when student has no grades yet", async () => {
    // Giả lập: học sinh đang học nhưng chưa có điểm nào
    vi.mocked(ClassRepo.findClassById).mockResolvedValue(mockClass as any);
    vi.mocked(ClassRepo.checkEnrollmentExists).mockResolvedValue({ enrollmentId: "e-1" } as any);
    vi.mocked(StudentRepo.findGradesByStudentAndClass).mockResolvedValue([]);

    const result = await StudentService.getGradesForStudent("student-1", "class-1");

    expect(result).toEqual([]);
  });
});

// ─── 6. getStudentDashboard ───────────────────────────────────────────────────

describe("StudentService - getStudentDashboard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("should return correct dashboard stats with pendingAssignments calculated", async () => {
    // Giả lập: học sinh tham gia 3 lớp, có 10 bài tập, đã nộp 6
    vi.mocked(StudentRepo.countEnrolledClasses).mockResolvedValue(3);
    vi.mocked(StudentRepo.countAssignmentsForStudent).mockResolvedValue(10);
    vi.mocked(StudentRepo.countSubmissionsByStudent).mockResolvedValue(6);
    vi.mocked(StudentRepo.findEnrolledClassSummaries).mockResolvedValue([]);
    vi.mocked(StudentRepo.findRecentGradesByStudent).mockResolvedValue([]);
    vi.mocked(StudentRepo.findUpcomingAssignmentsForStudent).mockResolvedValue([]);
    vi.mocked(StudentRepo.findRecentActivitiesByStudent).mockResolvedValue([]);

    const result = await StudentService.getStudentDashboard("student-1");

    // Stats phải đúng
    expect(result.stats.totalClasses).toBe(3);
    expect(result.stats.totalAssignments).toBe(10);
    expect(result.stats.submittedCount).toBe(6);
    // pendingAssignments = totalAssignments - submittedCount = 10 - 6 = 4
    expect(result.stats.pendingAssignments).toBe(4);
  });

  it("should set pendingAssignments to 0 when submitted more than total (edge case)", async () => {
    // Edge case: submittedCount > totalAssignments → Math.max(0, ...) → 0
    vi.mocked(StudentRepo.countEnrolledClasses).mockResolvedValue(1);
    vi.mocked(StudentRepo.countAssignmentsForStudent).mockResolvedValue(3);
    vi.mocked(StudentRepo.countSubmissionsByStudent).mockResolvedValue(5); // Nhiều hơn bài tập
    vi.mocked(StudentRepo.findEnrolledClassSummaries).mockResolvedValue([]);
    vi.mocked(StudentRepo.findRecentGradesByStudent).mockResolvedValue([]);
    vi.mocked(StudentRepo.findUpcomingAssignmentsForStudent).mockResolvedValue([]);
    vi.mocked(StudentRepo.findRecentActivitiesByStudent).mockResolvedValue([]);

    const result = await StudentService.getStudentDashboard("student-1");

    // Không được trả về số âm
    expect(result.stats.pendingAssignments).toBe(0);
  });

  it("should mark upcoming assignment as urgent when deadline is within 2 days", async () => {
    // Giả lập: 1 bài tập sắp đến hạn (còn 1 ngày)
    const urgentDeadline = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000); // 1 ngày nữa
    const upcomingAssignment = {
      assignmentId: "assign-urgent",
      title: "Urgent Quiz",
      deadline: urgentDeadline,
      typeAssignment: "quiz",
      Classes: { classId: "class-1", className: "Math 101" },
    };
    vi.mocked(StudentRepo.countEnrolledClasses).mockResolvedValue(1);
    vi.mocked(StudentRepo.countAssignmentsForStudent).mockResolvedValue(1);
    vi.mocked(StudentRepo.countSubmissionsByStudent).mockResolvedValue(0);
    vi.mocked(StudentRepo.findEnrolledClassSummaries).mockResolvedValue([]);
    vi.mocked(StudentRepo.findRecentGradesByStudent).mockResolvedValue([]);
    vi.mocked(StudentRepo.findUpcomingAssignmentsForStudent).mockResolvedValue([upcomingAssignment] as any);
    vi.mocked(StudentRepo.findRecentActivitiesByStudent).mockResolvedValue([]);

    const result = await StudentService.getStudentDashboard("student-1");

    // Bài tập còn 1 ngày phải có urgency = "urgent"
    expect(result.upcomingAssignments[0].urgency).toBe("urgent");
  });

  it("should mark upcoming assignment as non-urgent when deadline is far away", async () => {
    // Giả lập: bài tập còn 5 ngày nữa → không urgent
    const normalDeadline = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    const normalAssignment = {
      assignmentId: "assign-normal",
      title: "Normal HW",
      deadline: normalDeadline,
      typeAssignment: "homework",
      Classes: { classId: "class-1", className: "Math 101" },
    };
    vi.mocked(StudentRepo.countEnrolledClasses).mockResolvedValue(1);
    vi.mocked(StudentRepo.countAssignmentsForStudent).mockResolvedValue(1);
    vi.mocked(StudentRepo.countSubmissionsByStudent).mockResolvedValue(0);
    vi.mocked(StudentRepo.findEnrolledClassSummaries).mockResolvedValue([]);
    vi.mocked(StudentRepo.findRecentGradesByStudent).mockResolvedValue([]);
    vi.mocked(StudentRepo.findUpcomingAssignmentsForStudent).mockResolvedValue([normalAssignment] as any);
    vi.mocked(StudentRepo.findRecentActivitiesByStudent).mockResolvedValue([]);

    const result = await StudentService.getStudentDashboard("student-1");

    // Bài tập còn 5 ngày → urgency = "upcoming" (không phải "urgent")
    expect(result.upcomingAssignments[0].urgency).toBe("upcoming");
  });

  it("should correctly map enrolled classes data", async () => {
    // Giả lập: học sinh đang tham gia 1 lớp học
    const rawClass = {
      Classes: {
        classId: "class-1",
        className: "Math 101",
        status: "ACTIVE",
        createdAt: new Date("2024-01-01"),
        Users: { name: "Mr. Teacher" },
        _count: { ClassEnrollments: 20, Assignments: 5 },
      },
    };
    vi.mocked(StudentRepo.countEnrolledClasses).mockResolvedValue(1);
    vi.mocked(StudentRepo.countAssignmentsForStudent).mockResolvedValue(5);
    vi.mocked(StudentRepo.countSubmissionsByStudent).mockResolvedValue(0);
    vi.mocked(StudentRepo.findEnrolledClassSummaries).mockResolvedValue([rawClass] as any);
    vi.mocked(StudentRepo.findRecentGradesByStudent).mockResolvedValue([]);
    vi.mocked(StudentRepo.findUpcomingAssignmentsForStudent).mockResolvedValue([]);
    vi.mocked(StudentRepo.findRecentActivitiesByStudent).mockResolvedValue([]);

    const result = await StudentService.getStudentDashboard("student-1");

    // Dữ liệu lớp học phải được map đúng
    expect(result.classes).toHaveLength(1);
    expect(result.classes[0].classId).toBe("class-1");
    expect(result.classes[0].teacherName).toBe("Mr. Teacher");
    expect(result.classes[0].studentCount).toBe(20);
    expect(result.classes[0].assignmentCount).toBe(5);
  });
});
