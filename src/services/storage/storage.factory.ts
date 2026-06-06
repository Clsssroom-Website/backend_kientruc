import { MinioStorageService, IStorageService } from "./minioStorage.js";

export type StorageBucket =
  | "classroom-documents"
  | "classroom-assignments"
  | "classroom-submissions";

type StorageProvider = "minio";

export function createStorageService(bucket: StorageBucket): IStorageService {
  const provider = (process.env.STORAGE_PROVIDER ?? "minio") as StorageProvider;

  switch (provider) {
    case "minio":
      return new MinioStorageService(bucket);
    default:
      throw new Error(`Unknown storage provider: "${provider}"`);
  }
}
