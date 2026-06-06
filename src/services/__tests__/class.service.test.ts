import { describe, it, expect, vi, beforeEach } from "vitest";
import * as ClassService from "../class.service.js";
import * as ClassRepo from "../../repositories/class.repo.js";
import { NotFoundError, ForbiddenError, BadRequestError } from "../../errors/index.js";

// Mock toàn bộ class repository để không cần kết nối DB thật
vi.mock("../../repositories/class.repo.js");

// Mock uuid để classId và enrollmentId luôn cố định → kết quả test ổn định
vi.mock("uuid", () => ({
  v4: vi.fn().mockReturnValue("mock-uuid-9999"),
}));

// Mock MinioStorageService dùng class (vì class.service.ts gọi new MinioStorageService(...))
// Không thể dùng vi.fn().mockImplementation() vì cần constructor thật sự
vi.mock("../storage/minioStorage.js", () => ({
  MinioStorageService: class {
    getPresignedUrl = vi.fn().mockResolvedValue("https://minio.example.com/presigned");
  },
}));

// ─── Shared helpers ───────────────────────────────────────────────────────────

const mockClass = {
  classId: "class-1",
  teacherId: "teacher-1",
  className: "Math 101",
  description: "Intro to Math",
  room: "Room 101",
  topic: "Math",
  joinCode: "MATH10",
  joinLink: null,
  status: "ACTIVE",
  createdAt: new Date(),
};

const pastDeadline = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 ngày trước
const futureDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 ngày sau

const mockAssignments = [
  {
    assignmentId: "assign-1",
    title: "Homework 1",
    deadline: pastDeadline, // Đã quá hạn
    typeAssignment: "homework",
  },
  {
    assignmentId: "assign-2",
    title: "Homework 2",
    deadline: pastDeadline, // Đã quá hạn
    typeAssignment: "homework",
  },
  {
    assignmentId: "assign-3",
    title: "Final Exam",
    deadline: futureDeadline, // Chưa tới hạn
    typeAssignment: "exam",
  },
];

