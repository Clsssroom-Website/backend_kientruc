import { v4 as uuidv4 } from "uuid";
import * as StudentRepo from "../repositories/student.repo.js";
import * as ClassRepo from "../repositories/class.repo.js";
import { NotFoundError, ForbiddenError, BadRequestError } from "../errors/index.js";
import { MinioStorageService } from "./storage/minioStorage.js";

const storageService = new MinioStorageService("classroom-assignments");
const submissionStorageService = new MinioStorageService("classroom-submissions");

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StudentAnswerInput {
  questionId: string;
  selectedOptionId: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Kiểm tra học sinh có nằm trong lớp học không */
const ensureStudentEnrolled = async (studentId: string, classId: string) => {
  const isEnrolled = await ClassRepo.checkEnrollmentExists(classId, studentId);
  if (!isEnrolled) {
    throw new ForbiddenError("Bạn không có quyền truy cập vì chưa tham gia lớp học này.");
  }
};

/** Sinh presigned URL cho danh sách attachment bài nộp */
const serializeSubmissionAttachments = async (attachments: any[]) => {
  return Promise.all(
    attachments.map(async (att) => {
      let presignedUrl = att.fileUri;
      let downloadUrl = att.fileUri;
      try {
        presignedUrl = await submissionStorageService.getPresignedUrl(att.fileUri, false, att.fileName || "download");
        downloadUrl = await submissionStorageService.getPresignedUrl(att.fileUri, true, att.fileName || "download");
      } catch {
        console.error("Lỗi khi tạo presigned URL cho bài nộp:", att.fileUri);
      }
      return {
        ...att,
        fileSize: att.fileSize ? att.fileSize.toString() : null,
        fileUrl: presignedUrl,
        downloadUrl,
      };
    })
  );
};

// ─── Student Class & Assignment Views ────────────────────────────────────────

/** Xem chi tiết lớp học dành cho học sinh */
export const getClassDetailsForStudent = async (studentId: string, classId: string) => {
  const existingClass = await ClassRepo.findClassById(classId);
  if (!existingClass) throw new NotFoundError("Không tìm thấy lớp học.");
  await ensureStudentEnrolled(studentId, classId);
  const { joinCode, joinLink, ...classData } = existingClass;
  return classData;
};

/** Lấy danh sách bài tập của 1 lớp học (học sinh) */
export const getAssignmentsForStudent = async (studentId: string, classId: string) => {
  const existingClass = await ClassRepo.findClassById(classId);
  if (!existingClass) throw new NotFoundError("Không tìm thấy lớp học.");
  await ensureStudentEnrolled(studentId, classId);

  const assignments = await StudentRepo.findAssignmentsByClassId(classId);

  return Promise.all(
    assignments.map(async (assignment: any) => {
      let processedAttachments = [];
      if (assignment.AssignmentAttachments?.length > 0) {
        processedAttachments = await Promise.all(
          assignment.AssignmentAttachments.map(async (att: any) => {
            let presignedUrl = att.fileUrl;
            let downloadUrl = att.fileUrl;
            try {
              presignedUrl = await storageService.getPresignedUrl(att.fileUrl, false, att.fileName || "download");
              downloadUrl = await storageService.getPresignedUrl(att.fileUrl, true, att.fileName || "download");
            } catch {
              console.warn("Could not generate presigned URL for", att.fileUrl);
            }
            return {
              ...att,
              fileSize: att.fileSize != null ? att.fileSize.toString() : null,
              fileUrl: presignedUrl,
              downloadUrl,
            };
          })
        );
      }
      return {
        ...assignment,
        AssignmentAttachments: processedAttachments,
      };
    })
  );
};

/** Lấy chi tiết bài tập (học sinh) — câu hỏi không có isCorrect */
export const getAssignmentForStudent = async (studentId: string, assignmentId: string) => {
  const assignment = await StudentRepo.findAssignmentById(assignmentId);
  if (!assignment) throw new NotFoundError("Không tìm thấy bài tập.");
  await ensureStudentEnrolled(studentId, (assignment as any).Classes.classId);

  // Sinh presigned URL cho attachments
  let processedAttachments = [];
  if ((assignment.AssignmentAttachments as any[])?.length > 0) {
    processedAttachments = await Promise.all(
      (assignment.AssignmentAttachments as any[]).map(async (att) => {
        let presignedUrl = att.fileUrl;
        let downloadUrl = att.fileUrl;
        try {
          presignedUrl = await storageService.getPresignedUrl(att.fileUrl, false, att.fileName || "download");
          downloadUrl = await storageService.getPresignedUrl(att.fileUrl, true, att.fileName || "download");
        } catch {
          console.warn("Could not generate presigned URL for", att.fileUrl);
        }
        return { ...att, fileSize: att.fileSize != null ? att.fileSize.toString() : null, fileUrl: presignedUrl, downloadUrl };
      })
    );
  }

  return {
    ...assignment,
    AssignmentAttachments: processedAttachments,
  };
};

// ─── Quiz Submission ──────────────────────────────────────────────────────────

/**
 * Học sinh nộp bài tập ESSAY (có thể kèm file).
 */
export const submitEssayAssignment = async (
  studentId: string,
  assignmentId: string,
  files: { fileName: string; fileUri: string; fileSize: number }[]
) => {
  const assignment = await StudentRepo.findAssignmentById(assignmentId);
  if (!assignment) throw new NotFoundError("Không tìm thấy bài tập.");
  await ensureStudentEnrolled(studentId, (assignment as any).Classes.classId);

  if ((assignment as any).typeAssignment !== "ESSAY") {
    throw new BadRequestError("Hãy dùng API nộp trắc nghiệm cho bài kiểm tra này.");
  }

  const now = new Date();
  if (assignment.deadline && now > new Date(assignment.deadline)) {
    throw new BadRequestError("Đã quá hạn nộp bài.");
  }

  const existingSubmission = await StudentRepo.findSubmissionByStudentAndAssignment(studentId, assignmentId);
  if (existingSubmission) {
    throw new BadRequestError("Bạn đã nộp bài tập này rồi.");
  }

  if (files.length === 0) {
    throw new BadRequestError("Vui lòng đính kèm ít nhất 1 file cho bài tập tự luận.");
  }

  const submissionId = uuidv4();
  const attachments = files.map((file) => ({
    attachmentId: uuidv4(),
    ...file,
  }));

  const newSubmission = await StudentRepo.createSubmission(
    { submissionId, assignmentId, studentId, status: "SUBMITTED" },
    attachments,
    [],
    null
  );

  if (!newSubmission) throw new BadRequestError("Không thể tạo bài nộp.");

  const attachmentsWithUrls = await serializeSubmissionAttachments(newSubmission.SubmissionAttachments);

  return { ...newSubmission, SubmissionAttachments: attachmentsWithUrls };
};

/**
 * Học sinh nộp bài trắc nghiệm.
 * Chấm điểm tự động bằng cách tra cứu QuizOptions.isCorrect trong DB.
 */
export const submitQuizAssignment = async (
  studentId: string,
  assignmentId: string,
  answers: StudentAnswerInput[]
) => {
  // 1. Kiểm tra bài tập
  const assignment = await StudentRepo.findAssignmentById(assignmentId);
  if (!assignment) throw new NotFoundError("Không tìm thấy bài tập.");

  const classId = (assignment as any).Classes.classId;
  await ensureStudentEnrolled(studentId, classId);

  if ((assignment as any).typeAssignment !== "MULTIPLE_CHOICE") {
    throw new BadRequestError("Bài tập này không phải dạng trắc nghiệm.");
  }

  // 2. Kiểm tra deadline
  const now = new Date();
  if (assignment.deadline && now > new Date(assignment.deadline)) {
    throw new BadRequestError("Đã quá hạn nộp bài.");
  }

  // 3. Kiểm tra đã nộp chưa
  const existingSubmission = await StudentRepo.findSubmissionByStudentAndAssignment(studentId, assignmentId);
  if (existingSubmission) {
    throw new BadRequestError("Bạn đã nộp bài tập này rồi.");
  }

  // 4. Lấy câu hỏi + đáp án đúng để chấm điểm (internal only)
  const questions = await StudentRepo.findQuizQuestionsWithAnswers(assignmentId);
  if (questions.length === 0) {
    throw new BadRequestError("Bài tập trắc nghiệm này chưa có câu hỏi.");
  }

  // 5. Validate answers — mỗi questionId phải nằm trong bài tập
  const validQuestionIds = new Set(questions.map((q) => q.questionId));
  for (const ans of answers) {
    if (!validQuestionIds.has(ans.questionId)) {
      throw new BadRequestError(`questionId "${ans.questionId}" không thuộc bài tập này.`);
    }
  }

  // 6. Chấm điểm
  let totalPoints = 0;
  let earnedPoints = 0;

  for (const q of questions) {
    const questionPoints = q.points || 0;
    totalPoints += questionPoints;
    const studentAnswer = answers.find((a) => a.questionId === q.questionId);
    if (studentAnswer) {
      const correctOption = q.QuizOptions.find(
        (o) => o.optionId === studentAnswer.selectedOptionId && o.isCorrect
      );
      if (correctOption) {
        earnedPoints += questionPoints;
      }
    }
  }

  const calculatedScore =
    totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 10 * 100) / 100 : 0;

  const correctCount = answers.filter((ans) => {
    const q = questions.find((q) => q.questionId === ans.questionId);
    return q?.QuizOptions.find((o) => o.optionId === ans.selectedOptionId && o.isCorrect);
  }).length;

  // 7. Tạo Submission + StudentQuizAnswers + Grade (trong 1 transaction)
  const submissionId = uuidv4();
  const gradeData = {
    gradeId: uuidv4(),
    score: calculatedScore,
    comment: `Hệ thống chấm tự động: Đúng ${correctCount}/${questions.length} câu. Điểm: ${calculatedScore}/10.`,
    classId,
  };

  const newSubmission = await StudentRepo.createSubmission(
    { submissionId, assignmentId, studentId, status: "COMPLETED" },
    [],
    answers,
    gradeData
  );

  if (!newSubmission) throw new BadRequestError("Không thể tạo bài nộp.");

  // 8. Chuẩn bị kết quả trả về (bao gồm thông tin đúng/sai)
  const answersWithResult = (newSubmission.StudentQuizAnswers ?? []).map((ans: any) => {
    const q = questions.find((q) => q.questionId === ans.questionId);
    const selectedOption = q?.QuizOptions.find((o) => o.optionId === ans.selectedOptionId);
    const correctOption = q?.QuizOptions.find((o) => o.isCorrect);

    return {
      questionId: ans.questionId,
      questionText: ans.QuizQuestions?.questionText,
      selectedOptionId: ans.selectedOptionId,
      selectedOptionText: selectedOption?.optionText ?? ans.QuizOptions?.optionText,
      correctOptionId: correctOption?.optionId,
      isCorrect: selectedOption?.optionId === correctOption?.optionId,
    };
  });

  return {
    submissionId: newSubmission.submissionId,
    assignmentId: newSubmission.assignmentId,
    studentId: newSubmission.studentId,
    status: newSubmission.status,
    submittedAt: newSubmission.submittedAt,
    score: calculatedScore,
    comment: gradeData.comment,
    totalQuestions: questions.length,
    correctAnswers: correctCount,
    answers: answersWithResult,
  };
};

