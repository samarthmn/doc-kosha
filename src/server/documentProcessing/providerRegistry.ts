import type { DocumentProcessingProvider } from "@dockosha/provider-interface";
import { documentProcessingProvider } from "@/server/documentProcessing/provider";

// Compatibility export for engine-only callers. The application facade owns
// the production instance; this helper never resolves a runtime package name.
const provider: DocumentProcessingProvider = documentProcessingProvider;

export const resolveEngineProvider = (): DocumentProcessingProvider => provider;
