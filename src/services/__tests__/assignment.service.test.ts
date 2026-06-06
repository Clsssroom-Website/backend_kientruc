import { describe, it, expect, vi, beforeEach } from "vitest";
import { AssignmentService } from "../assignment.service.js";
import { AssignmentRepository } from "../../repositories/assignment.repo.js";
import prisma from "../../config/prisma.js";
import { eventBus } from "../../events/eventBus.js";
import { NotFoundError, ForbiddenError, BadRequestError } from "../../errors/index.js";

// ─── Mock Dependencies ────────────────────────────────────────────────────────

// Định nghĩa các mock functions trước bằng vi.hoisted() để tránh lỗi hoisted của vi.mock trong Vitest
const {
  mockFindAssignmentById,
  mockCreateAssignment,
  mockFindAssignmentsByClassId,
  mockUpdateAssignment,
  mockDeleteAssignment,
  mockCreateAttachments,
  mockDeleteAttachment,
  mockDeleteAllAttachments,
  mockFindSubmissionsByAssignmentId,
  mockUpsertGrade,
  mockUpsertQuizQuestions,
  mockDeleteQuizQuestions,
} = vi.hoisted(() => ({
  mockFindAssignmentById: vi.fn(),
  mockCreateAssignment: vi.fn(),
  mockFindAssignmentsByClassId: vi.fn(),
  mockUpdateAssignment: vi.fn(),
  mockDeleteAssignment: vi.fn(),
  mockCreateAttachments: vi.fn(),
  mockDeleteAttachment: vi.fn(),
  mockDeleteAllAttachments: vi.fn(),
  mockFindSubmissionsByAssignmentId: vi.fn(),
  mockUpsertGrade: vi.fn(),
  mockUpsertQuizQuestions: vi.fn(),
  mockDeleteQuizQuestions: vi.fn(),
}));

// Mock Repository sử dụng các mock functions trên
vi.mock("../../repositories/assignment.repo.js", () => {
  return {
    AssignmentRepository: class {
      findAssignmentById = mockFindAssignmentById;
      createAssignment = mockCreateAssignment;
      findAssignmentsByClassId = mockFindAssignmentsByClassId;
      updateAssignment = mockUpdateAssignment;
      deleteAssignment = mockDeleteAssignment;
      createAttachments = mockCreateAttachments;
      deleteAttachment = mockDeleteAttachment;
      deleteAllAttachments = mockDeleteAllAttachments;
      findSubmissionsByAssignmentId = mockFindSubmissionsByAssignmentId;
      upsertGrade = mockUpsertGrade;
      upsertQuizQuestions = mockUpsertQuizQuestions;
      deleteQuizQuestions = mockDeleteQuizQuestions;
    },
  };
});

