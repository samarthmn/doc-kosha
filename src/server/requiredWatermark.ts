import {
  createEngineFailure,
  normalizeEngineError,
  toFailureResult,
  type EngineFailureResult,
} from "@/server/engineErrors";

type WatermarkAttempt<T> = { ok: true; value: T } | EngineFailureResult;

type RequiredWatermarkResult<T> = WatermarkAttempt<T>;

type ApplyRequiredWatermarkOptions<TDefinition, TOutput> = {
  definition: TDefinition | null;
  apply: (definition: TDefinition) => Promise<WatermarkAttempt<TOutput>>;
};

export const applyRequiredWatermark = async <TDefinition, TOutput>(
  options: ApplyRequiredWatermarkOptions<TDefinition, TOutput>,
): Promise<RequiredWatermarkResult<TOutput>> => {
  if (!options.definition) {
    return toFailureResult(
      createEngineFailure({
        code: "missing_asset",
        message: "Required watermark is not configured.",
        operation: "watermark",
        format: "pdf",
      }),
    );
  }

  try {
    return await options.apply(options.definition);
  } catch (error) {
    return toFailureResult(
      normalizeEngineError(error, {
        operation: "watermark",
        format: "pdf",
        fallbackMessage: "Required watermarking failed.",
      }),
    );
  }
};
