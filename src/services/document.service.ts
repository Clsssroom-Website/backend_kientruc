import { DocumentRepository } from "../repositories/document.repo.js";
import { MinioStorageService, IStorageService } from "./storage/minioStorage.js";
import { ForbiddenError, NotFoundError, BadRequestError } from "../errors/index.js";
import prisma from "../config/prisma.js";

export class DocumentService {
  private documentRepo: DocumentRepository;
  private storageService: IStorageService;

  constructor() {
    this.documentRepo = new DocumentRepository();
    this.storageService = new MinioStorageService();
  }

  public async uploadDocument(
    userId: string,
    classId: string,
    title: string,
    description: string | undefined,
    files: Array<{
      buffer: Buffer;
      originalname: string;
      mimetype: string;
      size: number;
    }>
  ) {
    // 1. Validate if class exists and user is the teacher
    const classRecord = await prisma.classes.findUnique({
      where: { classId },
      select: { teacherId: true },
    });

    if (!classRecord) {
      throw new NotFoundError("Lớp học không tồn tại.");
    }

    if (classRecord.teacherId !== userId) {
      throw new ForbiddenError("Bạn không có quyền tải tài liệu lên lớp học này.");
    }

    // 2. Additional File Validation
    if (!files || files.length === 0) {
      throw new BadRequestError("Vui lòng đính kèm ít nhất một tệp tài liệu.");
    }

    // 3. Upload all files to MinIO
    const attachments = [];
    for (const file of files) {
      if (!file.buffer || file.buffer.length === 0) {
        throw new BadRequestError(`Tệp ${file.originalname} không hợp lệ hoặc rỗng.`);
      }
      const uploadResult = await this.storageService.uploadFile(file.buffer, file.originalname, file.mimetype);
      attachments.push({
        fileName: file.originalname,
        fileUri: uploadResult.url,
        fileSize: uploadResult.size,
      });
    }

    // 4. Save metadata in the database
    const document = await this.documentRepo.createDocumentWithAttachments({
      classId,
      title,
      description,
      attachments,
    });

    // We convert BigInt to string for JSON serialization
    const serializedDocument = {
      ...document,
      DocumentAttachments: document.DocumentAttachments.map(att => ({
        ...att,
        fileSize: att.fileSize ? att.fileSize.toString() : null,
      }))
    };

    return serializedDocument;
  }

  public async getDocumentsByClassId(userId: string, classId: string) {
    // 1. Verify class and permission (Teacher or enrolled Student)
    const classRecord = await prisma.classes.findUnique({
      where: { classId },
      include: {
        ClassEnrollments: {
          where: { studentId: userId, status: "JOINED" }
        }
      }
    });

    if (!classRecord) {
      throw new NotFoundError("Lớp học không tồn tại.");
    }

    if (classRecord.teacherId !== userId && classRecord.ClassEnrollments.length === 0) {
      throw new ForbiddenError("Bạn không có quyền xem tài liệu của lớp học này.");
    }

    // 2. Fetch documents
    const documents = await this.documentRepo.getDocumentsByClassId(classId);

    // 3. Serialize BigInt
    return documents.map(doc => ({
      ...doc,
      DocumentAttachments: doc.DocumentAttachments.map(att => ({
        ...att,
        fileSize: att.fileSize ? att.fileSize.toString() : null,
      }))
    }));
  }

  public async getAttachmentDownloadUrl(userId: string, attachmentId: string, action?: string): Promise<string> {
    const attachment = await prisma.documentAttachments.findUnique({
      where: { attachmentId },
      include: {
        Documents: true,
      },
    });

    if (!attachment) {
      throw new NotFoundError("Tệp đính kèm không tồn tại.");
    }

    const document = attachment.Documents;
    if (!document) {
      throw new NotFoundError("Tài liệu không tồn tại.");
    }

    const classRecord = await prisma.classes.findUnique({
      where: { classId: document.classId },
      include: {
        ClassEnrollments: {
          where: { studentId: userId, status: "JOINED" }
        }
      }
    });

    if (!classRecord) {
      throw new NotFoundError("Lớp học không tồn tại.");
    }

    if (classRecord.teacherId !== userId && classRecord.ClassEnrollments.length === 0) {
      throw new ForbiddenError("Bạn không có quyền tải tài liệu này.");
    }

    const forceDownload = action === "download";
    return await this.storageService.getPresignedUrl(attachment.fileUri, forceDownload, attachment.fileName || undefined);
  }