// Mock Prisma Client
vi.mock("../../config/prisma.js", () => ({
  default: {
    classes: {
      findUnique: vi.fn(),
    },
    users: {
      findUnique: vi.fn(),
    },
    submissions: {
      findUnique: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
  },
}));

// Mock Event Bus
vi.mock("../../events/eventBus.js", () => ({
  eventBus: {
    emit: vi.fn(),
  },
}));

// Mock MinioStorageService
vi.mock("../storage/minioStorage.js", () => ({
  MinioStorageService: class {
    getPresignedUrl = vi.fn().mockResolvedValue("https://minio.example.com/presigned");
    uploadFile = vi.fn().mockResolvedValue({ url: "assignments/file-1.pdf", size: 1024 });
    deleteFile = vi.fn().mockResolvedValue(undefined);
  },
}));

// ─── Shared Mock Data ─────────────────────────────────────────────────────────

const mockClassRecord = {
  classId: "class-1",
  className: "Lớp Học Thử Nghiệm",
  teacherId: "teacher-1",
};

const mockTeacherRecord = {
  userId: "teacher-1",
  name: "Thầy Giáo A",
  email: "teacherA@test.com",
};

const mockAssignment = {
  assignmentId: "assign-1",
  classId: "class-1",
  title: "Bài Tập Số 1",
  description: "Mô tả bài tập",
  deadline: new Date("2026-06-01"),
  typeAssignment: "ESSAY",
  quizData: null,
  AssignmentAttachments: [
    { attachmentId: "att-1", fileName: "de_bai.pdf", fileUrl: "assignments/de_bai.pdf", fileSize: 2048 },
  ],
  Classes: {
    classId: "class-1",
    className: "Lớp Học Thử Nghiệm",
    teacherId: "teacher-1",
  },
};

describe("AssignmentService - createAssignment", () => {
  let service: AssignmentService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AssignmentService();
  });

  it("should create an assignment successfully without files", async () => {
    // Giả lập tìm thấy lớp học hợp lệ
    vi.mocked(prisma.classes.findUnique).mockResolvedValue(mockClassRecord as any);
    // Giả lập tìm thấy thông tin giáo viên giao bài
    vi.mocked(prisma.users.findUnique).mockResolvedValue(mockTeacherRecord as any);

    // Giả lập lưu bài tập vào DB thành công
    const createdRaw = {
      assignmentId: "assign-1",
      classId: "class-1",
      title: "Bài Tập Số 1",
      description: "Mô tả",
      deadline: new Date("2026-06-01"),
      typeAssignment: "ESSAY",
      AssignmentAttachments: [],
    };
    mockCreateAssignment.mockResolvedValue(createdRaw as any);
    mockFindAssignmentById.mockResolvedValue(createdRaw as any);

    const result = await service.createAssignment("teacher-1", "class-1", {
      title: "Bài Tập Số 1",
      description: "Mô tả",
      deadline: "2026-06-01T00:00:00.000Z",
    });

    // Xác nhận đã gọi repo để tạo
    expect(mockCreateAssignment).toHaveBeenCalledWith({
      classId: "class-1",
      title: "Bài Tập Số 1",
      description: "Mô tả",
      deadline: new Date("2026-06-01T00:00:00.000Z"),
      typeAssignment: "ESSAY",
      quizData: undefined,
    });

    // Xác nhận đã phát sự kiện thông báo qua eventBus
    expect(eventBus.emit).toHaveBeenCalledWith("assignment.created", expect.objectContaining({
      assignmentId: "assign-1",
      className: "Lớp Học Thử Nghiệm",
      teacherName: "Thầy Giáo A",
    }));

    expect(result.assignmentId).toBe("assign-1");
  });

  it("should create assignment with file attachments", async () => {
    vi.mocked(prisma.classes.findUnique).mockResolvedValue(mockClassRecord as any);
    vi.mocked(prisma.users.findUnique).mockResolvedValue(mockTeacherRecord as any);

    const createdRaw = {
      assignmentId: "assign-1",
      classId: "class-1",
      title: "Bài Tập 1",
      deadline: new Date("2026-06-01"),
      AssignmentAttachments: [],
    };
    mockCreateAssignment.mockResolvedValue(createdRaw as any);

    // Sau khi upload file, repo trả về bài tập có đính kèm
    const createdWithAttachments = {
      ...createdRaw,
      AssignmentAttachments: [
        { attachmentId: "att-mock", fileName: "test.pdf", fileUrl: "assignments/file-1.pdf", fileSize: 1024 },
      ],
    };
    mockFindAssignmentById.mockResolvedValue(createdWithAttachments as any);

    // Mock file upload từ multer
    const mockFiles = [
      {
        originalname: "test.pdf",
        buffer: Buffer.from("file-content"),
        mimetype: "application/pdf",
      },
    ] as Express.Multer.File[];

    const result = await service.createAssignment("teacher-1", "class-1", {
      title: "Bài Tập 1",
      deadline: "2026-06-01T00:00:00.000Z",
      files: mockFiles,
    });

    // Kiểm tra đã gọi hàm lưu attachments
    expect(mockCreateAttachments).toHaveBeenCalledWith("assign-1", [
      { fileName: "test.pdf", fileUrl: "assignments/file-1.pdf", fileSize: 1024 },
    ]);
    // Đường dẫn file của attachment được map thành presigned URL
    expect(result.AssignmentAttachments[0].fileUrl).toBe("https://minio.example.com/presigned");
  });

  it("should throw NotFoundError if class does not exist", async () => {
    vi.mocked(prisma.classes.findUnique).mockResolvedValue(null);

    await expect(service.createAssignment("teacher-1", "bad-class", {
      title: "X",
      deadline: "2026-06-01",
    })).rejects.toThrow(NotFoundError);
  });

  it("should throw ForbiddenError if user is not the teacher of the class", async () => {
    vi.mocked(prisma.classes.findUnique).mockResolvedValue(mockClassRecord as any);

    // Giao bài bằng "teacher-2" nhưng chủ lớp là "teacher-1"
    await expect(service.createAssignment("teacher-2", "class-1", {
      title: "X",
      deadline: "2026-06-01",
    })).rejects.toThrow(ForbiddenError);
  });

  it("should throw BadRequestError if title is empty", async () => {
    vi.mocked(prisma.classes.findUnique).mockResolvedValue(mockClassRecord as any);

    await expect(service.createAssignment("teacher-1", "class-1", {
      title: "  ",
      deadline: "2026-06-01",
    })).rejects.toThrow(BadRequestError);
  });

  it("should throw BadRequestError if deadline date is invalid", async () => {
    vi.mocked(prisma.classes.findUnique).mockResolvedValue(mockClassRecord as any);

    await expect(service.createAssignment("teacher-1", "class-1", {
      title: "Valid Title",
      deadline: "invalid-date-string",
    })).rejects.toThrow(BadRequestError);
  });
});

