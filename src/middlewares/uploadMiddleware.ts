import multer from "multer";
import { Request, Response, NextFunction } from "express";
import { BadRequestError } from "../errors/index.js";

const storage = multer.memoryStorage();

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // DOCX
  "image/jpeg",
  "image/png",
  "application/zip",
  "application/x-zip-compressed",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
];

const upload = multer({
  storage,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25 MB limit
  },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new BadRequestError("Định dạng tệp không được hỗ trợ."));
    }
  },
});

/**
 * Middleware xử lý upload 1 file và bắt lỗi từ Multer (ví dụ: vượt quá dung lượng)
 */
export const uploadDocumentMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const uploadHandler = upload.single("file");
  
  uploadHandler(req, res, (err: any) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return next(new BadRequestError("Kích thước tệp vượt quá giới hạn 25MB."));
      }
      return next(new BadRequestError(`Lỗi tải tệp: ${err.message}`));
    } else if (err) {
      return next(err); // Bắt lỗi từ fileFilter (ví dụ: sai định dạng)
    }

    if (req.file) {
      req.file.originalname = Buffer.from(req.file.originalname, "latin1").toString("utf8");
    }

    next();
  });
};

/**
 * Middleware xử lý upload nhiều files (dùng cho assignments hoặc submissions)
 */
export const uploadMultipleMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const uploadHandler = upload.array("attachments", 10); // Tối đa 10 file
  
  uploadHandler(req, res, (err: any) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return next(new BadRequestError("Một trong các tệp vượt quá kích thước 25MB."));
      }
      if (err.code === "LIMIT_UNEXPECTED_FILE") {
        return next(new BadRequestError("Vượt quá số lượng tệp tối đa (10)."));
      }
      return next(new BadRequestError(`Lỗi tải tệp: ${err.message}`));
    } else if (err) {
      return next(err);
    }

    if (req.files && Array.isArray(req.files)) {
      req.files.forEach((file) => {
        file.originalname = Buffer.from(file.originalname, "latin1").toString("utf8");
      });
    }

    next();
  });
}; 

/**
 * Middleware xử lý upload nhiều files tài liệu (dùng cho documents)
 */
export const uploadMultipleDocumentsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const uploadHandler = upload.array("files", 10); // Tối đa 10 file
  
  uploadHandler(req, res, (err: any) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return next(new BadRequestError("Một trong các tệp vượt quá kích thước 25MB."));
      }
      if (err.code === "LIMIT_UNEXPECTED_FILE") {
        return next(new BadRequestError("Vượt quá số lượng tệp tối đa (10)."));
      }
      return next(new BadRequestError(`Lỗi tải tệp: ${err.message}`));
    } else if (err) {
      return next(err);
    }
    next();
  });
};


