# Design Patterns Trong Dự Án Classroom Website (TypeScript)

> **Dự án**: Hệ thống quản lý lớp học — Backend Node.js + Express + Prisma (MSSQL) + MinIO + Redis  
> **Tài liệu này** trình bày 6 design pattern được áp dụng **thực tế** trong source code của dự án.

---

## Mục Lục

- [1. Singleton](#1-singleton)
- [2. Factory Method](#2-factory-method)
- [3. Adapter](#3-adapter)
- [4. Facade](#4-facade)
- [5. Strategy](#5-strategy)
- [6. Observer](#6-observer)
- [Tổng Hợp & Quan Hệ Giữa Các Pattern](#tổng-hợp--quan-hệ-giữa-các-pattern)

---

## 1. Singleton

### Phân loại
**Creational Pattern** — Nhóm Khởi Tạo

### Định nghĩa
Đảm bảo một class chỉ có **duy nhất một instance** trong toàn bộ vòng đời ứng dụng. Tất cả nơi sử dụng đều trỏ tới cùng một đối tượng.

### Khi nào dùng
- Kết nối database (tránh tạo quá nhiều connection)
- Redis client (tái sử dụng connection pool)
- Logger, config toàn cục

### Áp dụng trong dự án

Dự án áp dụng Singleton ở **hai nơi quan trọng**:

#### 📌 1a. Prisma Client — `src/config/prisma.ts`

```typescript
// src/config/prisma.ts
import { PrismaMssql } from "@prisma/adapter-mssql";
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config();

const port = Number.parseInt(process.env.DB_PORT ?? "1433", 10);

// Cấu hình kết nối MSSQL
const config = {
  server:   process.env.DB_SERVER   ?? "localhost",
  port,
  database: process.env.DB_NAME     ?? "ClassroomWebsite",
  user:     process.env.DB_USER     ?? "sa",
  password: process.env.DB_PASSWORD ?? "1234",
  options: {
    encrypt: true,
    trustServerCertificate: true,
  },
};

// Tạo adapter MSSQL cho Prisma
const adapter = new PrismaMssql(config);

// ✅ SINGLETON: Module-level export — Node.js cache module, 
//    nên toàn bộ ứng dụng dùng chung 1 instance PrismaClient này
const prisma = new PrismaClient({ adapter });

export default prisma;
```

> **Cơ chế Singleton**: TypeScript/Node.js cache module sau lần `import` đầu tiên.  
> Mọi file `import prisma from "../config/prisma.js"` đều nhận **cùng một instance** `PrismaClient`.

**Cách sử dụng trong dự án** (ví dụ trong `assignment.service.ts`):
```typescript
import prisma from "../config/prisma.js";

// Kiểm tra lớp học tồn tại
const classRecord = await prisma.classes.findUnique({
  where: { classId },
  select: { teacherId: true, className: true },
});
```

---

#### 📌 1b. Redis Client — `src/infrastructure/redisClient.ts`

```typescript
// src/infrastructure/redisClient.ts
import { Redis } from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

// ✅ SINGLETON: Tạo một Redis connection duy nhất cho toàn app
const redisClient = new Redis(REDIS_URL);

redisClient.on("error", (err: Error) => {
  console.error("Redis Client Error", err);
});

redisClient.on("connect", () => {
  console.log("Connected to Redis");
});

export default redisClient;
```

**Cách sử dụng** — lưu refresh token trong `session.repo.ts`:
```typescript
import redisClient from "../infrastructure/redisClient.js";

// Lưu refresh token với TTL 7 ngày
await redisClient.setex(`refresh:${userId}`, ttl, refreshToken);

// Kiểm tra refresh token
const userId = await redisClient.get(`refresh:${refreshToken}`);
```

### Sơ đồ

```
┌──────────────────────────────┐
│   Node.js Module Cache       │
│                              │
│  prisma.ts ──► PrismaClient  │◄── assignment.service.ts
│                   (×1)       │◄── document.service.ts
│                              │◄── class.service.ts
│  redisClient.ts ──► Redis    │◄── session.repo.ts
│                   (×1)       │
└──────────────────────────────┘
```

---

## 2. Factory Method

### Phân loại
**Creational Pattern** — Nhóm Khởi Tạo

### Định nghĩa
Định nghĩa một **interface chung** để tạo object; subclass/implementation cụ thể quyết định class nào được khởi tạo. Caller chỉ biết interface, không biết implement cụ thể.

### Khi nào dùng
- Loại object được quyết định tại runtime (config, môi trường)
- Muốn dễ dàng thay thế implementation mà không ảnh hưởng code gọi

### Áp dụng trong dự án

Dự án dùng Factory Method để tạo **storage service** (`IStorageService`).  
Hiện tại chỉ có `MinioStorageService`, nhưng interface cho phép swap sang S3, GCS... mà không cần sửa business logic.

#### 📌 Interface `IStorageService` — `src/services/storage/minioStorage.ts`

```typescript
// src/services/storage/minioStorage.ts

// ✅ FACTORY METHOD INTERFACE — định nghĩa "hợp đồng" cho mọi storage provider
export interface IStorageService {
  uploadFile(
    fileBuffer: Buffer,
    originalName: string,
    mimeType: string
  ): Promise<{ url: string; size: number }>;

  getPresignedUrl(
    fileUrl: string,
    forceDownload?: boolean,
    fileName?: string
  ): Promise<string>;
}

// ✅ CONCRETE PRODUCT — implement cụ thể dùng MinIO
export class MinioStorageService implements IStorageService {
  private client: Client;
  private bucketName: string;

  constructor(bucketName?: string) {
    this.bucketName = bucketName || process.env.MINIO_BUCKET_NAME || "classroom-documents";
    this.client = new Client({
      endPoint:  process.env.MINIO_ENDPOINT  || "127.0.0.1",
      port:      parseInt(process.env.MINIO_PORT || "9000", 10),
      useSSL:    process.env.MINIO_USE_SSL === "true",
      accessKey: process.env.MINIO_ACCESS_KEY || "minioadmin",
      secretKey: process.env.MINIO_SECRET_KEY || "minioadmin",
    });
    this.initializeBucket();
  }

  public async uploadFile(
    fileBuffer: Buffer,
    originalName: string,
    mimeType: string
  ): Promise<{ url: string; size: number }> {
    const extension = originalName.split(".").pop();
    const uniqueFileName = `${uuidv4()}.${extension}`;

    await this.client.putObject(
      this.bucketName,
      uniqueFileName,
      fileBuffer,
      fileBuffer.length,
      { "Content-Type": mimeType }
    );

    return {
      url:  `${this.bucketName}/${uniqueFileName}`,
      size: fileBuffer.length,
    };
  }

  public async getPresignedUrl(
    fileUrl: string,
    forceDownload = false,
    fileName?: string
  ): Promise<string> {
    const objectName = fileUrl.split("/").slice(1).join("/");
    const disposition = forceDownload
      ? `attachment; filename="${fileName ?? "download"}"`
      : `inline; filename="${fileName ?? "download"}"`;

    return await this.client.presignedGetObject(
      this.bucketName,
      objectName,
      24 * 60 * 60,                             // TTL: 24 giờ
      { "response-content-disposition": disposition }
    );
  }
}
```

#### 📌 Cách sử dụng — nhiều bucket khác nhau theo context

```typescript
// src/services/assignment.service.ts — constructor
this.storageService = new MinioStorageService("classroom-assignments");

// src/services/document.service.ts — constructor
this.storageService = new MinioStorageService(); // dùng bucket mặc định: "classroom-documents"

// Trong getSubmissionsByAssignmentId — bucket khác cho submissions
const submissionStorageService = new MinioStorageService("classroom-submissions");
```

> **Lợi ích**: Cả `AssignmentService`, `DocumentService` đều gọi qua `IStorageService`.  
> Muốn đổi sang AWS S3 → chỉ cần tạo `S3StorageService implements IStorageService`, không cần sửa business logic.

### Sơ đồ

```
«interface»
IStorageService
+ uploadFile(buffer, name, mime): { url, size }
+ getPresignedUrl(url, forceDownload?, fileName?): string
        ▲
        │ implements
MinioStorageService          (S3StorageService)  ← có thể thêm sau
+ constructor(bucketName?)   (GCSStorageService) ← có thể thêm sau

        ↑ được tạo bởi (Factory)
AssignmentService ──► new MinioStorageService("classroom-assignments")
DocumentService   ──► new MinioStorageService("classroom-documents")
```

---

## 3. Adapter

### Phân loại
**Structural Pattern** — Nhóm Cấu Trúc

### Định nghĩa
**Bọc** (wrap) một class có interface không tương thích thành interface mà hệ thống mong đợi. Code của mình không bao giờ gọi trực tiếp third-party library.

### Khi nào dùng
- Tích hợp thư viện bên ngoài (nodemailer, minio, bcrypt, jsonwebtoken)
- Thay thế thư viện sau mà không sửa business code

### Áp dụng trong dự án

#### 📌 3a. Email Adapter — Nodemailer → `IEmailProvider`

```typescript
// src/services/email/emailProvider.ts

// ✅ TARGET INTERFACE — interface mà hệ thống mong đợi
export interface SendEmailOptions {
  to:      string;
  subject: string;
  html:    string;
}

export interface IEmailProvider {
  sendEmail(options: SendEmailOptions): Promise<void>;
}
```

```typescript
// src/services/email/nodemailerProvider.ts
import nodemailer from "nodemailer";
import { IEmailProvider, SendEmailOptions } from "./emailProvider.js";
import { logger } from "../../utils/logger.js";

// ✅ ADAPTER — bọc nodemailer vào interface IEmailProvider của mình
export class NodemailerEmailProvider implements IEmailProvider {
  private transporter: nodemailer.Transporter;
  private from: string;

  constructor() {
    const host   = process.env.SMTP_HOST     || "smtp.gmail.com";
    const port   = parseInt(process.env.SMTP_PORT || "587", 10);
    const secure = process.env.SMTP_SECURE   === "true";
    const user   = process.env.SMTP_USER     || "";
    const pass   = process.env.SMTP_PASSWORD || "";

    this.from = process.env.SMTP_FROM || `"Classroom System" <no-reply@classroom.com>`;

    // nodemailer có API khác (createTransport, sendMail) →
    // Adapter chuyển nó về sendEmail(options) đơn giản
    this.transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
  }

  public async sendEmail(options: SendEmailOptions): Promise<void> {
    try {
      // nodemailer dùng sendMail({ from, to, subject, html })
      // Adapter map sang interface của mình
      await this.transporter.sendMail({
        from:    this.from,
        to:      options.to,
        subject: options.subject,
        html:    options.html,
      });
      logger.info(`Email sent successfully to ${options.to}`);
    } catch (error) {
      logger.error(`Failed to send email to ${options.to}`, error);
      throw error;
    }
  }
}
```

**Sử dụng trong `assignmentSubscriber.ts`** — subscriber không biết gì về nodemailer:
```typescript
// src/subscribers/assignmentSubscriber.ts
import { NodemailerEmailProvider } from "../services/email/nodemailerProvider.js";

const emailProvider = new NodemailerEmailProvider(); // ← chỉ biết IEmailProvider

// Gửi email thông báo bài tập mới
await emailProvider.sendEmail({
  to:      student.email,
  subject: `[Bài tập mới] Lớp ${payload.className}: ${payload.title}`,
  html:    emailHtml,
});
```

---

#### 📌 3b. MinIO Storage Adapter — MinIO SDK → `IStorageService`

```typescript
// ✅ MinIO SDK có API phức tạp:
//   client.putObject(bucket, name, buffer, size, meta)
//   client.presignedGetObject(bucket, name, ttl, params)

// ✅ ADAPTER (MinioStorageService) đơn giản hóa thành:
//   storageService.uploadFile(buffer, name, mime)  → { url, size }
//   storageService.getPresignedUrl(url, download?) → string

// Caller (DocumentService, AssignmentService) không biết MinIO SDK tồn tại
await this.storageService.uploadFile(file.buffer, file.originalname, file.mimetype);
const url = await this.storageService.getPresignedUrl(att.fileUrl, false, att.fileName);
```

### Sơ đồ

```
Subscriber/Service          «interface»              Third-party
      │                    IEmailProvider             Library
      │  sendEmail(opts) ──►  + sendEmail()  ◄── NodemailerEmailProvider ──► nodemailer
      │                                                                        .createTransport()
      │                                                                        .sendMail()
      │
      │                    IStorageService
      │  uploadFile()    ──►  + uploadFile()  ◄── MinioStorageService ──► MinIO SDK
                              + getPresigned()                               .putObject()
                                                                             .presignedGetObject()
```

---

## 4. Facade

### Phân loại
**Structural Pattern** — Nhóm Cấu Trúc

### Định nghĩa
Cung cấp **một interface đơn giản** phía trước một tập hợp các thao tác phức tạp. Controller/Route handler chỉ gọi một method, không cần biết bên trong phối hợp những gì.

### Khi nào dùng
- Ẩn orchestration logic phức tạp (validate → upload → save DB → emit event)
- Tạo service layer gọn gàng cho controller

### Áp dụng trong dự án

#### 📌 4a. `AssignmentService` — Facade cho luồng tạo bài tập

Controller chỉ gọi một dòng `createAssignment(...)`. Bên trong Facade phối hợp **7 bước**:

```typescript
// src/services/assignment.service.ts
export class AssignmentService {
  private assignmentRepo: AssignmentRepository;   // subsystem 1
  private storageService: IStorageService;         // subsystem 2

  constructor() {
    this.assignmentRepo = new AssignmentRepository();
    this.storageService = new MinioStorageService("classroom-assignments");
  }

  // ✅ FACADE METHOD — Controller gọi đây, không biết các bước bên trong
  public async createAssignment(
    teacherId: string,
    classId: string,
    data: { title: string; description?: string; deadline: string; typeAssignment?: string; questions?: any[]; files?: Express.Multer.File[] }
  ) {
    // Bước 1: Kiểm tra lớp tồn tại & teacher có quyền (Prisma)
    const classRecord = await prisma.classes.findUnique({
      where: { classId },
      select: { teacherId: true, className: true },
    });
    if (!classRecord) throw new NotFoundError("Không tìm thấy lớp học.");
    if (classRecord.teacherId !== teacherId)
      throw new ForbiddenError("Bạn không có quyền giao bài cho lớp học này.");

    // Bước 2: Validate input
    if (!data.title || data.title.trim() === "")
      throw new BadRequestError("Tiêu đề bài tập không được để trống.");

    // Bước 3: Validate câu hỏi trắc nghiệm (nếu là MULTIPLE_CHOICE)
    let validatedQuestions;
    if (data.typeAssignment === "MULTIPLE_CHOICE") {
      validatedQuestions = this.validateQuizQuestions(data.questions ?? []);
    }

    // Bước 4: Tạo bài tập trong DB (AssignmentRepository)
    const assignment = await this.assignmentRepo.createAssignment({ classId, ...data });

    // Bước 5: Lưu câu hỏi trắc nghiệm (nếu có)
    if (validatedQuestions?.length) {
      await this.assignmentRepo.upsertQuizQuestions(assignment.assignmentId, validatedQuestions);
    }

    // Bước 6: Phát sự kiện → Observer pattern gửi email cho học sinh
    eventBus.emit("assignment.created", {
      assignmentId: assignment.assignmentId,
      classId,
      title:       assignment.title,
      description: assignment.description,
      deadline:    assignment.deadline,
      className:   classRecord.className,
      teacherName: (await prisma.users.findUnique({ where: { userId: teacherId }, select: { name: true } }))?.name ?? "Giáo viên",
    });

    // Bước 7: Upload file đính kèm lên MinIO (IStorageService)
    if (data.files?.length) {
      const attachments = [];
      for (const file of data.files) {
        const result = await this.storageService.uploadFile(file.buffer, file.originalname, file.mimetype);
        attachments.push({ fileName: file.originalname, fileUrl: result.url, fileSize: result.size });
      }
      await this.assignmentRepo.createAttachments(assignment.assignmentId, attachments);
    }

    // Bước 8: Trả về kết quả đầy đủ kèm presigned URL
    const created = await this.assignmentRepo.findAssignmentById(assignment.assignmentId);
    return this.serializeAttachments(created);
  }
}
```

**Controller chỉ cần**:
```typescript
// src/controllers/assignment.controller.ts
const result = await assignmentService.createAssignment(teacherId, classId, data);
res.status(201).json(result);
```

---

#### 📌 4b. `AuthService` — Facade cho luồng đăng nhập

```typescript
// src/services/auth.service.ts
export const login = async (data: LoginDTO) => {
  // Bước 1: Kiểm tra brute-force qua Redis (SessionRepo)
  const failedAttempts = await SessionRepo.getFailedLoginAttempts(data.email);
  if (failedAttempts >= 5)
    throw new Error("Tài khoản bị tạm khóa do đăng nhập sai quá 5 lần.");

  // Bước 2: Tìm user trong DB (UserRepo)
  const user = await UserRepo.findUserByEmail(data.email);
  if (!user) {
    await SessionRepo.incrementFailedLoginAttempts(data.email, 900);
    throw new Error("Email hoặc mật khẩu không đúng!");
  }

  // Bước 3: So sánh password (HashStrategy — bcrypt)
  const isMatch = await hashStrategy.compare(data.password, user.passwordHash);
  if (!isMatch) {
    await SessionRepo.incrementFailedLoginAttempts(data.email, 900);
    throw new Error("Email hoặc mật khẩu không đúng!");
  }

  // Bước 4: Reset counter thất bại (SessionRepo → Redis)
  await SessionRepo.resetFailedLoginAttempts(data.email);

  // Bước 5: Tạo access token & refresh token (TokenStrategy — JWT)
  const accessToken  = tokenStrategy.generateAccessToken({ userId: user.userId, role: user.role });
  const refreshToken = tokenStrategy.generateRefreshToken({ userId: user.userId });

  // Bước 6: Lưu refresh token vào Redis (SessionRepo)
  await SessionRepo.saveRefreshToken(user.userId, refreshToken, REFRESH_TOKEN_TTL);

  return { accessToken, refreshToken, user: { userId: user.userId, name: user.name, email: user.email, role: user.role } };
};
```

### Sơ đồ

```
                ┌─────────────────────┐
Controller ────►│   AssignmentService │ (Facade)
                └──────────┬──────────┘
                           │ điều phối
        ┌──────────────────┼───────────────────┐
        ▼                  ▼                   ▼
AssignmentRepository  IStorageService      eventBus
(Prisma/MSSQL)        (MinIO)              (Observer)
```

---

## 5. Strategy

### Phân loại
**Behavioral Pattern** — Nhóm Hành Vi

### Định nghĩa
Đóng gói một thuật toán vào class riêng. Cho phép **hoán đổi thuật toán** mà không thay đổi code sử dụng nó.

### Khi nào dùng
- Có nhiều cách thực hiện cùng một thao tác (hash, sign token, verify)
- Muốn tách biệt logic thuật toán khỏi business logic

### Áp dụng trong dự án

Dự án dùng Strategy cho **2 vấn đề bảo mật**: mã hóa mật khẩu và quản lý JWT token.

#### 📌 5a. `HashStrategy` — Chiến lược mã hóa mật khẩu

```typescript
// src/services/token/hash.strategy.ts
import bcrypt from "bcryptjs";

// ✅ STRATEGY CLASS — đóng gói thuật toán bcrypt
export class HashStrategy {
  // Mã hóa password với bcrypt (salt rounds = 10 mặc định)
  async hash(data: string, saltOrRounds: number | string = 10): Promise<string> {
    return bcrypt.hash(data, saltOrRounds);
  }

  // So sánh password plain text với hash đã lưu
  async compare(data: string, encrypted: string): Promise<boolean> {
    return bcrypt.compare(data, encrypted);
  }
}
```

**Sử dụng trong `auth.service.ts`**:
```typescript
const hashStrategy = new HashStrategy();

// Đăng ký — mã hóa password trước khi lưu
const passwordHash = await hashStrategy.hash(data.password);

// Đăng nhập — kiểm tra password
const isMatch = await hashStrategy.compare(data.password, user.passwordHash);
```

---

#### 📌 5b. `TokenStrategy` — Chiến lược tạo & xác minh JWT

```typescript
// src/services/token/token.strategy.ts
import jwt from "jsonwebtoken";

const JWT_SECRET           = process.env.JWT_SECRET          ?? "classroom_secret_key";
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET ?? "classroom_refresh_secret_key";
const JWT_EXPIRES_IN       = "15m";
const REFRESH_TOKEN_EXPIRES_IN = "7d";

export interface TokenPayload {
  userId: string;
  role:   string;
}

// ✅ STRATEGY CLASS — đóng gói thuật toán JWT
export class TokenStrategy {
  // Tạo access token ngắn hạn (15 phút)
  generateAccessToken(payload: TokenPayload): string {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  }

  // Tạo refresh token dài hạn (7 ngày)
  generateRefreshToken(payload: { userId: string }): string {
    return jwt.sign(payload, REFRESH_TOKEN_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRES_IN });
  }

  // Xác minh access token — ném lỗi nếu hết hạn hoặc không hợp lệ
  verifyAccessToken(token: string): TokenPayload {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  }

  // Xác minh refresh token
  verifyRefreshToken(token: string): { userId: string } {
    return jwt.verify(token, REFRESH_TOKEN_SECRET) as { userId: string };
  }
}
```

**Sử dụng trong `authMiddleware.ts`** — Strategy tách biệt logic JWT khỏi middleware:
```typescript
// src/middlewares/authMiddleware.ts
const tokenStrategy = new TokenStrategy();

export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction): void => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer "))
      throw new UnauthorizedError("Token không hợp lệ hoặc bị thiếu.");

    const token = authHeader.split(" ")[1];

    // ✅ Strategy xử lý verify — middleware không biết JWT hoạt động thế nào
    const decoded = tokenStrategy.verifyAccessToken(token);
    req.user = decoded;
    next();
  } catch (error: any) {
    if (error.name === "TokenExpiredError")
      next(new UnauthorizedError("Token đã hết hạn."));
    else
      next(new UnauthorizedError("Token không hợp lệ."));
  }
};
```

### Sơ đồ

```
                         HashStrategy
auth.service.ts ────────► + hash(data)
                           + compare(data, encrypted)
                                │ sử dụng
                            bcryptjs (ẩn bên trong)


                         TokenStrategy
auth.service.ts ────────► + generateAccessToken(payload)
authMiddleware.ts          + generateRefreshToken(payload)
                           + verifyAccessToken(token)
                           + verifyRefreshToken(token)
                                │ sử dụng
                            jsonwebtoken (ẩn bên trong)
```

> **Lợi ích**: Muốn đổi từ `bcrypt` sang `argon2`, hay từ `jsonwebtoken` sang `jose` → chỉ sửa trong Strategy class, không đụng tới `auth.service.ts` hay `authMiddleware.ts`.

---

## 6. Observer

### Phân loại
**Behavioral Pattern** — Nhóm Hành Vi

### Định nghĩa
Khi **Subject** (nguồn phát sự kiện) thay đổi trạng thái, tất cả **Observers** (người đăng ký lắng nghe) được **thông báo tự động**. Subject không biết Observer là ai — loose coupling.

### Khi nào dùng
- Domain events (assignment created → gửi email học sinh)
- Tách side effects (gửi email) khỏi business logic chính

### Áp dụng trong dự án

#### 📌 6a. `TypedEmitter` & `eventBus` — `src/events/eventBus.ts`

```typescript
// src/events/eventBus.ts
import { EventEmitter } from "events";

// ✅ TYPE-SAFE EVENT MAP — định nghĩa tất cả events và payload kiểu cụ thể
export type EventMap = {
  "assignment.created": [
    payload: {
      assignmentId: string;
      classId:      string;
      title:        string;
      description?: string | null;
      deadline:     Date;
      className:    string;
      teacherName:  string;
    }
  ];
  // Có thể mở rộng thêm: "document.uploaded", "student.joined", ...
};

// ✅ TYPED EMITTER — bọc Node.js EventEmitter với kiểu TypeScript an toàn
class TypedEmitter<T extends Record<string, unknown[]>> {
  private emitter = new EventEmitter();

  public on<K extends keyof T & string>(event: K, listener: (...args: T[K]) => void): void {
    this.emitter.on(event, listener as (...args: unknown[]) => void);
  }

  public off<K extends keyof T & string>(event: K, listener: (...args: T[K]) => void): void {
    this.emitter.off(event, listener as (...args: unknown[]) => void);
  }

  public emit<K extends keyof T & string>(event: K, ...args: T[K]): void {
    this.emitter.emit(event, ...args);
  }
}

// ✅ SUBJECT (module-level Singleton)
export const eventBus = new TypedEmitter<EventMap>();
```

---

#### 📌 6b. `AssignmentSubscriber` (Observer) — `src/subscribers/assignmentSubscriber.ts`

```typescript
// src/subscribers/assignmentSubscriber.ts
import { eventBus } from "../events/eventBus.js";
import { NodemailerEmailProvider } from "../services/email/nodemailerProvider.js";
import prisma from "../config/prisma.js";
import { logger } from "../utils/logger.js";

const emailProvider = new NodemailerEmailProvider();

// ✅ OBSERVER — đăng ký lắng nghe event "assignment.created"
export const initAssignmentSubscriber = () => {
  eventBus.on("assignment.created", async (payload) => {
    try {
      logger.info(`Processing assignment.created notification: ${payload.title}`);

      // Lấy danh sách học sinh đang tham gia lớp
      const enrollments = await prisma.classEnrollments.findMany({
        where: { classId: payload.classId, status: "JOINED" },
        include: { Users: { select: { email: true, name: true } } },
      });

      if (enrollments.length === 0) return;

      const formattedDeadline = new Date(payload.deadline).toLocaleDateString("vi-VN", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      });

      // Tạo email tasks cho tất cả học sinh
      const emailTasks = enrollments.map(async (enrollment) => {
        const student = enrollment.Users;
        if (!student.email) return;

        const emailHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px;">
            <div style="background-color: #4f46e5; color: #fff; padding: 20px; text-align: center;">
              <h1 style="margin:0;">Thông báo bài tập mới</h1>
            </div>
            <div style="padding: 20px;">
              <p>Chào <strong>${student.name}</strong>,</p>
              <p>Giáo viên <strong>${payload.teacherName}</strong> vừa giao bài tập mới trong lớp <strong>${payload.className}</strong>.</p>
              <div style="background-color: #f3f4f6; border-left: 4px solid #4f46e5; padding: 15px; margin: 20px 0;">
                <p><strong>Tiêu đề:</strong> ${payload.title}</p>
                <p><strong>Hạn nộp:</strong> <span style="color: #ef4444;">${formattedDeadline}</span></p>
                ${payload.description ? `<p><strong>Mô tả:</strong> ${payload.description}</p>` : ""}
              </div>
              <p>Vui lòng truy cập hệ thống để làm bài tập đúng hạn.</p>
            </div>
          </div>
        `;

        await emailProvider.sendEmail({
          to:      student.email,
          subject: `[Bài tập mới] Lớp ${payload.className}: ${payload.title}`,
          html:    emailHtml,
        });
      });

      // Gửi bất đồng bộ — không block luồng chính
      Promise.allSettled(emailTasks).then((results) => {
        const ok  = results.filter((r) => r.status === "fulfilled").length;
        const err = results.filter((r) => r.status === "rejected").length;
        logger.info(`Email broadcast "${payload.title}" done. OK: ${ok}, Fail: ${err}`);
      });

    } catch (error) {
      logger.error("Error in assignment.created subscriber:", error);
    }
  });
};
```

---

#### 📌 6c. Khởi động Observer khi ứng dụng start — `src/index.ts`

```typescript
// src/index.ts
import { initAssignmentSubscriber } from "./subscribers/assignmentSubscriber.js";

// ✅ Đăng ký tất cả observers trước khi app nhận request
initAssignmentSubscriber();

const app = express();
// ...
```

---

#### 📌 6d. Subject phát sự kiện — `AssignmentService.createAssignment()`

```typescript
// src/services/assignment.service.ts
// Sau khi tạo bài tập thành công → phát sự kiện
// AssignmentService (Subject) không biết gì về EmailProvider hay SMTP
eventBus.emit("assignment.created", {
  assignmentId: assignment.assignmentId,
  classId,
  title:        assignment.title,
  description:  assignment.description,
  deadline:     assignment.deadline,
  className:    classRecord.className,
  teacherName,
});
```

### Sơ đồ luồng hoàn chỉnh

```
Teacher gọi API POST /api/v1/classes/:classId/assignments
        │
        ▼
AssignmentController
        │
        ▼
AssignmentService.createAssignment()  ← Subject / Facade
  │  1. Validate + lưu DB (Prisma)
  │  2. Upload file (MinIO)
  │  3. eventBus.emit("assignment.created", payload)  ◄── phát sự kiện
        │
        ▼
eventBus (TypedEmitter)
        │
        ▼
initAssignmentSubscriber  ← Observer
  │  1. Query danh sách học sinh (Prisma)
  │  2. Tạo HTML email
  │  3. emailProvider.sendEmail(...)  ← Adapter → nodemailer → Gmail SMTP
  │  (Promise.allSettled — không block response)
```

---

## Tổng Hợp & Quan Hệ Giữa Các Pattern

| Pattern | Nhóm | File(s) trong dự án | Vai trò |
|---|---|---|---|
| **Singleton** | Creational | `src/config/prisma.ts`<br>`src/infrastructure/redisClient.ts` | 1 instance DB + Redis cho toàn app |
| **Factory Method** | Creational | `src/services/storage/minioStorage.ts` | Tạo storage theo interface `IStorageService` |
| **Adapter** | Structural | `src/services/email/nodemailerProvider.ts`<br>`src/services/storage/minioStorage.ts` | Bọc nodemailer & MinIO SDK vào interface của mình |
| **Facade** | Structural | `src/services/assignment.service.ts`<br>`src/services/auth.service.ts` | 1 method cho chuỗi thao tác phức tạp |
| **Strategy** | Behavioral | `src/services/token/hash.strategy.ts`<br>`src/services/token/token.strategy.ts` | Đóng gói bcrypt & JWT |
| **Observer** | Behavioral | `src/events/eventBus.ts`<br>`src/subscribers/assignmentSubscriber.ts` | Gửi email khi có bài tập mới |

### Các pattern kết hợp với nhau

```
Singleton  ──────► Prisma & Redis được dùng bởi mọi pattern khác
                          │
Factory ──────────────────┤  MinioStorageService được tạo theo IStorageService
                          │
Adapter  ─────────────────┤  MinioStorageService, NodemailerEmailProvider bọc SDK thật
                          │
Facade ───────────────────┤  AssignmentService dùng Factory + Adapter + Observer
                          │
Strategy  ────────────────┤  HashStrategy, TokenStrategy dùng trong Facade (AuthService)
                          │
Observer  ─────────────────  AssignmentService (Facade) phát event → Subscriber xử lý email
                             Subscriber dùng Adapter (NodemailerEmailProvider)
```

---

> **Nguyên tắc của dự án:**
> - **Controller** → chỉ gọi **Facade** (Service), không biết repo hay storage
> - **Facade** → phối hợp **Repository** + **Adapter** + **Strategy** + **Observer**
> - **Observer** → xử lý side effect (email) bất đồng bộ, không block response
> - **Adapter** → code của mình không bao giờ gọi trực tiếp `nodemailer` hay `minio` SDK
> - **Strategy** → `bcrypt` và `jwt` đều được đóng gói, dễ swap sau này
