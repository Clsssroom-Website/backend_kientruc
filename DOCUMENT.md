1. Singleton: Kết nối Database (NodeJS)
Tính hợp lý: Rất cao. Trong NodeJS, việc tạo quá nhiều kết nối đến database (như SQL Server/MongoDB) sẽ làm cạn kiệt tài nguyên.

Áp dụng: Đảm bảo toàn bộ ứng dụng Backend chỉ sử dụng một instance duy nhất để quản lý pool kết nối. Điều này giúp đồng bộ dữ liệu và tối ưu hiệu suất.

2. Factory Method: Đối tượng User và Bài tập
Tính hợp lý: Rất tốt cho việc mở rộng.

Áp dụng:

User: Tùy vào loại user (Teacher, Student, Admin) mà Factory sẽ trả về đối tượng có các quyền hạn và phương thức khác nhau (ví dụ: Student có phương thức nopBai(), Teacher có chamDiem()).

Bài tập: Giúp hệ thống dễ dàng thêm các loại bài tập mới trong tương lai (ví dụ: bài tập kéo thả, bài tập code) mà không cần sửa đổi logic cốt lõi.

3. Observer: Thông báo bài tập/điểm
Tính hợp lý: Đây là mẫu "kinh điển" cho hệ thống học tập.

Áp dụng: Khi giáo viên cập nhật điểm (Subject), hệ thống sẽ tự động "bắn" thông báo đến các học sinh liên quan (Observers) thông qua Email hoặc Socket.io (real-time).

4. Facade: Gộp các quy trình phức tạp
Tính hợp lý: Giúp mã nguồn sạch sẽ (Clean Code).

Áp dụng: Ví dụ quy trình "Kết thúc khóa học" bao gồm nhiều bước: Tính điểm trung bình -> Kiểm tra điều kiện qua môn -> Xuất báo cáo Excel -> Gửi mail thông báo. Thay vì gọi từng hàm lẻ tẻ ở Controller, bạn tạo một Class FinalizeGradeFacade để gọi duy nhất một phương thức execute().

5. Strategy: Vòng đời chấm điểm (Auto vs Manual)
Tính hợp lý: Rất thông minh.

Áp dụng: Thuật toán chấm điểm trắc nghiệm (so khớp đáp án) và tự luận (giáo viên nhập tay) là hoàn toàn khác nhau. Mẫu Strategy giúp bạn hoán đổi linh hoạt giữa các "chiến lược" chấm điểm tùy theo loại bài tập mà không cần dùng quá nhiều câu lệnh if-else lồng nhau.

6. Adapter: Chuyển đổi dữ liệu Google Form
Tính hợp lý: Phù hợp để giải quyết vấn đề tương thích dữ liệu.

Áp dụng: Cấu trúc JSON từ Google Form API thường không khớp với Schema cơ sở dữ liệu của bạn. Một lớp GoogleFormAdapter sẽ đóng vai trò "thông dịch viên", chuyển đổi các trường dữ liệu ngoại lai thành chuẩn dữ liệu mà hệ thống của bạn hiểu được.