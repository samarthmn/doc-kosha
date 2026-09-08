import assert from "node:assert/strict";
import { createServer, Socket } from "node:net";
import test from "node:test";
import nodemailer from "nodemailer";

Object.assign(process.env, {
  NEXT_PUBLIC_APP_ENV: "local",
  NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "dummy",
  NEXT_PUBLIC_GOOGLE_CLIENT_ID: "dummy",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  R2_ACCESS_KEY_ID: "dummy",
  R2_SECRET_ACCESS_KEY: "dummy",
  R2_ENDPOINT: "http://localhost:9000",
  SMTP_HOST: "127.0.0.1",
  SMTP_PORT: "54325",
  SENDER_EMAIL: "sender@example.test",
  NOTIFICATION_SENDER_EMAIL: "alerts@example.test",
  FOUNDER_SENDER_EMAIL: "founder@example.test",
  COOKIE_SECRET: "0123456789abcdef0123456789abcdef",
});

const emailHelper = import("@/server/emailHelper");

type TestSmtpServer = {
  close: () => Promise<void>;
  port: number;
};

const startSmtpServer = async (
  rejectRecipient: boolean,
): Promise<TestSmtpServer> => {
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.setEncoding("utf8");
    socket.on("close", () => sockets.delete(socket));

    let buffer = "";
    let receivingMessage = false;
    socket.write("220 smtp.test ESMTP\r\n");

    socket.on("data", (chunk: string) => {
      buffer += chunk;

      while (true) {
        const newlineIndex = buffer.indexOf("\r\n");
        if (newlineIndex === -1) {
          return;
        }

        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 2);

        if (receivingMessage) {
          if (line === ".") {
            receivingMessage = false;
            socket.write("250 2.0.0 queued\r\n");
          }
          continue;
        }

        if (line.startsWith("EHLO") || line.startsWith("HELO")) {
          socket.write("250-smtp.test\r\n250 SMTPUTF8\r\n");
        } else if (line.startsWith("MAIL FROM:")) {
          socket.write("250 2.1.0 sender accepted\r\n");
        } else if (line.startsWith("RCPT TO:")) {
          socket.write(
            rejectRecipient
              ? "550 5.1.1 recipient rejected\r\n"
              : "250 2.1.5 recipient accepted\r\n",
          );
        } else if (line === "DATA") {
          receivingMessage = true;
          socket.write("354 end with <CR><LF>.<CR><LF>\r\n");
        } else if (line === "QUIT") {
          socket.end("221 2.0.0 bye\r\n");
        }
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  assert.ok(address && typeof address !== "string");

  return {
    port: address.port,
    close: async () => {
      for (const socket of sockets) {
        socket.destroy();
      }
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
};

const createTestTransport = (port: number) =>
  nodemailer.createTransport({
    host: "127.0.0.1",
    port,
    secure: false,
    ignoreTLS: true,
  });

test("sendEmailWithTransport resolves a Nodemailer 9 SMTP delivery result", async (t) => {
  const { sendEmailWithTransport } = await emailHelper;
  const smtp = await startSmtpServer(false);
  t.after(smtp.close);

  const info = await sendEmailWithTransport(createTestTransport(smtp.port), {
    from: "DocKosha <sender@example.test>",
    to: "recipient@example.test",
    subject: "SMTP success",
    text: "Delivery succeeded.",
  });

  assert.deepEqual(info.accepted, ["recipient@example.test"]);
  assert.deepEqual(info.rejected, []);
});

test("sendEmailWithTransport propagates a Nodemailer 9 SMTP recipient rejection", async (t) => {
  const { sendEmailWithTransport } = await emailHelper;
  const smtp = await startSmtpServer(true);
  t.after(smtp.close);

  await assert.rejects(
    () =>
      sendEmailWithTransport(createTestTransport(smtp.port), {
        from: "DocKosha <sender@example.test>",
        to: "recipient@example.test",
        subject: "SMTP rejection",
        text: "Delivery fails.",
      }),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "EENVELOPE" &&
      "responseCode" in error &&
      error.responseCode === 550,
  );
});