  public async updateDocument(
    userId: string,
    documentId: string,
    data: {
      title?: string;
      description?: string;
      keepAttachmentIds?: string[];
      files?: Express.Multer.File[];
    }
  ) {
    const document = await this.documentRepo.getDocumentById(documentId);
    if (!document) {
      throw new NotFoundError("Tài liệu không tồn tại.");
    }

    const classRecord = await prisma.classes.findUnique({
      where: { classId: document.classId },
      select: { teacherId: true },
    });

    if (!classRecord) {
      throw new NotFoundError("Lớp học không tồn tại.");
    }

    if (classRecord.teacherId !== userId) {
      throw new ForbiddenError("Bạn không có quyền chỉnh sửa tài liệu này.");
    }

    if (data.title !== undefined && data.title.trim() === "") {
      throw new BadRequestError("Tiêu đề không được để trống.");
    }

    await this.documentRepo.updateDocument(documentId, {
      title: data.title?.trim(),
      description: data.description?.trim(),
    });

    const hasNewFiles = data.files && data.files.length > 0;
    const isManagingAttachments = data.keepAttachmentIds !== undefined || hasNewFiles;

    if (isManagingAttachments) {
      const oldAttachments = document.DocumentAttachments || [];
      const keepIds = data.keepAttachmentIds ?? [];

      for (const old of oldAttachments) {
        if (!keepIds.includes(old.attachmentId) && old.fileUri) {
          await (this.storageService as MinioStorageService).deleteFile(old.fileUri);
        }
      }

      await this.documentRepo.deleteAllAttachments(documentId);

      const attachmentsToCreate: { fileName: string; fileUri: string; fileSize: number }[] = [];
      for (const old of oldAttachments) {
        if (keepIds.includes(old.attachmentId)) {
          attachmentsToCreate.push({
            fileName: old.fileName,
            fileUri: old.fileUri,
            fileSize: old.fileSize ? Number(old.fileSize) : 0,
          });
        }
      }

      if (hasNewFiles) {
        for (const file of data.files!) {
          if (!file.buffer || file.buffer.length === 0) {
            throw new BadRequestError(`Tệp ${file.originalname} không hợp lệ hoặc rỗng.`);
          }
          const uploadResult = await this.storageService.uploadFile(file.buffer, file.originalname, file.mimetype);
          attachmentsToCreate.push({
            fileName: file.originalname,
            fileUri: uploadResult.url,
            fileSize: uploadResult.size,
          });
        }
      }

      if (attachmentsToCreate.length > 0) {
        await this.documentRepo.createAttachments(documentId, attachmentsToCreate);
      }
    }

    const updated = await this.documentRepo.getDocumentById(documentId);
    if (!updated) {
      throw new NotFoundError("Tài liệu không tồn tại sau khi cập nhật.");
    }

    const serializedDocument = {
      ...updated,
      DocumentAttachments: updated.DocumentAttachments.map(att => ({
        ...att,
        fileSize: att.fileSize ? att.fileSize.toString() : null,
      }))
    };

    return serializedDocument;
  }

  public async deleteDocument(userId: string, documentId: string): Promise<void> {
    const document = await this.documentRepo.getDocumentById(documentId);
    if (!document) {
      throw new NotFoundError("Tài liệu không tồn tại.");
    }

    const classRecord = await prisma.classes.findUnique({
      where: { classId: document.classId },
      select: { teacherId: true },
    });

    if (!classRecord) {
      throw new NotFoundError("Lớp học không tồn tại.");
    }

    if (classRecord.teacherId !== userId) {
      throw new ForbiddenError("Bạn không có quyền xóa tài liệu này.");
    }

    for (const att of document.DocumentAttachments || []) {
      if (att.fileUri) {
        await (this.storageService as MinioStorageService).deleteFile(att.fileUri);
      }
    }

    await this.documentRepo.deleteAllAttachments(documentId);
    await this.documentRepo.deleteDocument(documentId);
  }
}
