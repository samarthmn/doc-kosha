import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { expect } from "@playwright/test";

import {
  toR2Key,
  type LogicalBucket,
} from "../../../src/server/storage/r2Keys";
import { getE2EEnv } from "./env";

const bucket = "dockosha";
const localHostnames = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);

export type TestStorageObject = {
  logicalBucket: LogicalBucket;
  path: string;
};

let client: S3Client | null = null;

const getLocalClient = (): S3Client => {
  if (client) return client;

  const endpoint = getE2EEnv().R2_ENDPOINT;
  const hostname = new URL(endpoint).hostname;
  if (!localHostnames.has(hostname)) {
    throw new Error(
      `E2E object helpers are local-only; refusing R2 endpoint ${endpoint}`,
    );
  }

  client = new S3Client({
    endpoint,
    region: "us-east-1",
    forcePathStyle: true,
    credentials: {
      accessKeyId: "minioadmin",
      secretAccessKey: "minioadmin",
    },
  });
  return client;
};

const testObjectExists = async (
  object: TestStorageObject,
): Promise<boolean> => {
  try {
    await getLocalClient().send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: toR2Key(object.logicalBucket, object.path),
      }),
    );
    return true;
  } catch (error) {
    if (
      error instanceof S3ServiceException &&
      (error.name === "NotFound" || error.$metadata.httpStatusCode === 404)
    ) {
      return false;
    }
    throw error;
  }
};

export const putTestObject = async (
  object: TestStorageObject,
  body: string | Uint8Array = "document lifecycle e2e fixture",
): Promise<void> => {
  await getLocalClient().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: toR2Key(object.logicalBucket, object.path),
      Body: body,
      ContentType: "application/octet-stream",
    }),
  );
};

export const expectTestObjectExists = async (
  object: TestStorageObject,
): Promise<void> => {
  await expect
    .poll(() => testObjectExists(object), {
      message: `Expected ${toR2Key(object.logicalBucket, object.path)} to exist`,
    })
    .toBe(true);
};

export const expectTestObjectMissing = async (
  object: TestStorageObject,
): Promise<void> => {
  await expect
    .poll(() => testObjectExists(object), {
      message: `Expected ${toR2Key(object.logicalBucket, object.path)} to be absent`,
    })
    .toBe(false);
};