const mockEnrollments = [
  {
    enrollmentId: "enroll-1",
    classId: "class-1",
    studentId: "student-1",
    joinTime: new Date(),
    status: "JOINED",
    Users: { userId: "student-1", name: "Alice Student", email: "alice@student.com" },
  },
  {
    enrollmentId: "enroll-2",
    classId: "class-1",
    studentId: "student-2",
    joinTime: new Date(),
    status: "JOINED",
    Users: { userId: "student-2", name: "Bob Student", email: "bob@student.com" },
  },
];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("ClassService - getClassGrades", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should throw NotFoundError if class does not exist", async () => {
    vi.mocked(ClassRepo.findClassById).mockResolvedValue(null);

    await expect(ClassService.getClassGrades("teacher-1", "non-existent-class"))
      .rejects.toThrow(NotFoundError);
  });

  it("should throw ForbiddenError if request is not made by the class teacher", async () => {
    vi.mocked(ClassRepo.findClassById).mockResolvedValue(mockClass);

    await expect(ClassService.getClassGrades("teacher-2", "class-1"))
      .rejects.toThrow(ForbiddenError);
  });

  it("should calculate student grades and average score correctly (with submissions)", async () => {
    const mockGrades = [
      // Alice: có điểm assign-1 và assign-2
      {
        gradeId: "grade-1",
        studentId: "student-1",
        assignmentId: "assign-1",
        score: 8.5,
        comment: "Well done",
        gradedAt: new Date(),
      },
      {
        gradeId: "grade-2",
        studentId: "student-1",
        assignmentId: "assign-2",
        score: 9.5,
        comment: "Excellent",
        gradedAt: new Date(),
      },
      // Bob: chỉ có điểm assign-1
      {
        gradeId: "grade-3",
        studentId: "student-2",
        assignmentId: "assign-1",
        score: 7.0,
        comment: "Satisfactory",
        gradedAt: new Date(),
      },
    ];

    // Bob đã nộp assign-2 nhưng chưa được chấm (pending)
    const mockSubmissions = [
      { submissionId: "sub-1", studentId: "student-2", assignmentId: "assign-2" },
    ];

    vi.mocked(ClassRepo.findClassById).mockResolvedValue(mockClass);
    vi.mocked(ClassRepo.findClassGradebookData).mockResolvedValue({
      assignments: mockAssignments,
      enrollments: mockEnrollments,
      grades: mockGrades,
      submissions: mockSubmissions,
    });

    const result = await ClassService.getClassGrades("teacher-1", "class-1");

    expect(result.assignments).toEqual(mockAssignments);
    expect(result.students).toHaveLength(2);

    // ── Alice ──
    const alice = result.students.find((s) => s.studentId === "student-1")!;
    expect(alice.name).toBe("Alice Student");
    // assign-1: graded
    expect(alice.grades[0]).toMatchObject({ score: 8.5, status: "graded" });
    // assign-2: graded
    expect(alice.grades[1]).toMatchObject({ score: 9.5, status: "graded" });
    // assign-3: chưa tới hạn, Alice chưa nộp → not_started
    expect(alice.grades[2]).toMatchObject({ score: null, status: "not_started" });
    // Average: (8.5 + 9.5) / 2 = 9.0
    expect(alice.averageScore).toBe(9.0);

    // ── Bob ──
    const bob = result.students.find((s) => s.studentId === "student-2")!;
    expect(bob.name).toBe("Bob Student");
    // assign-1: graded
    expect(bob.grades[0]).toMatchObject({ score: 7.0, status: "graded" });
    // assign-2: đã nộp nhưng giáo viên chưa chấm → pending (không phải absent)
    expect(bob.grades[1]).toMatchObject({ score: null, status: "pending" });
    // assign-3: chưa tới hạn → not_started
    expect(bob.grades[2]).toMatchObject({ score: null, status: "not_started" });
    // Average: chỉ tính điểm 7.0 (pending và not_started bị bỏ qua)
    expect(bob.averageScore).toBe(7.0);
  });

  it("should auto-assign score=0 when deadline passed and student has NO submission and NO grade", async () => {
    const mockGrades: any[] = []; // Không có điểm nào
    const mockSubmissions: any[] = []; // Không có bài nộp nào

    vi.mocked(ClassRepo.findClassById).mockResolvedValue(mockClass);
    vi.mocked(ClassRepo.findClassGradebookData).mockResolvedValue({
      assignments: mockAssignments,
      enrollments: [mockEnrollments[0]], // Chỉ test Alice
      grades: mockGrades,
      submissions: mockSubmissions,
    });

    const result = await ClassService.getClassGrades("teacher-1", "class-1");
    const alice = result.students[0];

    // assign-1: đã quá hạn, không nộp, không có điểm → absent, score = 0
    expect(alice.grades[0]).toMatchObject({
      score: 0,
      comment: "Không nộp bài",
      status: "absent",
    });
    // assign-2: đã quá hạn, không nộp, không có điểm → absent, score = 0
    expect(alice.grades[1]).toMatchObject({
      score: 0,
      comment: "Không nộp bài",
      status: "absent",
    });
    // assign-3: chưa tới hạn → not_started, score = null
    expect(alice.grades[2]).toMatchObject({
      score: null,
      status: "not_started",
    });

    // Average: (0 + 0) / 2 = 0.0 (bao gồm cả điểm absent)
    expect(alice.averageScore).toBe(0.0);
  });

  it("should NOT auto-assign 0 if student submitted but teacher has not graded yet", async () => {
    const mockGrades: any[] = [];
    // Alice đã nộp assign-1 (đã quá hạn) nhưng giáo viên chưa chấm
    const mockSubmissions = [
      { submissionId: "sub-1", studentId: "student-1", assignmentId: "assign-1" },
    ];

    vi.mocked(ClassRepo.findClassById).mockResolvedValue(mockClass);
    vi.mocked(ClassRepo.findClassGradebookData).mockResolvedValue({
      assignments: mockAssignments,
      enrollments: [mockEnrollments[0]],
      grades: mockGrades,
      submissions: mockSubmissions,
    });

    const result = await ClassService.getClassGrades("teacher-1", "class-1");
    const alice = result.students[0];

    // assign-1: đã nộp nhưng chưa chấm → pending, KHÔNG phải 0
    expect(alice.grades[0]).toMatchObject({
      score: null,
      status: "pending",
    });
    // assign-2: quá hạn, không nộp → absent, score = 0
    expect(alice.grades[1]).toMatchObject({
      score: 0,
      status: "absent",
    });
    // Average: chỉ 0 của assign-2 được tính (pending bỏ qua)
    expect(alice.averageScore).toBe(0.0);
  });

  it("should return null for averageScore if student has no graded or absent assignments", async () => {
    const singleFutureAssignment = [
      {
        assignmentId: "assign-future",
        title: "Future HW",
        deadline: futureDeadline,
        typeAssignment: "homework",
      },
    ];

    vi.mocked(ClassRepo.findClassById).mockResolvedValue(mockClass);
    vi.mocked(ClassRepo.findClassGradebookData).mockResolvedValue({
      assignments: singleFutureAssignment,
      enrollments: [mockEnrollments[0]],
      grades: [],
      submissions: [],
    });

    const result = await ClassService.getClassGrades("teacher-1", "class-1");
    expect(result.students[0].averageScore).toBeNull();
    expect(result.students[0].grades[0]).toMatchObject({ score: null, status: "not_started" });
  });
});

