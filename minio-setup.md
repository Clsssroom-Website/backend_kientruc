# Hướng dẫn Cài đặt và Cấu hình MinIO (S3-Compatible)

MinIO là một object storage tương thích hoàn toàn với Amazon S3, rất nhẹ và phù hợp để lưu trữ file (tài liệu, hình ảnh) cho dự án.

## 1. Cài đặt MinIO thông qua Docker (Khuyên dùng cho Local)

Cách nhanh nhất để chạy MinIO ở môi trường local là sử dụng Docker. Hãy đảm bảo máy tính của bạn đã cài đặt [Docker](https://www.docker.com/).

Mở Terminal và chạy lệnh sau để khởi tạo container MinIO:

```bash
docker run -d -p 9000:9000 -p 9001:9001 --name minio -e "MINIO_ROOT_USER=minioadmin" -e "MINIO_ROOT_PASSWORD=minioadmin" -v minio-data:/data quay.io/minio/minio server /data --console-address ":9001"
```

**Giải thích:**
- Cổng `9000` là cổng API để backend (Node.js) kết nối tới.
- Cổng `9001` là giao diện Web Console (dành cho bạn quản lý file bằng trình duyệt).
- `MINIO_ROOT_USER` & `MINIO_ROOT_PASSWORD` là tài khoản mặc định (bạn có thể đổi tùy ý).
- `-v minio-data:/data` để lưu trữ dữ liệu bền vững (không mất file khi tắt container).

## 2. Truy cập Giao diện Web (Console)

Sau khi container chạy, hãy mở trình duyệt và truy cập:
- **URL**: [http://localhost:9001](http://localhost:9001)
- **Username**: `minioadmin`
- **Password**: `minioadmin`

Tại đây, bạn có thể tạo bucket thủ công (hoặc backend sẽ tự động tạo bucket `classroom-documents` khi có file upload đầu tiên).

## 3. Cấu hình biến môi trường (`.env`) cho Backend

Để backend kết nối được tới MinIO, hãy thêm các biến sau vào file `.env` của thư mục `backend`:

```env
# MinIO Storage Configuration
MINIO_ENDPOINT="127.0.0.1"
MINIO_PORT="9000"
MINIO_ACCESS_KEY="minioadmin"
MINIO_SECRET_KEY="minioadmin"
MINIO_BUCKET_NAME="classroom-documents"
MINIO_USE_SSL="false"
```

**Lưu ý khi deploy lên Production:**
- Khi deploy, bạn cần đổi `MINIO_ENDPOINT` thành domain/IP thật của server MinIO (ví dụ: `minio.yourdomain.com`).
- Chuyển `MINIO_USE_SSL="true"` nếu server có chứng chỉ HTTPS.
- Đổi Access Key và Secret Key thành mật khẩu mạnh hơn.
