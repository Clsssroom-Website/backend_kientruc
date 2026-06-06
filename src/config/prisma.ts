import { PrismaMssql } from "@prisma/adapter-mssql";
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config();

const port = Number.parseInt(process.env.DB_PORT ?? "1433", 10);

const config = {
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

const adapter = new PrismaMssql(config);
const prisma = new PrismaClient({ adapter });

export default prisma;