// ─── 2. getAllClassesByTeacherId ──────────────────────────────────────────────

describe("ClassService - getAllClassesByTeacherId", () => {
  beforeEach(() => vi.clearAllMocks());

  it("should map _count.ClassEnrollments thành totalStudents và xóa _count", async () => {
    // Giả lập: DB trả về 2 lớp, mỗi lớp có _count chứa số học sinh
    const rawClasses = [
      { ...{ classId: "class-1", teacherId: "teacher-1", className: "Math 101", createdAt: new Date() }, _count: { ClassEnrollments: 25 } },
      { ...{ classId: "class-2", teacherId: "teacher-1", className: "Physics", createdAt: new Date() }, _count: { ClassEnrollments: 10 } },
    ];
    vi.mocked(ClassRepo.findAllClassesByTeacherId).mockResolvedValue(rawClasses as any);

    const result = await ClassService.getAllClassesByTeacherId("teacher-1");

    // Phải có 2 lớp học
    expect(result).toHaveLength(2);
    // totalStudents phải được map từ _count.ClassEnrollments
    expect(result[0].totalStudents).toBe(25);
    expect(result[1].totalStudents).toBe(10);
    // _count phải bị xóa để không lộ ra ngoài client
    expect(result[0]._count).toBeUndefined();
  });

  it("should return empty array when teacher has no classes", async () => {
    // Giả lập: giáo viên chưa tạo lớp nào
    vi.mocked(ClassRepo.findAllClassesByTeacherId).mockResolvedValue([]);

    const result = await ClassService.getAllClassesByTeacherId("teacher-1");

    expect(result).toEqual([]);
  });

  it("should pass searchQuery to repository", async () => {
    // Giả lập: khi tìm kiếm, repository không trả về kết quả
    vi.mocked(ClassRepo.findAllClassesByTeacherId).mockResolvedValue([]);

    await ClassService.getAllClassesByTeacherId("teacher-1", "Math");

    // Repository phải nhận được đúng tham số tìm kiếm
    expect(ClassRepo.findAllClassesByTeacherId).toHaveBeenCalledWith("teacher-1", "Math");
  });

  it("should default totalStudents to 0 when _count is null", async () => {
    // Giả lập: _count bị null (trường hợp edge case từ DB)
    const rawClasses = [{ classId: "class-1", teacherId: "teacher-1", className: "Math", createdAt: new Date(), _count: null }];
    vi.mocked(ClassRepo.findAllClassesByTeacherId).mockResolvedValue(rawClasses as any);

    const result = await ClassService.getAllClassesByTeacherId("teacher-1");

    // Khi _count null → totalStudents mặc định là 0
    expect(result[0].totalStudents).toBe(0);
  });
});

// ─── 3. createClass ───────────────────────────────────────────────────────────