describe("AssignmentService - getAssignmentsByClassId", () => {
  let service: AssignmentService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AssignmentService();
  });

  it("should return assignments list with totalSubmissions for authorized teacher", async () => {
    vi.mocked(prisma.classes.findUnique).mockResolvedValue(mockClassRecord as any);

    const rawList = [
      {
        ...mockAssignment,
        _count: { Submissions: 12 },
      },
    ];
    mockFindAssignmentsByClassId.mockResolvedValue(rawList as any);

    const result = await service.getAssignmentsByClassId("teacher-1", "class-1");

    expect(result).toHaveLength(1);
    expect(result[0].totalSubmissions).toBe(12);
    expect(result[0]._count).toBeUndefined(); // Biến _count nội bộ phải bị xóa
  });

  it("should throw ForbiddenError if not the owner teacher", async () => {
    vi.mocked(prisma.classes.findUnique).mockResolvedValue(mockClassRecord as any);

    await expect(service.getAssignmentsByClassId("teacher-2", "class-1"))
      .rejects.toThrow(ForbiddenError);
  });
});

describe("AssignmentService - updateAssignment", () => {
  let service: AssignmentService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AssignmentService();
  });

  it("should update assignment basic fields successfully", async () => {
    mockFindAssignmentById.mockResolvedValue(mockAssignment as any);

    const result = await service.updateAssignment("teacher-1", "assign-1", {
      title: "Bài tập mới đổi tên",
      description: "Mô tả mới",
    });

    expect(mockUpdateAssignment).toHaveBeenCalledWith("assign-1", expect.objectContaining({
      title: "Bài tập mới đổi tên",
      description: "Mô tả mới",
    }));
  });

  it("should manage attachments by keeping specified ones and uploading new ones", async () => {
    mockFindAssignmentById.mockResolvedValue(mockAssignment as any);

    // Mock file mới
    const mockFiles = [
      {
        originalname: "new_file.png",
        buffer: Buffer.from("png-content"),
        mimetype: "image/png",
      },
    ] as Express.Multer.File[];

    await service.updateAssignment("teacher-1", "assign-1", {
      keepAttachmentIds: [], // Không giữ lại file "att-1" cũ
      files: mockFiles,
    });

    // Đã gọi xóa tất cả cũ
    expect(mockDeleteAllAttachments).toHaveBeenCalledWith("assign-1");
    // Đã tạo đính kèm mới từ multer file
    expect(mockCreateAttachments).toHaveBeenCalledWith("assign-1", [
      { fileName: "new_file.png", fileUrl: "assignments/file-1.pdf", fileSize: 1024 },
    ]);
  });
});

describe("AssignmentService - deleteAssignment", () => {
  let service: AssignmentService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AssignmentService();
  });

  it("should delete assignment and all attachments successfully", async () => {
    mockFindAssignmentById.mockResolvedValue(mockAssignment as any);

    await service.deleteAssignment("teacher-1", "assign-1");

    expect(mockDeleteAllAttachments).toHaveBeenCalledWith("assign-1");
    expect(mockDeleteAssignment).toHaveBeenCalledWith("assign-1");
  });

  it("should throw BadRequestError if assignment has submissions", async () => {
    mockFindAssignmentById.mockResolvedValue(mockAssignment as any);
    // Mock prisma.submissions.count to return a count > 0
    vi.mocked(prisma.submissions.count).mockResolvedValueOnce(1);

    await expect(service.deleteAssignment("teacher-1", "assign-1"))
      .rejects.toThrow(BadRequestError);

    // Verify it doesn't proceed to delete attachments or the assignment itself
    expect(mockDeleteAllAttachments).not.toHaveBeenCalled();
    expect(mockDeleteAssignment).not.toHaveBeenCalled();
  });
});

