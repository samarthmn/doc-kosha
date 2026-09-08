import type { Options } from "nodemailer/lib/mailer";

export type EmailContent = {
  subject: string;
  html: string;
  text: string;
  attachments?: Options["attachments"];
};
