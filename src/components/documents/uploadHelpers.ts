import { ALL_SUPPORTED_EXTENSIONS } from "@/lib/constants";
import { showInfo } from "@/lib/toast";

const allowedExtensions = new Set<string>(
  ALL_SUPPORTED_EXTENSIONS as readonly string[],
);

export const filterSupportedFiles = (
  picked: File[] | FileList,
  allowed: ReadonlySet<string> = allowedExtensions,
  supportedTypesHint?: string,
): File[] => {
  const accepted: File[] = [];
  const rejected: string[] = [];
  Array.from(picked as ArrayLike<File>).forEach((f) => {
    const name = f.name;
    const ext = (name.split(".").pop() || "").toLowerCase();
    if (allowed.has(ext)) accepted.push(f);
    else rejected.push(name);
  });
  if (rejected.length) {
    const shown = rejected.slice(0, 3).join(", ");
    const overflow =
      rejected.length > 3 ? ` and ${rejected.length - 3} more` : "";
    const hint = supportedTypesHint ? ` Supported: ${supportedTypesHint}.` : "";
    showInfo(
      `Skipped ${rejected.length} unsupported file${rejected.length === 1 ? "" : "s"}: ${shown}${overflow}.${hint}`,
    );
  }
  return accepted;
};
