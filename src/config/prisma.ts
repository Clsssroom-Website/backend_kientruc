import { PrismaMssql } from "@prisma/adapter-mssql";
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config();

class DatabaseManager {

  private static instance: DatabaseManager;

  private readonly prismaClient: PrismaClient;

  private constructor() {
    const port = Number.parseInt(process.env.DB_PORT ?? "1433", 10);

    const mssqlConfig = {
      server: process.env.DB_SERVER ?? "localhost",
      port,
      database: process.env.DB_NAME ?? "ClassroomWebsite",
      user: process.env.DB_USER ?? "sa",
      password: process.env.DB_PASSWORD ?? "1234",
      options: {
        encrypt: true,
        trustServerCertificate: true,
      },
    };

    const adapter = new PrismaMssql(mssqlConfig);
    this.prismaClient = new PrismaClient({ adapter });

    console.log("PrismaClient instance created.");
  }

  static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  get client(): PrismaClient {
    return this.prismaClient;
  }
}

// Export client ngay từ Singleton — tương thích ngược với toàn bộ import hiện tại
const prisma = DatabaseManager.getInstance().client;

export { DatabaseManager };
export default prisma;

