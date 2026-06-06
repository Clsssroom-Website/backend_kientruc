import { Client } from "minio";
import { InternalServerError } from "../../errors/index.js";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";

dotenv.config();

export interface IStorageService {
  uploadFile(fileBuffer: Buffer, originalName: string, mimeType: string): Promise<{ url: string; size: number }>;
  getPresignedUrl(fileUrl: string, forceDownload?: boolean, fileName?: string): Promise<string>;
}

export class MinioStorageService implements IStorageService {
  private client: Client;
  private bucketName: string;

  constructor(bucketName?: string) {
    this.bucketName = bucketName || process.env.MINIO_BUCKET_NAME || "classroom-documents";
    this.client = new Client({
      endPoint: process.env.MINIO_ENDPOINT || "127.0.0.1",
      port: parseInt(process.env.MINIO_PORT || "9000", 10),
      useSSL: process.env.MINIO_USE_SSL === "true",
      accessKey: process.env.MINIO_ACCESS_KEY || "minioadmin",
      secretKey: process.env.MINIO_SECRET_KEY || "minioadmin",
    });

    this.initializeBucket();
  }

  private async initializeBucket() {
    try {
      const exists = await this.client.bucketExists(this.bucketName);
      if (!exists) {
        await this.client.makeBucket(this.bucketName, "us-east-1");
      }
    } catch (error) {
      console.error("Error initializing MinIO bucket:", error);
    }
  }

  public async uploadFile(fileBuffer: Buffer, originalName: string, mimeType: string): Promise<{ url: string; size: number }> {
    try {
      const extension = originalName.split('.').pop();
      const uniqueFileName = `${uuidv4()}.${extension}`;
      
      const metaData = {
        'Content-Type': mimeType,
      };

      await this.client.putObject(this.bucketName, uniqueFileName, fileBuffer, fileBuffer.length, metaData);

      // Return a path that can be used to generate a presigned URL or construct a public URL
      const fileUrl = `${this.bucketName}/${uniqueFileName}`; 
      
      return {
        url: fileUrl,
        size: fileBuffer.length,
      };
    } catch (error) {
      console.error("MinIO upload error:", error);
      throw new InternalServerError("Error uploading file to storage server.");
    }
  }

 
  public async deleteFile(fileUrl: string): Promise<void> {
    try {
      // fileUrl có định dạng "classroom-documents/filename.ext" do uploadFile trả về
      const parts = fileUrl.split("/");
      const objectName = parts.slice(1).join("/"); // Lấy phần filename
      if (objectName) {
        await this.client.removeObject(this.bucketName, objectName);
      }
    } catch (error) {
      console.error("MinIO delete error:", error);
      // Không ném lỗi ra ngoài để tránh kẹt ứng dụng khi file không tồn tại
    }
  }

  public async getPresignedUrl(fileUrl: string, forceDownload: boolean = false, fileName?: string): Promise<string> {
    const objectName = fileUrl.split("/").slice(1).join("/");
    
    let reqParams: any = {};
    const name = fileName || "download";
    if (forceDownload) {
      // Bắt buộc trình duyệt tải xuống thay vì hiển thị
      reqParams["response-content-disposition"] = `attachment; filename="${name}"`;
    } else {
      // Bắt buộc trình duyệt xem trực tiếp (inline)
      reqParams["response-content-disposition"] = `inline; filename="${name}"`;
    }
    
    return await this.client.presignedGetObject(this.bucketName, objectName, 24 * 60 * 60, reqParams);
  }
}