describe("AssignmentService - getSubmissionsByAssignmentId", () => {
  let service: AssignmentService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AssignmentService();
  });

  it("should return serialized submissions for teacher with presigned URLs", async () => {
    mockFindAssignmentById.mockResolvedValue(mockAssignment as any);

    const rawSubmissions = [
      {
        submissionId: "sub-1",
        assignmentId: "assign-1",
        studentId: "student-1",
        submittedAt: new Date("2026-05-27"),
        status: "SUBMITTED",
        Users: { userId: "student-1", name: "Nguyễn Văn Học Sinh", email: "student@test.com" },
        SubmissionAttachments: [
          { attachmentId: "sa-1", submissionId: "sub-1", fileName: "bai_lam.docx", fileUri: "submissions/bai_lam.docx", fileSize: 5000 },
        ],
        Grades: [{ gradeId: "g-1", score: 9.5, comment: "Rất tốt", gradedAt: new Date() }],
      },
    ];

    mockFindSubmissionsByAssignmentId.mockResolvedValue(rawSubmissions as any);

    const result = await service.getSubmissionsByAssignmentId("teacher-1", "assign-1");

    expect(result).toHaveLength(1);
    expect(result[0].student?.name).toBe("Nguyễn Văn Học Sinh");
    expect(result[0].grade?.score).toBe(9.5);
    // Presigned URL của file nộp bài tập được khởi tạo
    expect(result[0].SubmissionAttachments[0].fileUrl).toBe("https://minio.example.com/presigned");
  });
});

describe("AssignmentService - gradeSubmission", () => {
  let service: AssignmentService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AssignmentService();
  });

  it("should grade submission successfully if data is valid", async () => {
    mockFindAssignmentById.mockResolvedValue(mockAssignment as any);

    // Giả lập tìm thấy bài nộp
    const mockSubmissionRecord = {
      submissionId: "sub-1",
      assignmentId: "assign-1",
      studentId: "student-1",
    };
    vi.mocked(prisma.submissions.findUnique).mockResolvedValue(mockSubmissionRecord as any);

    await service.gradeSubmission("teacher-1", "assign-1", "sub-1", {
      score: 8.5,
      comment: "Làm bài tốt",
    });

    expect(mockUpsertGrade).toHaveBeenCalledWith({
      submissionId: "sub-1",
      studentId: "student-1",
      classId: "class-1",
      assignmentId: "assign-1",
      score: 8.5,
      comment: "Làm bài tốt",
    });
  });

  it("should throw NotFoundError if submission to grade does not exist", async () => {
    mockFindAssignmentById.mockResolvedValue(mockAssignment as any);
    vi.mocked(prisma.submissions.findUnique).mockResolvedValue(null);

    await expect(service.gradeSubmission("teacher-1", "assign-1", "bad-sub", { score: 9 }))
      .rejects.toThrow(NotFoundError);
  });

  it("should throw BadRequestError if submission does not belong to the target assignment", async () => {
    mockFindAssignmentById.mockResolvedValue(mockAssignment as any);

    // Bài nộp thuộc bài tập "assign-different" chứ không phải "assign-1"
    const mockSubmissionRecord = {
      submissionId: "sub-1",
      assignmentId: "assign-different",
      studentId: "student-1",
    };
    vi.mocked(prisma.submissions.findUnique).mockResolvedValue(mockSubmissionRecord as any);

    await expect(service.gradeSubmission("teacher-1", "assign-1", "sub-1", { score: 9 }))
      .rejects.toThrow(BadRequestError);
  });
});