describe("ClassService - createClass", () => {
  beforeEach(() => vi.clearAllMocks());

  const newClassData = { className: "Math 101", description: "Intro to Math", room: "Room 101", topic: "Math" };

  it("should create a class with generated classId, joinCode and status ACTIVE", async () => {
    // Giả lập: joinCode chưa bị trùng
    vi.mocked(ClassRepo.findClassByJoinCode).mockResolvedValue(null);
    vi.mocked(ClassRepo.createClass).mockResolvedValue({ classId: "mock-uuid-9999", ...newClassData } as any);

    await ClassService.createClass("teacher-1", newClassData);

    // createClass phải được gọi với classId từ uuid, teacherId, và status ACTIVE
    expect(ClassRepo.createClass).toHaveBeenCalledWith(
      expect.objectContaining({
        classId: "mock-uuid-9999",
        teacherId: "teacher-1",
        className: "Math 101",
        status: "ACTIVE",
      })
    );
  });

  it("should retry joinCode if first code is already taken", async () => {
    // Giả lập: lần đầu joinCode bị trùng, lần hai thì không
    vi.mocked(ClassRepo.findClassByJoinCode)
      .mockResolvedValueOnce({ classId: "other" } as any) // Lần 1: trùng
      .mockResolvedValueOnce(null);                        // Lần 2: ok
    vi.mocked(ClassRepo.createClass).mockResolvedValue({} as any);

    await ClassService.createClass("teacher-1", { className: "X" });

    // findClassByJoinCode phải được gọi 2 lần (1 lần trùng + 1 lần thành công)
    expect(ClassRepo.findClassByJoinCode).toHaveBeenCalledTimes(2);
  });

  it("should use empty string for optional fields when not provided", async () => {
    // Giả lập: chỉ cung cấp tên lớp, không có description/room/topic
    vi.mocked(ClassRepo.findClassByJoinCode).mockResolvedValue(null);
    vi.mocked(ClassRepo.createClass).mockResolvedValue({} as any);

    await ClassService.createClass("teacher-1", { className: "Only Name" });

    // Các trường tùy chọn phải được gán chuỗi rỗng thay vì undefined
    expect(ClassRepo.createClass).toHaveBeenCalledWith(
      expect.objectContaining({ description: "", room: "", topic: "" })
    );
  });
});

// ─── 4. getClassById ──────────────────────────────────────────────────────────

describe("ClassService - getClassById", () => {
  beforeEach(() => vi.clearAllMocks());

  it("should return class data when classId is valid", async () => {
    // Giả lập: lớp học tồn tại trong DB
    vi.mocked(ClassRepo.findClassById).mockResolvedValue({ classId: "class-1", className: "Math 101" } as any);

    const result = await ClassService.getClassById("class-1");

    // Phải trả về đúng dữ liệu lớp học
    expect(result.classId).toBe("class-1");
    expect(ClassRepo.findClassById).toHaveBeenCalledWith("class-1");
  });

  it("should throw NotFoundError when classId does not exist", async () => {
    // Giả lập: không tìm thấy lớp học
    vi.mocked(ClassRepo.findClassById).mockResolvedValue(null);

    // Mong đợi lỗi NotFoundError
    await expect(ClassService.getClassById("bad-id")).rejects.toThrow(NotFoundError);
  });
});

// ─── 5. updateClass ───────────────────────────────────────────────────────────

