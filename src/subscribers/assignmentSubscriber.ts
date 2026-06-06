import { eventBus } from "../events/eventBus.js";
import { NodemailerEmailProvider } from "../services/email/nodemailerProvider.js";
import prisma from "../config/prisma.js";
import { logger } from "../utils/logger.js";

const emailProvider = new NodemailerEmailProvider();

export const initAssignmentSubscriber = () => {
  eventBus.on("assignment.created", async (payload) => {
    try {
      logger.info(`Processing assignment.created notification for assignment: ${payload.title}`);

      // Query students enrolled in the class
      const enrollments = await prisma.classEnrollments.findMany({
        where: {
          classId: payload.classId,
          status: "JOINED",
        },
        include: {
          Users: {
            select: {
              email: true,
              name: true,
            },
          },
        },
      });

      if (enrollments.length === 0) {
        logger.info(`No students enrolled in class ${payload.className}. No emails sent.`);
        return;
      }

      const formattedDeadline = new Date(payload.deadline).toLocaleDateString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      const emailSubject = `[Bài tập mới] Lớp ${payload.className}: ${payload.title}`;

      // Create notification tasks for all enrolled students
      const emailTasks = enrollments.map(async (enrollment) => {
        const student = enrollment.Users;
        if (!student.email) return;

        const emailHtml = `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
            <div style="background-color: #4f46e5; color: #ffffff; padding: 20px; text-align: center;">
              <h1 style="margin: 0; font-size: 24px;">Thông báo bài tập mới</h1>
            </div>
            <div style="padding: 20px;">
              <p>Chào <strong>${student.name}</strong>,</p>
              <p>Giáo viên <strong>${payload.teacherName}</strong> vừa giao một bài tập mới trong lớp học <strong>${payload.className}</strong>.</p>
              
              <div style="background-color: #f3f4f6; border-left: 4px solid #4f46e5; padding: 15px; margin: 20px 0; border-radius: 4px;">
                <p style="margin: 0 0 8px 0;"><strong>Tiêu đề:</strong> ${payload.title}</p>
                <p style="margin: 0 0 8px 0;"><strong>Hạn nộp:</strong> <span style="color: #ef4444; font-weight: bold;">${formattedDeadline}</span></p>
                ${payload.description ? `<p style="margin: 0;"><strong>Mô tả:</strong> ${payload.description}</p>` : ""}
              </div>
              
              <p style="margin-top: 20px;">Vui lòng truy cập hệ thống để làm bài tập đúng hạn.</p>
            </div>
            <div style="background-color: #f9fafb; padding: 15px; text-align: center; font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0;">Đây là email tự động từ hệ thống quản lý lớp học. Vui lòng không trả lời email này.</p>
            </div>
          </div>
        `;

        await emailProvider.sendEmail({
          to: student.email,
          subject: emailSubject,
          html: emailHtml,
        });
      });

      // Dispatch asynchronously to avoid blocking the main execution path
      Promise.allSettled(emailTasks).then((results) => {
        const succeeded = results.filter((r) => r.status === "fulfilled").length;
        const failed = results.filter((r) => r.status === "rejected").length;
        logger.info(`Email broadcast for assignment "${payload.title}" complete. Succeeded: ${succeeded}, Failed: ${failed}`);
      });
    } catch (error) {
      logger.error(`Error in assignment.created subscriber:`, error);
    }
  });
};
