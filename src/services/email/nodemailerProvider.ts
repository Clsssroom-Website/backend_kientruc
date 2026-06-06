import nodemailer from "nodemailer";
import { IEmailProvider, SendEmailOptions } from "./emailProvider.js";
import { logger } from "../../utils/logger.js";

export class NodemailerEmailProvider implements IEmailProvider {
  private transporter: nodemailer.Transporter;
  private from: string;
  
  constructor() {
    const host = process.env.SMTP_HOST || "smtp.gmail.com";
    const port = parseInt(process.env.SMTP_PORT || "587", 10);
    const secure = process.env.SMTP_SECURE === "true";
    const user = process.env.SMTP_USER || "";
    const pass = process.env.SMTP_PASSWORD || "";
    this.from = process.env.SMTP_FROM || `"Classroom System" <no-reply@classroom.com>`;
    console.log("SMTP Configuration:", {
    host,
    port,
    secure,
    user,
    pass,
  });
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user,
        pass,
      },
    });
  }

  public async sendEmail(options: SendEmailOptions): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.from,
        to: options.to,
        subject: options.subject,
        html: options.html,
      });
      logger.info(`Email sent successfully to ${options.to}`);
    } catch (error) {
      logger.error(`Failed to send email to ${options.to}`, error);
      throw error;
    }
  }
}