describe("ClassService - updateClass", () => {
  beforeEach(() => vi.clearAllMocks());

  it("should update class successfully when teacher owns the class", async () => {
    // Giả lập: lớp tồn tại và thuộc về teacher-1
    const updatedClass = { classId: "class-1", teacherId: "teacher-1", className: "Advanced Math" };
    vi.mocked(ClassRepo.findClassById).mockResolvedValue({ classId: "class-1", teacherId: "teacher-1" } as any);
    vi.mocked(ClassRepo.updateClass).mockResolvedValue(updatedClass as any);

    const result = await ClassService.updateClass("teacher-1", "class-1", { className: "Advanced Math" });

    // Phải gọi updateClass với đúng classId và data
    expect(ClassRepo.updateClass).toHaveBeenCalledWith("class-1", { className: "Advanced Math" });
    expect(result.className).toBe("Advanced Math");
  });

  it("should throw NotFoundError when class does not exist", async () => {
    // Giả lập: lớp không tồn tại trong DB
    vi.mocked(ClassRepo.findClassById).mockResolvedValue(null);

    await expect(ClassService.updateClass("teacher-1", "bad-class", { className: "X" }))
      .rejects.toThrow(NotFoundError);
  });

  it("should throw ForbiddenError when a different teacher tries to update", async () => {
    // Giả lập: lớp thuộc về teacher-1, nhưng teacher-2 đang cố sửa
    vi.mocked(ClassRepo.findClassById).mockResolvedValue({ classId: "class-1", teacherId: "teacher-1" } as any);

    await expect(ClassService.updateClass("teacher-2", "class-1", { className: "X" }))
      .rejects.toThrow(ForbiddenError);

    // updateClass KHÔNG được gọi khi không có quyền
    expect(ClassRepo.updateClass).not.toHaveBeenCalled();
  });
});

// ─── 6. deleteClass ───────────────────────────────────────────────────────────

describe("ClassService - deleteClass", () => {
  beforeEach(() => vi.clearAllMocks());

  it("should delete class successfully when teacher owns it", async () => {
    // Giả lập: lớp tồn tại và thuộc về teacher-1
    vi.mocked(ClassRepo.findClassById).mockResolvedValue({ classId: "class-1", teacherId: "teacher-1" } as any);
    vi.mocked(ClassRepo.deleteClass).mockResolvedValue({} as any);

    await ClassService.deleteClass("teacher-1", "class-1");

    // deleteClass phải được gọi với đúng classId
    expect(ClassRepo.deleteClass).toHaveBeenCalledWith("class-1");
  });

  it("should throw NotFoundError when class to delete does not exist", async () => {
    // Giả lập: lớp không tồn tại
    vi.mocked(ClassRepo.findClassById).mockResolvedValue(null);

    await expect(ClassService.deleteClass("teacher-1", "bad-class")).rejects.toThrow(NotFoundError);
  });

  it("should throw ForbiddenError when teacher does not own the class", async () => {
    // Giả lập: lớp thuộc teacher-1, nhưng teacher-2 đang cố xóa
    vi.mocked(ClassRepo.findClassById).mockResolvedValue({ classId: "class-1", teacherId: "teacher-1" } as any);

    await expect(ClassService.deleteClass("teacher-2", "class-1")).rejects.toThrow(ForbiddenError);

    // deleteClass KHÔNG được gọi khi không có quyền
    expect(ClassRepo.deleteClass).not.toHaveBeenCalled();
  });
});

// ─── 7. joinClass ─────────────────────────────────────────────────────────────

