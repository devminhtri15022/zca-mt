import { describe, expect, it } from "vitest";
import { withImageMetadataValidation } from "../../src/imageMetadata.js";
import { ValidationError } from "../../src/Errors/ValidationError.js";

describe("withImageMetadataValidation", () => {
    it("passes through a valid result unchanged", async () => {
        const getter = withImageMetadataValidation(async () => ({ width: 100, height: 200, size: 1234 }));
        await expect(getter("photo.jpg")).resolves.toEqual({ width: 100, height: 200, size: 1234 });
    });

    it("passes through null unchanged (getter explicitly failed)", async () => {
        const getter = withImageMetadataValidation(async () => null);
        await expect(getter("photo.jpg")).resolves.toBeNull();
    });

    it("throws ValidationError when width is missing", async () => {
        const getter = withImageMetadataValidation(async () => ({ width: undefined, height: 200, size: 10 }) as never);
        await expect(getter("photo.jpg")).rejects.toBeInstanceOf(ValidationError);
    });

    it("throws ValidationError when height is zero or negative", async () => {
        const getter = withImageMetadataValidation(async () => ({ width: 10, height: 0, size: 10 }));
        await expect(getter("photo.jpg")).rejects.toMatchObject({ field: "height" });
    });

    it("throws ValidationError when size is negative", async () => {
        const getter = withImageMetadataValidation(async () => ({ width: 10, height: 10, size: -1 }));
        await expect(getter("photo.jpg")).rejects.toMatchObject({ field: "size" });
    });
});
