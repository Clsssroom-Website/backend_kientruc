import { describe, it, expect, vi, beforeEach } from "vitest";
import { DocumentService } from "../document.service.js";
import { DocumentRepository } from "../../repositories/document.repo.js";
import prisma from "../../config/prisma.js";
import { NotFoundError, ForbiddenError, BadRequestError } from "../../errors/index.js";

// ─── Mock Dependencies ────────────────────────────────────────────────────────

// Sử dụng vi.hoisted() để khai báo các Mock Function trước khi vi.mock chạy
const {
  mockCreateDocumentWithAttachments,
  mockGetDocumentsByClassId,
  mockGetDocumentById,
  mockUpdateDocument,
  mockDeleteAllAttachments,
  mockCreateAttachments,
  mockDeleteDocument,
} = vi.hoisted(() => ({
  mockCreateDocumentWithAttachments: vi.fn(),
  mockGetDocumentsByClassId: vi.fn(),
  mockGetDocumentById: vi.fn(),
  mockUpdateDocument: vi.fn(),
  mockDeleteAllAttachments: vi.fn(),
  mockCreateAttachments: vi.fn(),
  mockDeleteDocument: vi.fn(),
}));

vi.mock("../../repositories/document.repo.js", () => {
  return {
    DocumentRepository: class {
      createDocumentWithAttachments = mockCreateDocumentWithAttachments;
      getDocumentsByClassId = mockGetDocumentsByClassId;
      getDocumentById = mockGetDocumentById;
      updateDocument = mockUpdateDocument;
      deleteAllAttachments = mockDeleteAllAttachments;
      createAttachments = mockCreateAttachments;
      deleteDocument = mockDeleteDocument;
    },
  };
});

vi.mock("../../config/prisma.js", () => ({
  default: {
    classes: {
      findUnique: vi.fn(),
    },
    documentAttachments: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("../storage/minioStorage.js", () => ({
  MinioStorageService: class {
    getPresignedUrl = vi.fn().mockResolvedValue("https://minio.example.com/presigned-doc");
    uploadFile = vi.fn().mockResolvedValue({ url: "documents/doc-1.pdf", size: 2048 });
    deleteFile = vi.fn().mockResolvedValue(undefined);
  },
}));

// ─── Shared Mock Data ─────────────────────────────────────────────────────────

const mockClassRecord = {
  classId: "class-1",
  teacherId: "teacher-1",
  ClassEnrollments: [],
};

const mockDocument = {
  documentId: "doc-1",
  classId: "class-1",
  title: "Tài liệu học tập Toán",
  description: "Các công thức cơ bản",
  DocumentAttachments: [
    { attachmentId: "att-1", fileName: "formula.pdf", fileUri: "documents/formula.pdf", fileSize: 1024n },
  ],
};

describe("DocumentService - uploadDocument", () => {
  let service: DocumentService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new DocumentService();
  });

  it("should upload a document and save to database successfully", async () => {
    vi.mocked(prisma.classes.findUnique).mockResolvedValue(mockClassRecord as any);

    const mockFiles = [
      {
        buffer: Buffer.from("pdf-data"),
        originalname: "formula.pdf",
        mimetype: "application/pdf",
        size: 1024,
      },
    ];

    mockCreateDocumentWithAttachments.mockResolvedValue(mockDocument as any);

    const result = await service.uploadDocument("teacher-1", "class-1", "Tài liệu học tập Toán", "Các công thức cơ bản", mockFiles);

    expect(mockCreateDocumentWithAttachments).toHaveBeenCalledWith({
      classId: "class-1",
      title: "Tài liệu học tập Toán",
      description: "Các công thức cơ bản",
      attachments: [
        { fileName: "formula.pdf", fileUri: "documents/doc-1.pdf", fileSize: 2048 },
      ],
    });

    expect(result.documentId).toBe("doc-1");
    expect(result.DocumentAttachments[0].fileSize).toBe("1024"); // BigInt phải chuyển thành string
  });

  it("should throw NotFoundError if class does not exist", async () => {
    vi.mocked(prisma.classes.findUnique).mockResolvedValue(null);

    await expect(service.uploadDocument("teacher-1", "class-1", "Title", "Desc", []))
      .rejects.toThrow(NotFoundError);
  });

  it("should throw ForbiddenError if user is not the class teacher", async () => {
    vi.mocked(prisma.classes.findUnique).mockResolvedValue(mockClassRecord as any);

    await expect(service.uploadDocument("teacher-2", "class-1", "Title", "Desc", [
      { buffer: Buffer.from("x"), originalname: "a.txt", mimetype: "text/plain", size: 1 },
    ])).rejects.toThrow(ForbiddenError);
  });

  it("should throw BadRequestError if no files are provided", async () => {
    vi.mocked(prisma.classes.findUnique).mockResolvedValue(mockClassRecord as any);

    await expect(service.uploadDocument("teacher-1", "class-1", "Title", "Desc", []))
      .rejects.toThrow(BadRequestError);
  });
});

describe("DocumentService - getDocumentsByClassId", () => {
  let service: DocumentService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new DocumentService();
  });

  it("should return documents for class teacher", async () => {
    vi.mocked(prisma.classes.findUnique).mockResolvedValue(mockClassRecord as any);
    mockGetDocumentsByClassId.mockResolvedValue([mockDocument]);

    const result = await service.getDocumentsByClassId("teacher-1", "class-1");

    expect(result).toHaveLength(1);
    expect(result[0].DocumentAttachments[0].fileSize).toBe("1024");
  });

  it("should return documents for enrolled student", async () => {
    const studentEnrolledClass = {
      classId: "class-1",
      teacherId: "teacher-1",
      ClassEnrollments: [{ studentId: "student-1", status: "JOINED" }],
    };
    vi.mocked(prisma.classes.findUnique).mockResolvedValue(studentEnrolledClass as any);
    mockGetDocumentsByClassId.mockResolvedValue([mockDocument]);

    const result = await service.getDocumentsByClassId("student-1", "class-1");

    expect(result).toHaveLength(1);
  });

  it("should throw ForbiddenError if student is not enrolled", async () => {
    const studentNotEnrolledClass = {
      classId: "class-1",
      teacherId: "teacher-1",
      ClassEnrollments: [],
    };
    vi.mocked(prisma.classes.findUnique).mockResolvedValue(studentNotEnrolledClass as any);

    await expect(service.getDocumentsByClassId("student-stranger", "class-1"))
      .rejects.toThrow(ForbiddenError);
  });
});

