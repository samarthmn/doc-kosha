import type {
  DocumentProcessingProvider,
  ProviderBinary,
} from "@dockosha/provider-interface";
import { createProvider } from "@samarthmn/dockosha-provider-docyantra";

export const getEngineProvider = (): DocumentProcessingProvider => {
  return createProvider();
};

export const countPages = async (pdf: ProviderBinary): Promise<number> => {
  const result = await getEngineProvider().pageCount(pdf);
  if (!result.ok) {
    throw new Error(`page count failed: ${result.code}: ${result.message}`);
  }
  return result.pageCount;
};