describe("ClassService - joinClass", () => {
  beforeEach(() => vi.clearAllMocks());

  it("should allow student to join class with a valid join code", async () => {
    // Giả lập: tìm thấy lớp và học sinh chưa tham gia
    vi.mocked(ClassRepo.findClassByJoinCode).mockResolvedValue({ classId: "class-1", teacherId: "teacher-1" } as any);
    vi.mocked(ClassRepo.checkEnrollmentExists).mockResolvedValue(null);
    vi.mocked(ClassRepo.createEnrollment).mockResolvedValue({} as any);

    const result = await ClassService.joinClass("student-1", "MATH10");

    // Phải tạo enrollment với đúng thông tin
    expect(ClassRepo.createEnrollment).toHaveBeenCalledWith({
      enrollmentId: "mock-uuid-9999",
      classId: "class-1",
      studentId: "student-1",
    });
    expect(result.classId).toBe("class-1");
  });

  it("should extract joinCode from a full join URL", async () => {
    // Giả lập: học sinh nhập link đầy đủ thay vì chỉ mã
    vi.mocked(ClassRepo.findClassByJoinCode).mockResolvedValue({ classId: "class-1" } as any);
    vi.mocked(ClassRepo.checkEnrollmentExists).mockResolvedValue(null);
    vi.mocked(ClassRepo.createEnrollment).mockResolvedValue({} as any);

    await ClassService.joinClass("student-1", "http://localhost:3000/classes/join/MATH10");

    // Phải tự tách lấy "MATH10" từ cuối URL
    expect(ClassRepo.findClassByJoinCode).toHaveBeenCalledWith("MATH10");
  });

  it("should throw NotFoundError when join code does not exist", async () => {
    // Giả lập: mã tham gia không khớp với lớp nào
    vi.mocked(ClassRepo.findClassByJoinCode).mockResolvedValue(null);

    await expect(ClassService.joinClass("student-1", "INVALID")).rejects.toThrow(NotFoundError);
  });

  it("should throw BadRequestError when student is already enrolled", async () => {
    // Giả lập: lớp tồn tại và học sinh đã tham gia rồi
    vi.mocked(ClassRepo.findClassByJoinCode).mockResolvedValue({ classId: "class-1" } as any);
    vi.mocked(ClassRepo.checkEnrollmentExists).mockResolvedValue({ enrollmentId: "enroll-1" } as any);

    // Không được tham gia lần 2
    await expect(ClassService.joinClass("student-1", "MATH10")).rejects.toThrow(BadRequestError);
    expect(ClassRepo.createEnrollment).not.toHaveBeenCalled();
  });
});

// ─── 8. getClassStudents ──────────────────────────────────────────────────────

describe("ClassService - getClassStudents", () => {
  beforeEach(() => vi.clearAllMocks());

  it("should return formatted list of students with enrollment info", async () => {
    // Giả lập: lớp tồn tại và có 1 học sinh
    vi.mocked(ClassRepo.findClassById).mockResolvedValue({ classId: "class-1" } as any);
    vi.mocked(ClassRepo.findStudentsByClassId).mockResolvedValue([
      {
        enrollmentId: "enroll-1",
        joinTime: new Date("2024-01-10"),
        status: "JOINED",
        Users: { userId: "student-1", name: "Alice", email: "alice@test.com", role: "student" },
      },
    ] as any);

    const result = await ClassService.getClassStudents("class-1");

    // Phải trả về 1 học sinh với đúng định dạng
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      enrollmentId: "enroll-1",
      joinTime: new Date("2024-01-10"),
      status: "JOINED",
      student: { userId: "student-1", name: "Alice", email: "alice@test.com", role: "student" },
    });
  });

  it("should throw NotFoundError when class does not exist", async () => {
    // Giả lập: lớp không tồn tại
    vi.mocked(ClassRepo.findClassById).mockResolvedValue(null);

    await expect(ClassService.getClassStudents("bad-class")).rejects.toThrow(NotFoundError);
  });

  it("should return empty array when class has no students", async () => {
    // Giả lập: lớp mới tạo, chưa có học sinh nào
    vi.mocked(ClassRepo.findClassById).mockResolvedValue({ classId: "class-1" } as any);
    vi.mocked(ClassRepo.findStudentsByClassId).mockResolvedValue([]);

    const result = await ClassService.getClassStudents("class-1");

    expect(result).toEqual([]);
  });
});

// ─── 9. removeStudentFromClass ────────────────────────────────────────────────

