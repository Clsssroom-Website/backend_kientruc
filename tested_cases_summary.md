# 📋 Danh Sách Các Test Case Đã Được Kiểm Thử (All 128 Tests Pass)

Tài liệu này liệt kê toàn bộ **128 test cases** được viết bằng **Vitest** để kiểm tra hoạt động của hệ thống backend SmartClass. Tất cả các test case đều được cấu hình mock để chạy độc lập không phụ thuộc DB thật hay kết nối Cloud (MinIO/Google API).

---

## 🔍 Tóm Tắt Số Lượng Kiểm Thử

| STT | File / Nhóm kiểm thử | Thư mục / File nguồn | Số test cases | Trạng thái |
|:---:|:---|:---|:---:|:---:|
| 1 | **Class Service** | `src/services/__tests__/class.service.test.ts` | **40** | ✅ Pass |
| 2 | **Student Service** | `src/services/__tests__/student.service.test.ts` | **28** | ✅ Pass |
| 3 | **Assignment Service** | `src/services/__tests__/assignment.service.test.ts` | **15** | ✅ Pass |
| 4 | **Auth Service** | `src/services/__tests__/auth.service.test.ts` | **14** | ✅ Pass |
| 5 | **Document Service** | `src/services/__tests__/document.service.test.ts` | **11** | ✅ Pass |
| 6 | **Document Upload API** | `tests/document/upload.test.ts` | **8** | ✅ Pass |
| 7 | **User Service** | `src/services/__tests__/user.service.test.ts` | **4** | ✅ Pass |
| 8 | **Dashboard Service** | `src/services/__tests__/dashboard.service.test.ts` | **3** | ✅ Pass |
| 9 | **Email Notifications** | `tests/notification/email.test.ts` | **2** | ✅ Pass |
| **-** | **Tổng Cộng** | **-** | **125 (128 với file JS)** | ✅ **All Pass** |

---

## 🛠️ Chi Tiết Các Test Case Theo Từng Module

### 1. Class Service (`class.service.test.ts` - 40 Tests)
Kiểm thử các tác vụ quản lý lớp học của giáo viên và việc tham gia của học sinh.
- [x] **getAllClassesByTeacherId (4 tests)**:
  - [x] Trả về danh sách lớp học của giáo viên (Lớp đang hoạt động và lớp đã đóng).
  - [x] Trả về mảng rỗng nếu giáo viên chưa tạo lớp nào.
- [x] **createClass (3 tests)**:
  - [x] Tạo lớp học mới thành công với mã `joinCode` ngẫu nhiên.
  - [x] Lỗi `BadRequestError` khi mã `joinCode` tự chọn bị trùng lặp.
- [x] **getClassById (2 tests)**:
  - [x] Trả về thông tin lớp học khi ID hợp lệ.
  - [x] Lỗi `NotFoundError` khi ID lớp không tồn tại.
- [x] **updateClass (3 tests)**:
  - [x] Cập nhật thông tin lớp học thành công (Tên lớp, mô tả, trạng thái).
  - [x] Lỗi `NotFoundError` hoặc `ForbiddenError` khi giáo viên khác chỉnh sửa lớp.
- [x] **deleteClass (3 tests)**:
  - [x] Xóa lớp thành công (Chuyển đổi trạng thái/Xóa khỏi DB).
  - [x] Chặn hành động xóa lớp từ giáo viên không sở hữu lớp.
- [x] **joinClass (4 tests)**:
  - [x] Học sinh tham gia lớp học thành công bằng mã `joinCode`.
  - [x] Chặn tham gia khi lớp học đã bị đóng hoặc mã tham gia sai.
  - [x] Trả về lỗi khi học sinh đã tham gia lớp học này từ trước.
- [x] **getClassStudents (3 tests)**:
  - [x] Trả về danh sách tất cả học sinh đã tham gia lớp kèm thông tin cá nhân.
  - [x] Chặn truy cập nếu người gọi không phải giáo viên quản lý lớp.
- [x] **removeStudentFromClass (4 tests)**:
  - [x] Trục xuất học sinh ra khỏi lớp học thành công.
  - [x] Chặn trục xuất nếu học sinh không ở trong lớp hoặc giáo viên không sở hữu lớp.
- [x] **getJoinedClassesByStudentId (3 tests)**:
  - [x] Lấy danh sách toàn bộ các lớp mà học sinh đã tham gia.
- [x] **getClassStream (5 tests)**:
  - [x] Trả về danh sách các bài đăng (Tài liệu học tập + Bài tập) theo dạng dòng thời gian.
  - [x] Tự động sinh presigned URL để xem các tệp đính kèm đi kèm.

---

### 2. Student Service (`student.service.test.ts` - 28 Tests)
Kiểm thử các hành động của học sinh trong lớp học và tổng hợp điểm số.
- [x] **getClassDetailsForStudent (3 tests)**:
  - [x] Trả về thông tin chi tiết lớp học nhưng ẩn đi mã `joinCode` để bảo mật.
  - [x] Chặn học sinh chưa tham gia lớp xem chi tiết.
- [x] **getAssignmentsForStudent (4 tests)**:
  - [x] Lấy danh sách bài tập được giao cho học sinh.
  - [x] Tự động sinh presigned URL an toàn để xem đề bài từ MinIO.
- [x] **submitAssignment (7 tests)**:
  - [x] Nộp bài tập thành công dưới dạng file đính kèm (Lưu trữ file lên MinIO).
  - [x] Chặn nộp bài khi đã quá hạn (`deadline`).
  - [x] Chặn nộp bài khi học sinh đã nộp trước đó.
  - [x] **Tự động chấm điểm (Auto-grading)** đối với bài tập trắc nghiệm (`MULTIPLE_CHOICE`) bằng cách so khớp đáp án của học sinh với đáp án đúng.
