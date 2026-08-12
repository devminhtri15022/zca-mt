import type { ImageMetadataGetter, ImageMetadataGetterResponse } from "./context.js";
import { ValidationError } from "./Errors/ValidationError.js";

/**
 * Wraps a user-supplied `imageMetadataGetter` with validation, so a getter
 * that returns a partial result (e.g. missing `width`/`height` because the
 * underlying image library couldn't read them) fails fast with a clear
 * {@link ValidationError} instead of silently sending malformed data to
 * Zalo's upload endpoint.
 *
 * This is optional — ZCA-MT does not wrap your getter automatically.
 *
 * @example
 * ```ts
 * const zca = new ZcaMT({
 *     imageMetadataGetter: withImageMetadataValidation(myGetter),
 * });
 * ```
 */
export function withImageMetadataValidation(getter: ImageMetadataGetter): ImageMetadataGetter {
    return async (filePath: string): Promise<ImageMetadataGetterResponse> => {
        const result = await getter(filePath);
        if (!result) return result;

        if (typeof result.width !== "number" || Number.isNaN(result.width) || result.width <= 0) {
            throw new ValidationError(`imageMetadataGetter returned an invalid "width" for ${filePath}`, {
                field: "width",
            });
        }
        if (typeof result.height !== "number" || Number.isNaN(result.height) || result.height <= 0) {
            throw new ValidationError(`imageMetadataGetter returned an invalid "height" for ${filePath}`, {
                field: "height",
            });
        }
        if (typeof result.size !== "number" || Number.isNaN(result.size) || result.size < 0) {
            throw new ValidationError(`imageMetadataGetter returned an invalid "size" for ${filePath}`, {
                field: "size",
            });
        }

        return result;
    };
}