describe("ClassService - removeStudentFromClass", () => {
  beforeEach(() => vi.clearAllMocks());

  it("should remove student successfully when all conditions are met", async () => {
    // Giả lập: lớp tồn tại, teacher hợp lệ, học sinh đang trong lớp
    vi.mocked(ClassRepo.findClassById).mockResolvedValue({ classId: "class-1", teacherId: "teacher-1" } as any);
    vi.mocked(ClassRepo.checkEnrollmentExists).mockResolvedValue({ enrollmentId: "enroll-1" } as any);
    vi.mocked(ClassRepo.deleteEnrollment).mockResolvedValue({} as any);

    const result = await ClassService.removeStudentFromClass("teacher-1", "class-1", "student-1");

    // Phải gọi deleteEnrollment với đúng classId và studentId
    expect(ClassRepo.deleteEnrollment).toHaveBeenCalledWith("class-1", "student-1");
    expect(result).toEqual({ success: true });
  });

  it("should throw NotFoundError when class does not exist", async () => {
    // Giả lập: lớp không tồn tại
    vi.mocked(ClassRepo.findClassById).mockResolvedValue(null);

    await expect(ClassService.removeStudentFromClass("teacher-1", "bad-class", "student-1"))
      .rejects.toThrow(NotFoundError);
  });

  it("should throw ForbiddenError when teacher does not own the class", async () => {
    // Giả lập: teacher-2 cố xóa học sinh khỏi lớp của teacher-1
    vi.mocked(ClassRepo.findClassById).mockResolvedValue({ classId: "class-1", teacherId: "teacher-1" } as any);

    await expect(ClassService.removeStudentFromClass("teacher-2", "class-1", "student-1"))
      .rejects.toThrow(ForbiddenError);
  });

  it("should throw NotFoundError when student is not enrolled in the class", async () => {
    // Giả lập: học sinh không có trong lớp
    vi.mocked(ClassRepo.findClassById).mockResolvedValue({ classId: "class-1", teacherId: "teacher-1" } as any);
    vi.mocked(ClassRepo.checkEnrollmentExists).mockResolvedValue(null);

    await expect(ClassService.removeStudentFromClass("teacher-1", "class-1", "ghost-student"))
      .rejects.toThrow(NotFoundError);

    // deleteEnrollment KHÔNG được gọi nếu học sinh không tồn tại trong lớp
    expect(ClassRepo.deleteEnrollment).not.toHaveBeenCalled();
  });
});

// ─── 10. getJoinedClassesByStudentId ─────────────────────────────────────────

describe("ClassService - getJoinedClassesByStudentId", () => {
  beforeEach(() => vi.clearAllMocks());

  it("should return formatted list of joined classes with totalStudents", async () => {
    // Giả lập: học sinh đã tham gia 1 lớp
    const rawEnrollments = [
      {
        joinTime: new Date("2024-02-01"),
        status: "JOINED",
        Classes: {
          classId: "class-1",
          className: "Math 101",
          teacherId: "teacher-1",
          _count: { ClassEnrollments: 30 },
        },
      },
    ];
    vi.mocked(ClassRepo.findJoinedClassesByStudentId).mockResolvedValue(rawEnrollments as any);

    const result = await ClassService.getJoinedClassesByStudentId("student-1");

    // Phải có 1 lớp với đầy đủ thông tin
    expect(result).toHaveLength(1);
    expect(result[0].classId).toBe("class-1");
    expect(result[0].totalStudents).toBe(30);
    // joinTime và enrollmentStatus phải được thêm vào từ enrollment
    expect(result[0].joinTime).toEqual(new Date("2024-02-01"));
    expect(result[0].enrollmentStatus).toBe("JOINED");
  });

  it("should pass searchQuery to repository when provided", async () => {
    // Giả lập: không có kết quả tìm kiếm
    vi.mocked(ClassRepo.findJoinedClassesByStudentId).mockResolvedValue([]);

    await ClassService.getJoinedClassesByStudentId("student-1", "Physics");

    // Đảm bảo searchQuery được truyền xuống repository
    expect(ClassRepo.findJoinedClassesByStudentId).toHaveBeenCalledWith("student-1", "Physics");
  });

  it("should return empty array when student has not joined any class", async () => {
    // Giả lập: học sinh mới, chưa tham gia lớp nào
    vi.mocked(ClassRepo.findJoinedClassesByStudentId).mockResolvedValue([]);

    const result = await ClassService.getJoinedClassesByStudentId("new-student");

    expect(result).toEqual([]);
  });
});

// ─── 11. getClassStream ───────────────────────────────────────────────────────

