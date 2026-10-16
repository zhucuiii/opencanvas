import { afterAll, expect, test } from "bun:test";
import axios from "axios";

const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: () => null, setItem: () => {}, removeItem: () => {} } });
const { defaultConfig } = await import("../src/stores/use-config-store");
const { requestGeneration, requestEdit } = await import("../src/services/api/image");
const adapter = axios.defaults.adapter;
afterAll(() => {
    axios.defaults.adapter = adapter;
    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
    else Reflect.deleteProperty(globalThis, "localStorage");
});

test("generation sends selected format and moderation without JPEG transparency", async () => {
    let body: Record<string, unknown> = {};
    axios.defaults.adapter = async (request) => {
        body = JSON.parse(request.data);
        return { data: { data: [{ b64_json: "/9j/test" }] }, status: 200, statusText: "OK", headers: {}, config: request };
    };
    const images = await requestGeneration({ ...defaultConfig, imageOutputFormat: "jpeg", imageModeration: "low", background: "transparent" }, "test");
    expect(body.output_format).toBe("jpeg");
    expect(body.moderation).toBe("low");
    expect(body.background).toBeUndefined();
    expect(body.response_format).toBeUndefined();
    expect(images[0].dataUrl).toStartWith("data:image/jpeg;");
});

test("image edits forward WebP transparency and preserve response MIME", async () => {
    let body: FormData | undefined;
    axios.defaults.adapter = async (request) => {
        body = request.data;
        return { data: { data: [{ b64_json: "UklGRtest" }] }, status: 200, statusText: "OK", headers: {}, config: request };
    };
    const images = await requestEdit({ ...defaultConfig, imageOutputFormat: "webp", imageModeration: "low", background: "transparent" }, "test", []);
    expect(body?.get("output_format")).toBe("webp");
    expect(body?.get("moderation")).toBe("low");
    expect(body?.get("background")).toBe("transparent");
    expect(images[0].dataUrl).toStartWith("data:image/webp;");
});
