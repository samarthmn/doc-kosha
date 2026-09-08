import nodemailer, { SentMessageInfo } from "nodemailer";
import { Options } from "nodemailer/lib/mailer";
import { serverEnv } from "@/lib/env";

type EmailLane = "auth" | "app";

type ResolvedMailLane = {
  defaultFrom: string;
  transport: ReturnType<typeof nodemailer.createTransport>;
};

const formatSender = (name: string, email: string): string =>
  `${name} <${email}>`;

const createTransport = (args: {
  host: string;
  port: number;
  user?: string;
  pass?: string;
}) =>
  nodemailer.createTransport({
    host: args.host,
    port: args.port,
    disableFileAccess: true,
    disableUrlAccess: true,
    ...(args.user && args.pass
      ? {
          auth: {
            user: args.user,
            pass: args.pass,
          },
        }
      : {}),
  });

const transport = createTransport({
  host: serverEnv.SMTP_HOST,
  port: serverEnv.SMTP_PORT,
  user: serverEnv.SMTP_USER,
  pass: serverEnv.SMTP_PASS,
});

const authLane: ResolvedMailLane = {
  defaultFrom: formatSender("DocKosha", serverEnv.SENDER_EMAIL),
  transport,
};

const appLane: ResolvedMailLane = {
  defaultFrom: formatSender(
    "DocKosha Alerts",
    serverEnv.NOTIFICATION_SENDER_EMAIL,
  ),
  transport,
};

export const sendEmailWithTransport = async (
  transport: ReturnType<typeof nodemailer.createTransport>,
  mailOptions: Options,
): Promise<SentMessageInfo> =>
  await new Promise<SentMessageInfo>((resolve, reject) => {
    transport.sendMail(mailOptions, (error, info) => {
      if (error) {
        return reject(error);
      }
      return resolve(info);
    });
  });

const sendLaneEmail = async (
  lane: EmailLane,
  mailOptions: Options,
): Promise<SentMessageInfo> => {
  const resolvedLane = lane === "auth" ? authLane : appLane;
  const normalizedOptions: Options = mailOptions.from
    ? mailOptions
    : { ...mailOptions, from: resolvedLane.defaultFrom };

  return await sendEmailWithTransport(
    resolvedLane.transport,
    normalizedOptions,
  );
};

export const sendAuthEmail = async (
  mailOptions: Options,
): Promise<SentMessageInfo> => await sendLaneEmail("auth", mailOptions);

export const sendAppEmail = async (
  mailOptions: Options,
): Promise<SentMessageInfo> => await sendLaneEmail("app", mailOptions);
