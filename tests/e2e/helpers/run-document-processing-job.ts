import { processDocumentProcessingJob } from "@/server/documentProcessingQueue";

const main = async (): Promise<void> => {
  const [documentId, workspaceId, forceValue] = process.argv.slice(2);
  if (!documentId || !workspaceId) {
    throw new Error("documentId and workspaceId are required");
  }

  await processDocumentProcessingJob(
    { documentId, workspaceId },
    { force: forceValue === "true" },
  );
};

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