/**
 * Hàm nộp bài tập chung phục vụ cho kiểm thử và tính tương thích.
 */
export const submitAssignment = async (
  studentId: string,
  assignmentId: string,
  files: { fileName: string; fileUri: string; fileSize: number }[],
  quizAnswers?: any[]
) => {
  const assignment = await StudentRepo.findAssignmentById(assignmentId);
  if (!assignment) throw new NotFoundError("Không tìm thấy bài tập.");

  const type = (assignment as any).typeAssignment;

  if (type === "MULTIPLE_CHOICE") {
    if (!quizAnswers) {
      throw new BadRequestError("Bài tập trắc nghiệm này chưa có câu hỏi.");
    }
    const answers = quizAnswers.map((ans) => ({
      questionId: ans.questionId,
      selectedOptionId: ans.selectedAnswer || ans.selectedOptionId,
    }));
    return submitQuizAssignment(studentId, assignmentId, answers);
  } else {
    const classId = (assignment as any).Classes.classId;
    await ensureStudentEnrolled(studentId, classId);

    const now = new Date();
    if (assignment.deadline && now > new Date(assignment.deadline)) {
      throw new BadRequestError("Đã quá hạn nộp bài.");
    }

    const existingSubmission = await StudentRepo.findSubmissionByStudentAndAssignment(studentId, assignmentId);
    if (existingSubmission) {
      throw new BadRequestError("Bạn đã nộp bài tập này rồi.");
    }

    const submissionId = uuidv4();
    const attachments = files.map((file) => ({
      attachmentId: uuidv4(),
      ...file,
    }));

    const newSubmission = await StudentRepo.createSubmission(
      { submissionId, assignmentId, studentId, status: "SUBMITTED" },
      attachments,
      [],
      null
    );

    if (!newSubmission) throw new BadRequestError("Không thể tạo bài nộp.");

    const attachmentsWithUrls = await serializeSubmissionAttachments(newSubmission.SubmissionAttachments);

    return { ...newSubmission, SubmissionAttachments: attachmentsWithUrls };
  }
};

