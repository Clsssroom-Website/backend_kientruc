import { describe, it, expect, vi, beforeEach } from "vitest";
import { DocumentService } from "../../src/services/document.service.js";
import { ForbiddenError, NotFoundError, BadRequestError } from "../../src/errors/index.js";
import prisma from "../../src/config/prisma.js";

// Mock dependencies
vi.mock("../../src/config/prisma.js", () => ({
  default: {
    classes: {
      findUnique: vi.fn(),
    },
  },
}));

const mockDocument = {
  documentId: "doc-123",
  classId: "class-123",
  title: "Test Doc",
  description: "Test Desc",
  DocumentAttachments: [
    { attachmentId: "att-123", fileName: "test.pdf", fileUri: "url/test.pdf", fileSize: 1024n }
  ]
};

const mockCreateDocumentWithAttachments = vi.fn().mockResolvedValue(mockDocument);
const mockGetDocumentById = vi.fn().mockResolvedValue(mockDocument);
const mockUpdateDocument = vi.fn().mockResolvedValue(mockDocument);
const mockDeleteAllAttachments = vi.fn().mockResolvedValue({ count: 1 });
const mockCreateAttachments = vi.fn().mockResolvedValue({ count: 1 });
const mockDeleteDocument = vi.fn().mockResolvedValue(mockDocument);

vi.mock("../../src/repositories/document.repo.js", () => {
  return {
    DocumentRepository: class {
      createDocumentWithAttachments = mockCreateDocumentWithAttachments;
      getDocumentById = mockGetDocumentById;
      updateDocument = mockUpdateDocument;
      deleteAllAttachments = mockDeleteAllAttachments;
      createAttachments = mockCreateAttachments;
      deleteDocument = mockDeleteDocument;
    }
  };
});

const mockUploadFile = vi.fn().mockResolvedValue({ url: "url/test.pdf", size: 1024 });
const mockDeleteFile = vi.fn().mockResolvedValue(undefined);

vi.mock("../../src/services/storage/minioStorage.js", () => {
  return {
    MinioStorageService: class {
      uploadFile = mockUploadFile;
      deleteFile = mockDeleteFile;
      getPresignedUrl = vi.fn().mockResolvedValue("http://fake-presigned-url");
    }
  };
});

describe("DocumentService", () => {
  let documentService: DocumentService;

  beforeEach(() => {
    vi.clearAllMocks();
    documentService = new DocumentService();
    // Default mocks
    mockGetDocumentById.mockResolvedValue(mockDocument);
  });

  describe("uploadDocument", () => {
    it("should upload a document successfully", async () => {
      // Arrange
      (prisma.classes.findUnique as any).mockResolvedValue({ teacherId: "teacher-123" });
      const fileBuffer = Buffer.from("test content");
      const mockFiles = [{
        buffer: fileBuffer,
        originalname: "test.pdf",
        mimetype: "application/pdf",
        size: fileBuffer.length
      }];

      // Act
      const result = await documentService.uploadDocument(
        "teacher-123",
        "class-123",
        "Test Doc",
        "Test Desc",
        mockFiles
      );

      // Assert
      expect(result).toBeDefined();
      expect(result.documentId).toBe("doc-123");
      expect(result.DocumentAttachments[0].fileSize).toBe("1024");
    });

    it("should throw NotFoundError if class does not exist", async () => {
      // Arrange
      (prisma.classes.findUnique as any).mockResolvedValue(null);
      const fileBuffer = Buffer.from("test content");
      const mockFiles = [{
        buffer: fileBuffer,
        originalname: "test.pdf",
        mimetype: "application/pdf",
        size: fileBuffer.length
      }];

      // Act & Assert
      await expect(documentService.uploadDocument(
        "teacher-123", "class-123", "Test", "Test", mockFiles
      )).rejects.toThrow(NotFoundError);
    });

    it("should throw ForbiddenError if user is not the teacher of the class", async () => {
      // Arrange
      (prisma.classes.findUnique as any).mockResolvedValue({ teacherId: "another-teacher" });
      const fileBuffer = Buffer.from("test content");
      const mockFiles = [{
        buffer: fileBuffer,
        originalname: "test.pdf",
        mimetype: "application/pdf",
        size: fileBuffer.length
      }];

      // Act & Assert
      await expect(documentService.uploadDocument(
        "teacher-123", "class-123", "Test", "Test", mockFiles
      )).rejects.toThrow(ForbiddenError);
    });
  });

  describe("updateDocument", () => {
    it("should update document text fields successfully", async () => {
      // Arrange
      (prisma.classes.findUnique as any).mockResolvedValue({ teacherId: "teacher-123" });
      
      // Act
      const result = await documentService.updateDocument(
        "teacher-123",
        "doc-123",
        { title: "Updated Title", description: "Updated Desc" }
      );

      // Assert
      expect(result).toBeDefined();
      expect(mockUpdateDocument).toHaveBeenCalledWith("doc-123", {
        title: "Updated Title",
        description: "Updated Desc"
      });
    });

    it("should delete old files and upload new ones", async () => {
      // Arrange
      (prisma.classes.findUnique as any).mockResolvedValue({ teacherId: "teacher-123" });
      const fileBuffer = Buffer.from("new file content");
      const mockFiles = [{
        buffer: fileBuffer,
        originalname: "new.pdf",
        originalname_lower: "new.pdf",
        mimetype: "application/pdf",
        size: fileBuffer.length
      }] as any;

      // Act
      await documentService.updateDocument(
        "teacher-123",
        "doc-123",
        {
          title: "Updated Title",
          keepAttachmentIds: [], // delete att-123
          files: mockFiles
        }
      );

      // Assert
      expect(mockDeleteFile).toHaveBeenCalledWith("url/test.pdf");
      expect(mockDeleteAllAttachments).toHaveBeenCalledWith("doc-123");
      expect(mockCreateAttachments).toHaveBeenCalled();
    });

    it("should throw ForbiddenError if user is not the teacher of the class", async () => {
      // Arrange
      (prisma.classes.findUnique as any).mockResolvedValue({ teacherId: "another-teacher" });

      // Act & Assert
      await expect(documentService.updateDocument(
        "teacher-123", "doc-123", { title: "Test" }
      )).rejects.toThrow(ForbiddenError);
    });
  });

  describe("deleteDocument", () => {
    it("should delete document and files successfully", async () => {
      // Arrange
      (prisma.classes.findUnique as any).mockResolvedValue({ teacherId: "teacher-123" });

      // Act
      await documentService.deleteDocument("teacher-123", "doc-123");

      // Assert
      expect(mockDeleteFile).toHaveBeenCalledWith("url/test.pdf");
      expect(mockDeleteAllAttachments).toHaveBeenCalledWith("doc-123");
      expect(mockDeleteDocument).toHaveBeenCalledWith("doc-123");
    });

    it("should throw ForbiddenError if user is not the teacher", async () => {
      // Arrange
      (prisma.classes.findUnique as any).mockResolvedValue({ teacherId: "another-teacher" });

      // Act & Assert
      await expect(documentService.deleteDocument("teacher-123", "doc-123")).rejects.toThrow(ForbiddenError);
    });
  });
});