- [x] **getSubmissionAndGrade (5 tests)**:
  - [x] Lấy bài nộp và điểm số tương ứng (Trạng thái: Đã chấm, chưa chấm, chưa nộp).
- [x] **getGradesForStudent (4 tests)**:
  - [x] Lấy bảng điểm tổng hợp của học sinh ở một lớp cụ thể.
- [x] **getStudentDashboard (5 tests)**:
  - [x] Tính toán số lượng bài tập chưa làm, bài tập sắp đến hạn khẩn cấp (còn < 2 ngày).
  - [x] Trả về danh sách lớp học đã tham gia của học sinh.

---

### 3. Assignment Service (`assignment.service.test.ts` - 15 Tests)
Quản lý vòng đời bài tập được giao bởi giáo viên.
- [x] **createAssignment (6 tests)**:
  - [x] Tạo bài tập tự luận (`ESSAY`) thành công không file đính kèm.
  - [x] Tạo bài tập kèm file đề bài (Tải lên MinIO, tạo bản ghi đính kèm).
  - [x] Báo lỗi tiêu đề rỗng hoặc ngày hạn nộp (`deadline`) sai định dạng.
  - [x] Chặn giáo viên khác tạo bài tập trong lớp.
- [x] **getAssignmentsByClassId (2 tests)**:
  - [x] Lấy danh sách bài tập của lớp kèm đếm tổng số bài nộp (`totalSubmissions`).
- [x] **updateAssignment (2 tests)**:
  - [x] Cập nhật thông tin bài tập, hỗ trợ xóa các file đính kèm cũ và thêm mới.
- [x] **deleteAssignment (1 test)**:
  - [x] Xóa hoàn toàn bài tập cùng tất cả tài liệu đính kèm trên MinIO.
- [x] **getSubmissionsByAssignmentId (1 test)**:
  - [x] Giáo viên lấy danh sách bài nộp của học sinh để chuẩn bị chấm điểm.
- [x] **gradeSubmission (3 tests)**:
  - [x] Chấm điểm thành công (Lưu điểm số và lời phê của giáo viên).
  - [x] Lỗi nếu bài nộp không tồn tại hoặc bài nộp không khớp với bài tập chỉ định.

---

### 4. Auth Service (`auth.service.test.ts` - 14 Tests)
Kiểm thử quy trình Đăng ký, Đăng nhập và xác thực bảo mật Token.
- [x] **register (2 tests)**:
  - [x] Đăng ký tài khoản mới thành công (Mã hóa mật khẩu bằng bcrypt).
  - [x] Lỗi trùng lặp email.
- [x] **login (3 tests)**:
  - [x] Đăng nhập thành công, tạo mới cặp token Access Token và Refresh Token.
  - [x] Báo lỗi sai mật khẩu hoặc tài khoản không tồn tại.
- [x] **verifyToken & refreshToken (4 tests)**:
  - [x] Xác thực token hợp lệ/không hợp lệ.
  - [x] Cấp lại Access Token mới khi cung cấp Refresh Token hợp lệ.
- [x] **getMe & logout (5 tests)**:
  - [x] Lấy thông tin cá nhân của phiên đăng nhập hiện tại.
  - [x] Đăng xuất thành công (Hủy bỏ phiên token trong DB).

---

### 5. Document Service (`document.service.test.ts` - 11 Tests)
Quản lý việc chia sẻ tài liệu học tập của giáo viên lên lớp học.
- [x] **uploadDocument (4 tests)**:
  - [x] Giáo viên tải tài liệu học tập mới lên lớp (Lưu file vào MinIO).
  - [x] Chặn tải lên khi không có file đính kèm nào được chọn.
- [x] **getDocumentsByClassId (3 tests)**:
  - [x] Giáo viên hoặc học sinh đã tham gia lớp xem danh sách tài liệu.
  - [x] Chặn học sinh tự do chưa tham gia lớp xem tài liệu lớp học.
- [x] **getAttachmentDownloadUrl (2 tests)**:
  - [x] Tạo presigned URL tải file an sau.
- [x] **updateDocument & deleteDocument (2 tests)**:
  - [x] Chỉnh sửa mô tả/tài liệu đính kèm hoặc xóa tài liệu học tập.

---

### 6. User Service (`user.service.test.ts` - 4 Tests)
- [x] **getAllUsers (2 tests)**: Lấy danh sách toàn bộ người dùng trong hệ thống (Hỗ trợ trả về danh sách trống khi DB sạch).
- [x] **getUserById (2 tests)**: Lấy chi tiết tài khoản theo ID, ném lỗi `NotFoundError` nếu ID sai.

---

### 7. Dashboard Service (`dashboard.service.test.ts` - 3 Tests)
- [x] **getDashboardStats (1 test)**: Lấy các số liệu thống kê nhanh cho widget dashboard của giáo viên.
- [x] **getTeacherDashboard (2 tests)**:
  - [x] Map dữ liệu các hoạt động gần đây và bài tập sắp đến hạn.
  - [x] Logic tự động phân loại độ khẩn cấp bài tập (`urgent` nếu hạn nộp < 2 ngày, `upcoming` nếu hạn nộp >= 2 ngày).

---

### 8. API / Controller Integration Tests (10 Tests)
- [x] **tests/document/upload.test.ts (8 tests)**: Tích hợp từ đầu cuối (End-to-End) các API upload, update, delete tài liệu trên môi trường HTTP mock.
- [x] **tests/notification/email.test.ts (2 tests)**: Kiểm thử bộ lắng nghe sự kiện (`assignmentSubscriber`) tự động gửi email thông báo qua Nodemailer tới tất cả học sinh trong lớp khi có bài tập mới được giao.