describe("ClassService - getClassStream", () => {
  beforeEach(() => vi.clearAllMocks());

  it("should throw NotFoundError when class does not exist", async () => {
    // Giả lập: lớp học không tồn tại
    vi.mocked(ClassRepo.findClassById).mockResolvedValue(null);

    await expect(ClassService.getClassStream("bad-class")).rejects.toThrow(NotFoundError);
  });

  it("should return combined and sorted stream of assignments and documents", async () => {
    // Giả lập: lớp có 1 bài tập (tạo trước) và 1 tài liệu (tạo sau)
    vi.mocked(ClassRepo.findClassById).mockResolvedValue({ classId: "class-1" } as any);
    vi.mocked(ClassRepo.findAssignmentsByClassId).mockResolvedValue([
      {
        assignmentId: "a-1", title: "HW1", description: "", createdAt: new Date("2024-03-01"),
        deadline: futureDeadline, status: "ACTIVE", typeAssignment: "homework",
        AssignmentAttachments: [], _count: { Submissions: 3 },
      },
    ] as any);
    vi.mocked(ClassRepo.findDocumentsByClassId).mockResolvedValue([
      {
        documentId: "d-1", title: "Lecture", description: "",
        uploadTime: new Date("2024-03-05"), // Mới hơn bài tập
        DocumentAttachments: [],
      },
    ] as any);

    const result = await ClassService.getClassStream("class-1");

    // Phải có 2 item trong stream
    expect(result).toHaveLength(2);
    // Tài liệu (2024-03-05) phải đứng trước bài tập (2024-03-01) vì mới hơn
    expect(result[0].type).toBe("document");
    expect(result[1].type).toBe("assignment");
  });

  it("should map assignment fields correctly including totalSubmissions", async () => {
    // Kiểm tra xem các trường của bài tập được map đúng không
    vi.mocked(ClassRepo.findClassById).mockResolvedValue({ classId: "class-1" } as any);
    vi.mocked(ClassRepo.findAssignmentsByClassId).mockResolvedValue([
      {
        assignmentId: "a-1", title: "Quiz 1", description: "Desc", createdAt: new Date("2024-03-01"),
        deadline: futureDeadline, status: "ACTIVE", typeAssignment: "quiz",
        AssignmentAttachments: [], _count: { Submissions: 7 },
      },
    ] as any);
    vi.mocked(ClassRepo.findDocumentsByClassId).mockResolvedValue([]);

    const result = await ClassService.getClassStream("class-1");

    // Phải map đúng tất cả các trường
    expect(result[0]).toMatchObject({
      assignmentId: "a-1",
      type: "assignment",
      title: "Quiz 1",
      totalSubmissions: 7, // Từ _count.Submissions
    });
  });

  it("should generate presigned URLs for assignment file attachments", async () => {
    // Giả lập: bài tập có file đính kèm lưu trên MinIO
    vi.mocked(ClassRepo.findClassById).mockResolvedValue({ classId: "class-1" } as any);
    vi.mocked(ClassRepo.findAssignmentsByClassId).mockResolvedValue([
      {
        assignmentId: "a-1", title: "HW", description: "", createdAt: new Date(),
        deadline: futureDeadline, status: "ACTIVE", typeAssignment: "homework",
        AssignmentAttachments: [
          { fileUrl: "assignments/hw.pdf", fileName: "hw.pdf", fileSize: 2048 },
        ],
        _count: { Submissions: 0 },
      },
    ] as any);
    vi.mocked(ClassRepo.findDocumentsByClassId).mockResolvedValue([]);

    const result = await ClassService.getClassStream("class-1");

    const attachment = (result[0] as any).AssignmentAttachments[0];
    // URL phải được thay thế bằng presigned URL từ MinIO (không phải key thô)
    expect(attachment.fileUrl).toBe("https://minio.example.com/presigned");
    expect(attachment.downloadUrl).toBe("https://minio.example.com/presigned");
  });

  it("should return empty stream when class has no assignments and no documents", async () => {
    // Giả lập: lớp mới tạo, chưa có bài tập hay tài liệu
    vi.mocked(ClassRepo.findClassById).mockResolvedValue({ classId: "class-1" } as any);
    vi.mocked(ClassRepo.findAssignmentsByClassId).mockResolvedValue([]);
    vi.mocked(ClassRepo.findDocumentsByClassId).mockResolvedValue([]);

    const result = await ClassService.getClassStream("class-1");

    expect(result).toEqual([]);
  });
});
