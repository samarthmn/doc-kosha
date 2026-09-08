let createProviderCalls = 0;

export const createProvider = () => {
  createProviderCalls += 1;
  return {
    id: "fixture-engine",
    capabilities: new Set(["merge", "page_count"]),
    async mergeAndWatermark() {
      return { ok: true, pdf: new ArrayBuffer(1) };
    },
    async pageCount() {
      return { ok: true, pageCount: 1 };
    },
  };
};

export const getCreateProviderCalls = () => createProviderCalls;