describe("DocumentService - getAttachmentDownloadUrl", () => {
  let service: DocumentService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new DocumentService();
  });

  it("should generate presigned url for authorized user", async () => {
    const mockAttachment = {
      attachmentId: "att-1",
      fileName: "formula.pdf",
      fileUri: "documents/formula.pdf",
      Documents: { classId: "class-1" },
    };

    vi.mocked(prisma.documentAttachments.findUnique).mockResolvedValue(mockAttachment as any);
    vi.mocked(prisma.classes.findUnique).mockResolvedValue(mockClassRecord as any);

    const url = await service.getAttachmentDownloadUrl("teacher-1", "att-1", "download");

    expect(url).toBe("https://minio.example.com/presigned-doc");
  });

  it("should throw NotFoundError if attachment not found", async () => {
    vi.mocked(prisma.documentAttachments.findUnique).mockResolvedValue(null);

    await expect(service.getAttachmentDownloadUrl("teacher-1", "bad-att"))
      .rejects.toThrow(NotFoundError);
  });
});

describe("DocumentService - updateDocument", () => {
  let service: DocumentService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new DocumentService();
  });

  it("should update basic fields of a document", async () => {
    mockGetDocumentById.mockResolvedValue(mockDocument as any);
    vi.mocked(prisma.classes.findUnique).mockResolvedValue(mockClassRecord as any);

    await service.updateDocument("teacher-1", "doc-1", {
      title: "Tiêu đề mới tinh",
      description: "Mô tả mới tinh",
    });

    expect(mockUpdateDocument).toHaveBeenCalledWith("doc-1", {
      title: "Tiêu đề mới tinh",
      description: "Mô tả mới tinh",
    });
  });
});

describe("DocumentService - deleteDocument", () => {
  let service: DocumentService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new DocumentService();
  });

  it("should delete document and clean attachments from MinIO and DB", async () => {
    mockGetDocumentById.mockResolvedValue(mockDocument as any);
    vi.mocked(prisma.classes.findUnique).mockResolvedValue(mockClassRecord as any);

    await service.deleteDocument("teacher-1", "doc-1");

    expect(mockDeleteAllAttachments).toHaveBeenCalledWith("doc-1");
    expect(mockDeleteDocument).toHaveBeenCalledWith("doc-1");
  });
});