// ─── Submission & Grade View ──────────────────────────────────────────────────

/** Lấy thông tin bài nộp và điểm của học sinh */
export const getSubmissionAndGrade = async (studentId: string, assignmentId: string) => {
  const assignment = await StudentRepo.findAssignmentById(assignmentId);
  if (!assignment) throw new NotFoundError("Không tìm thấy bài tập.");
  await ensureStudentEnrolled(studentId, (assignment as any).Classes.classId);

  const submission = await StudentRepo.findSubmissionByStudentAndAssignment(studentId, assignmentId);
  if (!submission) return null;

  const attachmentsWithUrls = await serializeSubmissionAttachments(submission.SubmissionAttachments);
  const firstGrade = submission.Grades?.length > 0 ? submission.Grades[0] : null;

  // Định dạng câu trả lời trắc nghiệm
  const questions = await StudentRepo.findQuizQuestionsWithAnswers(assignmentId);
  const quizAnswers = (submission.StudentQuizAnswers ?? []).map((ans: any) => {
    const q = questions.find((item) => item.questionId === ans.questionId);
    const selectedOption = q?.QuizOptions.find((o) => o.optionId === ans.selectedOptionId);
    const correctOption = q?.QuizOptions.find((o) => o.isCorrect);

    return {
      questionId: ans.questionId,
      questionText: ans.QuizQuestions?.questionText,
      selectedOptionId: ans.selectedOptionId,
      selectedOptionText: selectedOption?.optionText ?? ans.QuizOptions?.optionText,
      correctOptionId: correctOption?.optionId,
      isCorrect: selectedOption?.optionId === correctOption?.optionId,
      points: ans.QuizQuestions?.points,
    };
  });

  return {
    submissionId: submission.submissionId,
    assignmentId: submission.assignmentId,
    studentId: submission.studentId,
    status: submission.status,
    submittedAt: submission.submittedAt,
    SubmissionAttachments: attachmentsWithUrls,
    quizAnswers,
    grade: firstGrade
      ? {
          gradeId: firstGrade.gradeId,
          score: firstGrade.score,
          comment: firstGrade.comment,
          gradedAt: firstGrade.gradedAt,
        }
      : null,
  };
};

