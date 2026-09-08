// R2 Storage Adapter - barrel export
export { type LogicalBucket } from "./r2Keys";
export {
  presignPutObject,
  presignGetObject,
  downloadToBuffer,
  putBuffer,
  deleteObject,
  deleteMany,
  deleteObjectsByPrefix,
  headObject,
} from "./r2";

export {
  getObjectByteLength,
  downloadToBufferBounded,
  openExactObjectStream,
} from "./boundedObject";

export {
  createMultipartUpload,
  presignUploadPart,
  completeMultipartUpload,
  abortMultipartUpload,
} from "./r2Multipart";
