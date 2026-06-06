-- 1. Tạo Database
CREATE DATABASE ClassroomWebsite;
GO
USE ClassroomWebsite;
GO

-- 2. Bảng Users (Tài khoản người dùng)
CREATE TABLE Users (
    userId VARCHAR(50) PRIMARY KEY,
    name NVARCHAR (255) NOT NULL, -- NVARCHAR để hỗ trợ tiếng Việt [cite: 3781]
    email VARCHAR(255) UNIQUE NOT NULL,
    passwordHash VARCHAR(500) NOT NULL, -- Dùng cho mã hóa bcrypt [cite: 2236]
    role VARCHAR(20) CHECK (
        role IN ('Teacher', 'Student')
    ) NOT NULL -- Phân quyền Giáo viên/Học sinh [cite: 3784]
);

-- 3. Bảng Classes (Thông tin lớp học)
CREATE TABLE Classes (
    classId VARCHAR(50) PRIMARY KEY,
    teacherId VARCHAR(50) NOT NULL,
    className NVARCHAR (255) NOT NULL,
    description NVARCHAR (MAX),
    room VARCHAR(50),
    topic NVARCHAR (255),
    joinCode VARCHAR(20) UNIQUE, -- Mã tham gia lớp học [cite: 3786]
    joinLink VARCHAR(500),
    status VARCHAR(20) DEFAULT 'ACTIVE',
    createdAt DATETIME DEFAULT GETDATE (),
    CONSTRAINT FK_Classes_Teacher FOREIGN KEY (teacherId) REFERENCES Users (userId)
);

-- 4. Bảng ClassEnrollments (Danh sách thành viên tham gia lớp)
CREATE TABLE ClassEnrollments (
    enrollmentId VARCHAR(50) PRIMARY KEY,
    classId VARCHAR(50) NOT NULL,
    studentId VARCHAR(50) NOT NULL,
    joinTime DATETIME DEFAULT GETDATE (),
    status VARCHAR(20) DEFAULT 'JOINED',
    CONSTRAINT FK_Enroll_Class FOREIGN KEY (classId) REFERENCES Classes (classId),
    CONSTRAINT FK_Enroll_Student FOREIGN KEY (studentId) REFERENCES Users (userId)
);

-- 5. Bảng Assignments (Thông tin bài tập)
CREATE TABLE Assignments (
    assignmentId VARCHAR(50) PRIMARY KEY,
    classId VARCHAR(50) NOT NULL,
    title NVARCHAR (255) NOT NULL,
    description NVARCHAR (MAX),
    deadline DATETIME NOT NULL,
    typeAssignment VARCHAR(20), -- Ví dụ: 'ESSAY' hoặc 'MULTIPLE_CHOICE'
    quizData NVARCHAR(MAX),
    status VARCHAR(20) DEFAULT 'ACTIVE',
    createdAt DATETIME DEFAULT GETDATE (),
    CONSTRAINT FK_Assignments_Class FOREIGN KEY (classId) REFERENCES Classes (classId)
);

-- 6. Bảng AssignmentAttachments (Tệp đính kèm của bài tập từ Giáo viên)
CREATE TABLE AssignmentAttachments (
    attachmentId VARCHAR(50) PRIMARY KEY,
    assignmentId VARCHAR(50) NOT NULL,
    fileName NVARCHAR (255) NOT NULL,
    fileUrl VARCHAR(500) NOT NULL,
    fileSize BIGINT, -- Dung lượng file [cite: 3794]
    uploadedAt DATETIME DEFAULT GETDATE (),
    CONSTRAINT FK_AssignAttach_Assign FOREIGN KEY (assignmentId) REFERENCES Assignments (assignmentId)
);

-- 7. Bảng Documents (Tài liệu học tập)
CREATE TABLE Documents (
    documentId VARCHAR(50) PRIMARY KEY,
    classId VARCHAR(50) NOT NULL,
    title NVARCHAR (255) NOT NULL,
    description NVARCHAR (MAX),
    uploadTime DATETIME DEFAULT GETDATE (),
    CONSTRAINT FK_Documents_Class FOREIGN KEY (classId) REFERENCES Classes (classId)
);

-- 8. Bảng DocumentAttachments (Tệp đính kèm của tài liệu)
CREATE TABLE DocumentAttachments (
    attachmentId VARCHAR(50) PRIMARY KEY,
    documentId VARCHAR(50) NOT NULL,
    fileName NVARCHAR (255) NOT NULL,
    fileUri VARCHAR(500) NOT NULL,
    fileSize BIGINT,
    uploadedAt DATETIME DEFAULT GETDATE (),
    CONSTRAINT FK_DocAttach_Doc FOREIGN KEY (documentId) REFERENCES Documents (documentId)
);

-- 9. Bảng Submissions (Bài nộp của học sinh)
CREATE TABLE Submissions (
    submissionId VARCHAR(50) PRIMARY KEY,
    assignmentId VARCHAR(50) NOT NULL,
    studentId VARCHAR(50) NOT NULL,
    submittedAt DATETIME DEFAULT GETDATE (),
    status VARCHAR(20), -- Ví dụ: 'Đã nộp', 'Nộp muộn' [cite: 3799]
    quizAnswers NVARCHAR(MAX),
    CONSTRAINT FK_Submissions_Assign FOREIGN KEY (assignmentId) REFERENCES Assignments (assignmentId),
    CONSTRAINT FK_Submissions_Student FOREIGN KEY (studentId) REFERENCES Users (userId)
);

-- 10. Bảng SubmissionAttachments (Tệp bài làm của học sinh)
CREATE TABLE SubmissionAttachments (
    attachmentId VARCHAR(50) PRIMARY KEY,
    submissionId VARCHAR(50) NOT NULL,
    fileName NVARCHAR (255) NOT NULL,
    fileUri VARCHAR(500) NOT NULL,
    fileSize BIGINT,
    uploadedAt DATETIME DEFAULT GETDATE (),
    CONSTRAINT FK_SubAttach_Sub FOREIGN KEY (submissionId) REFERENCES Submissions (submissionId)
);

-- 11. Bảng Grades (Điểm số và nhận xét)
CREATE TABLE Grades (
    gradeId VARCHAR(50) PRIMARY KEY,
    submissionId VARCHAR(50),
    studentId VARCHAR(50) NOT NULL,
    classId VARCHAR(50) NOT NULL,
    assignmentId VARCHAR(50) NOT NULL,
    score FLOAT CHECK (
        score >= 0
        AND score <= 10
    ), -- Thang điểm 10 [cite: 3811, 4169]
    comment NVARCHAR (MAX), -- Nhận xét của giáo viên
    gradedAt DATETIME DEFAULT GETDATE (),
    CONSTRAINT FK_Grades_Sub FOREIGN KEY (submissionId) REFERENCES Submissions (submissionId),
    CONSTRAINT FK_Grades_Student FOREIGN KEY (studentId) REFERENCES Users (userId),
    CONSTRAINT FK_Grades_Class FOREIGN KEY (classId) REFERENCES Classes (classId),
    CONSTRAINT FK_Grades_Assign FOREIGN KEY (assignmentId) REFERENCES Assignments (assignmentId)
);
GO

-- 12. Cập nhật thêm cột cho Native Quiz nếu database đã tồn tại
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Assignments') AND name = 'quizData')
BEGIN
    ALTER TABLE Assignments ADD quizData NVARCHAR(MAX) NULL;
END;
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Submissions') AND name = 'quizAnswers')
BEGIN
    ALTER TABLE Submissions ADD quizAnswers NVARCHAR(MAX) NULL;
END;
GO