describe("AssignmentService - MULTIPLE_CHOICE assignments", () => {
  let service: AssignmentService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AssignmentService();
  });

  const validQuestions = [
    {
      questionText: "Câu hỏi 1",
      points: 1,
      sortOrder: 1,
      options: [
        { optionText: "Đáp án A", isCorrect: true },
        { optionText: "Đáp án B", isCorrect: false },
      ],
    },
  ];

  it("should create a MULTIPLE_CHOICE assignment successfully", async () => {
    vi.mocked(prisma.classes.findUnique).mockResolvedValue(mockClassRecord as any);
    vi.mocked(prisma.users.findUnique).mockResolvedValue(mockTeacherRecord as any);

    const createdRaw = {
      assignmentId: "assign-multiple-choice",
      classId: "class-1",
      title: "Trắc nghiệm 1",
      typeAssignment: "MULTIPLE_CHOICE",
      AssignmentAttachments: [],
    };

    mockCreateAssignment.mockResolvedValue(createdRaw as any);
    mockFindAssignmentById.mockResolvedValue(createdRaw as any);
    mockUpsertQuizQuestions.mockResolvedValue([]);

    const result = await service.createAssignment("teacher-1", "class-1", {
      title: "Trắc nghiệm 1",
      deadline: "2026-06-01T00:00:00.000Z",
      typeAssignment: "MULTIPLE_CHOICE",
      questions: validQuestions,
    });

    expect(mockCreateAssignment).toHaveBeenCalledWith({
      classId: "class-1",
      title: "Trắc nghiệm 1",
      description: undefined,
      deadline: new Date("2026-06-01T00:00:00.000Z"),
      typeAssignment: "MULTIPLE_CHOICE",
    });

    expect(mockUpsertQuizQuestions).toHaveBeenCalledWith("assign-multiple-choice", [
      {
        questionText: "Câu hỏi 1",
        points: 1,
        sortOrder: 1,
        options: [
          { optionText: "Đáp án A", isCorrect: true },
          { optionText: "Đáp án B", isCorrect: false },
        ],
      },
    ]);

    expect(result.assignmentId).toBe("assign-multiple-choice");
  });

  it("should throw BadRequestError if MULTIPLE_CHOICE assignment has no questions", async () => {
    vi.mocked(prisma.classes.findUnique).mockResolvedValue(mockClassRecord as any);

    await expect(
      service.createAssignment("teacher-1", "class-1", {
        title: "Trắc nghiệm 1",
        deadline: "2026-06-01T00:00:00.000Z",
        typeAssignment: "MULTIPLE_CHOICE",
        questions: [],
      })
    ).rejects.toThrow(BadRequestError);
  });

  it("should throw BadRequestError if a question has empty text", async () => {
    vi.mocked(prisma.classes.findUnique).mockResolvedValue(mockClassRecord as any);

    await expect(
      service.createAssignment("teacher-1", "class-1", {
        title: "Trắc nghiệm 1",
        deadline: "2026-06-01T00:00:00.000Z",
        typeAssignment: "MULTIPLE_CHOICE",
        questions: [
          {
            questionText: " ",
            options: [
              { optionText: "A", isCorrect: true },
              { optionText: "B", isCorrect: false },
            ],
          },
        ],
      })
    ).rejects.toThrow(BadRequestError);
  });

  it("should throw BadRequestError if a question has less than 2 options", async () => {
    vi.mocked(prisma.classes.findUnique).mockResolvedValue(mockClassRecord as any);

    await expect(
      service.createAssignment("teacher-1", "class-1", {
        title: "Trắc nghiệm 1",
        deadline: "2026-06-01T00:00:00.000Z",
        typeAssignment: "MULTIPLE_CHOICE",
        questions: [
          {
            questionText: "Câu hỏi 1",
            options: [{ optionText: "A", isCorrect: true }],
          },
        ],
      })
    ).rejects.toThrow(BadRequestError);
  });

  it("should throw BadRequestError if a question has no correct option", async () => {
    vi.mocked(prisma.classes.findUnique).mockResolvedValue(mockClassRecord as any);

    await expect(
      service.createAssignment("teacher-1", "class-1", {
        title: "Trắc nghiệm 1",
        deadline: "2026-06-01T00:00:00.000Z",
        typeAssignment: "MULTIPLE_CHOICE",
        questions: [
          {
            questionText: "Câu hỏi 1",
            options: [
              { optionText: "A", isCorrect: false },
              { optionText: "B", isCorrect: false },
            ],
          },
        ],
      })
    ).rejects.toThrow(BadRequestError);
  });

  it("should throw BadRequestError when updating MULTIPLE_CHOICE questions if assignment already has submissions", async () => {
    const mockAssignmentWithSubmissions = {
      ...mockAssignment,
      assignmentId: "assign-multiple-choice",
      typeAssignment: "MULTIPLE_CHOICE",
    };

    mockFindAssignmentById.mockResolvedValue(mockAssignmentWithSubmissions as any);
    vi.mocked(prisma.submissions.count).mockResolvedValue(1); // Bài tập đã có 1 bài nộp

    await expect(
      service.updateAssignment("teacher-1", "assign-multiple-choice", {
        questions: validQuestions,
      })
    ).rejects.toThrow(BadRequestError);
  });
});
