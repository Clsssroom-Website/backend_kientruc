import prisma from "../config/prisma.js";
import { v4 as uuidv4 } from "uuid";
import { Documents, DocumentAttachments } from "@prisma/client";

export class DocumentRepository {
  /**
   * Creates a Document and its associated DocumentAttachments in a transaction
   */
  public async createDocumentWithAttachments(data: {
    classId: string;
    title: string;
    description?: string;
    attachments: Array<{
      fileName: string;
      fileUri: string;
      fileSize: number;
    }>;
  }): Promise<Documents & { DocumentAttachments: DocumentAttachments[] }> {
    const documentId = uuidv4();

    return await prisma.$transaction(async (tx) => {
      const document = await tx.documents.create({
        data: {
          documentId,
          classId: data.classId,
          title: data.title,
          description: data.description,
          DocumentAttachments: {
            create: data.attachments.map((att) => ({
              attachmentId: uuidv4(),
              fileName: att.fileName,
              fileUri: att.fileUri,
              fileSize: BigInt(att.fileSize),
            })),
          },
        },
        include: {
          DocumentAttachments: true,
        },
      });

      return document;
    });
  }

  /**
   * Finds a document by its ID
   */
  public async getDocumentById(documentId: string) {
    return await prisma.documents.findUnique({
      where: { documentId },
      include: {
        DocumentAttachments: true,
      },
    });
  }

  /**
   * Retrieves all documents for a specific class, ordered by upload time descending
   */
  public async getDocumentsByClassId(classId: string) {
    return await prisma.documents.findMany({
      where: { classId },
      include: {
        DocumentAttachments: true,
      },
      orderBy: { uploadTime: 'desc' },
    });
  }

  /**
   * Updates basic document info
   */
  public async updateDocument(
    documentId: string,
    data: {
      title?: string;
      description?: string;
    }
  ) {
    return prisma.documents.update({
      where: { documentId },
      data,
      include: {
        DocumentAttachments: true,
      },
    });
  }

  /**
   * Delete all attachments for a document
   */
  public async deleteAllAttachments(documentId: string) {
    return prisma.documentAttachments.deleteMany({
      where: { documentId },
    });
  }

  /**
   * Create new attachments for a document
   */
  public async createAttachments(
    documentId: string,
    attachments: Array<{
      fileName: string;
      fileUri: string;
      fileSize: number;
    }>
  ) {
    const data = attachments.map((a) => ({
      attachmentId: uuidv4(),
      documentId,
      fileName: a.fileName,
      fileUri: a.fileUri,
      fileSize: BigInt(a.fileSize),
    }));
    return prisma.documentAttachments.createMany({
      data,
    });
  }

  /**
   * Deletes a document
   */
  public async deleteDocument(documentId: string) {
    return prisma.documents.delete({
      where: { documentId },
    });
  }
}
