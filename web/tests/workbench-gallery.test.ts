import { expect, test } from "bun:test";
import { imageDownloadExtension, matchesGalleryFilter } from "../src/lib/workbench-gallery";
import { base64ImageSource, imageOutputOptions } from "../src/lib/image-output";

test("gallery searches prompts, models and parameters without case sensitivity", () => {
    expect(matchesGalleryFilter("success", "Moon GPT-IMAGE 1024x1024", "all", " gpt-image ")).toBe(true);
    expect(matchesGalleryFilter("failed", "Moon", "success", "moon")).toBe(false);
    expect(matchesGalleryFilter("pending", "Moon", "pending", "sun")).toBe(false);
    expect(matchesGalleryFilter("pending", "Moon", "pending", "")).toBe(true);
});

test("JPEG never sends an unsupported transparent background", () => {
    expect(imageOutputOptions({ imageOutputFormat: "jpeg", background: "transparent" })).toEqual({ output_format: "jpeg" });
    expect(imageOutputOptions({ imageOutputFormat: "webp", background: "transparent", imageModeration: "low" })).toEqual({ output_format: "webp", background: "transparent", moderation: "low" });
    expect(imageOutputOptions({})).toEqual({ output_format: "png" });
});

test("base64 MIME types follow the actual format returned by compatible providers", () => {
    expect(base64ImageSource("/9j/test")).toStartWith("data:image/jpeg;");
    expect(base64ImageSource("UklGRtest")).toStartWith("data:image/webp;");
    expect(base64ImageSource("iVBORtest", "webp")).toStartWith("data:image/png;");
    expect(base64ImageSource("unknown", "webp")).toStartWith("data:image/webp;");
});

test("download extensions match the stored MIME type", () => {
    expect(imageDownloadExtension("image/jpeg")).toBe("jpg");
    expect(imageDownloadExtension("image/webp")).toBe("webp");
    expect(imageDownloadExtension()).toBe("png");
});