// ─── Student Dashboard ────────────────────────────────────────────────────────

export const getStudentDashboard = async (studentId: string) => {
  const [
    totalClasses,
    totalAssignments,
    submittedCount,
    rawClasses,
    rawRecentGrades,
    rawUpcoming,
    rawActivities,
  ] = await Promise.all([
    StudentRepo.countEnrolledClasses(studentId),
    StudentRepo.countAssignmentsForStudent(studentId),
    StudentRepo.countSubmissionsByStudent(studentId),
    StudentRepo.findEnrolledClassSummaries(studentId, 5),
    StudentRepo.findRecentGradesByStudent(studentId, 10),
    StudentRepo.findUpcomingAssignmentsForStudent(studentId, 10),
    StudentRepo.findRecentActivitiesByStudent(studentId, 10),
  ]);

  const stats = {
    totalClasses,
    totalAssignments,
    submittedCount,
    pendingAssignments: Math.max(0, totalAssignments - submittedCount),
  };

  const classes = rawClasses.map((item) => ({
    classId: item.Classes.classId,
    className: item.Classes.className,
    teacherName: item.Classes.Users.name,
    studentCount: item.Classes._count.ClassEnrollments,
    assignmentCount: item.Classes._count.Assignments,
    createdAt: item.Classes.createdAt,
  }));

  const recentGrades = rawRecentGrades.map((g) => ({
    submissionId: g.submissionId,
    assignmentId: g.Assignments.assignmentId,
    assignmentTitle: g.Assignments.title,
    classId: g.Assignments.Classes.classId,
    className: g.Assignments.Classes.className,
    score: g.Grades[0]?.score ?? null,
    comment: g.Grades[0]?.comment ?? null,
    gradedAt: g.Grades[0]?.gradedAt ?? null,
  }));

  const URGENT_THRESHOLD_DAYS = 2;
  const upcomingAssignments = rawUpcoming.map((a) => {
    const diffMs = new Date(a.deadline).getTime() - Date.now();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    return {
      assignmentId: a.assignmentId,
      title: a.title,
      classId: a.Classes.classId,
      className: a.Classes.className,
      deadline: a.deadline,
      typeAssignment: a.typeAssignment,
      urgency: diffDays < URGENT_THRESHOLD_DAYS ? "urgent" : "upcoming",
    };
  });

  const recentActivities = rawActivities.map((act) => ({
    submissionId: act.submissionId,
    assignmentTitle: act.Assignments.title,
    className: act.Assignments.Classes.className,
    submittedAt: act.submittedAt,
    status: act.status,
    score: act.Grades[0]?.score ?? null,
    gradedAt: act.Grades[0]?.gradedAt ?? null,
  }));

  return { stats, classes, recentGrades, upcomingAssignments, recentActivities };
};

// ─── Grade View (per class) ───────────────────────────────────────────────────

export const getGradesForStudent = async (studentId: string, classId: string) => {
  const existingClass = await ClassRepo.findClassById(classId);
  if (!existingClass) throw new NotFoundError("Không tìm thấy lớp học.");
  await ensureStudentEnrolled(studentId, classId);
  return StudentRepo.findGradesByStudentAndClass(studentId, classId);
};
