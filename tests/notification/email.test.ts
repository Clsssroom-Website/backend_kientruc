import { describe, it, expect, vi, beforeEach } from "vitest";
import nodemailer from "nodemailer";

// Mock nodemailer with self-contained factory
vi.mock("nodemailer", () => {
  const sendMail = vi.fn().mockResolvedValue({ messageId: "123" });
  const createTransport = vi.fn().mockReturnValue({
    sendMail,
  });
  return {
    default: {
      createTransport,
    },
  };
});

import { eventBus } from "../../src/events/eventBus.js";
import { initAssignmentSubscriber } from "../../src/subscribers/assignmentSubscriber.js";
import prisma from "../../src/config/prisma.js";

// Mock prisma client
vi.mock("../../src/config/prisma.js", () => ({
  default: {
    classEnrollments: {
      findMany: vi.fn(),
    },
  },
}));

describe("Assignment Notification Email Subscriber", () => {
  let mockTransporter: any;

  beforeEach(() => {
    vi.clearAllMocks();
    initAssignmentSubscriber();
    mockTransporter = nodemailer.createTransport();
  });

  it("should send email to all enrolled students when assignment is created", async () => {
    // Arrange
    const mockEnrollments = [
      {
        Users: {
          email: "student1@example.com",
          name: "Student One",
        },
      },
      {
        Users: {
          email: "student2@example.com",
          name: "Student Two",
        },
      },
    ];

    vi.mocked(prisma.classEnrollments.findMany).mockResolvedValue(mockEnrollments as any);

    const deadline = new Date("2026-12-31T23:59:59Z");
    
    // Act
    eventBus.emit("assignment.created", {
      assignmentId: "assign-123",
      classId: "class-123",
      title: "React Assignment",
      description: "Build a todo app",
      deadline,
      className: "React 101",
      teacherName: "Teacher Jane",
    });

    // Wait for the asynchronous email task execution
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Assert
    expect(prisma.classEnrollments.findMany).toHaveBeenCalledWith({
      where: {
        classId: "class-123",
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

    expect(mockTransporter.sendMail).toHaveBeenCalledTimes(2);
    expect(mockTransporter.sendMail).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        to: "student1@example.com",
        subject: expect.stringContaining("React 101"),
        html: expect.stringContaining("Student One"),
      })
    );
    expect(mockTransporter.sendMail).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        to: "student2@example.com",
        subject: expect.stringContaining("React Assignment"),
        html: expect.stringContaining("Student Two"),
      })
    );
  });

  it("should not send emails if no students are enrolled in the class", async () => {
    // Arrange
    vi.mocked(prisma.classEnrollments.findMany).mockResolvedValue([]);

    // Act
    eventBus.emit("assignment.created", {
      assignmentId: "assign-123",
      classId: "class-123",
      title: "React Assignment",
      deadline: new Date(),
      className: "React 101",
      teacherName: "Teacher Jane",
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Assert
    expect(mockTransporter.sendMail).not.toHaveBeenCalled();
  });
});
