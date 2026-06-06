import { Request, Response, NextFunction } from "express";
import prisma from "../config/prisma.js";
import { BadRequestError, NotFoundError } from "../errors/index.js";

/**
 * Middleware to check if the target classroom is active.
 * If the classroom is ended, all mutate/write operations are blocked.
 */
export const ensureClassActive = async (req: Request, res: Response, next: NextFunction) => {
  try {
    let classId: string | undefined = undefined;

    // 1. Resolve classId from params or body
    if (req.params.id) {
      classId = req.params.id as string;
    } else if (req.params.classId) {
      classId = req.params.classId as string;
    } else if (req.body && req.body.classId) {
      classId = req.body.classId as string;
    } else if (req.params.assignmentId) {
      const assignment = await prisma.assignments.findUnique({
        where: { assignmentId: req.params.assignmentId as string },
        select: { classId: true },
      });
      if (assignment) {
        classId = assignment.classId;
      }
    } else if (req.params.documentId) {
      const doc = await prisma.documents.findUnique({
        where: { documentId: req.params.documentId as string },
        select: { classId: true },
      });
      if (doc) {
        classId = doc.classId;
      }
    }

    // 2. If no classId is resolved, continue to next middleware/handler
    if (!classId) {
      return next();
    }

    // 3. Bypass check if it is updating the status of the class itself
    // e.g. PUT /api/v1/classes/:id and body has 'status' field.
    if (
      req.method === "PUT" &&
      req.params.id === classId &&
      req.body &&
      req.body.status !== undefined
    ) {
      return next();
    }

    // 4. Query class status
    const classroom = await prisma.classes.findUnique({
      where: { classId },
      select: { status: true },
    });

    if (!classroom) {
      throw new NotFoundError("Không tìm thấy lớp học.");
    }

    if (classroom.status === "ENDED") {
      throw new BadRequestError("Lớp học này đã kết thúc. Mọi hoạt động chỉnh sửa dữ liệu đều bị khóa.");
    }

    next();
  } catch (error) {
    next(error);
  }
};
