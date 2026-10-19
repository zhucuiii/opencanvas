import { afterAll, expect, test } from "bun:test";

const values = new Map<string, string>();
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
    },
});
afterAll(() => {
    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
    else Reflect.deleteProperty(globalThis, "localStorage");
});

const { API_PROTOCOL_PRESETS, apiProtocolPresetForChannel, applyApiProtocolPreset } = await import("../src/stores/use-config-store");

const channel = {
    id: "relay",
    name: "Internal relay",
    baseUrl: "https://relay.example.com/v1",
    apiKey: "secret-key",
    apiFormat: "openai" as const,
    models: [{ name: "gpt-image-1", capability: "image" as const, script: "return 1;" }],
};

test("official presets fill only protocol and endpoint", () => {
    const next = applyApiProtocolPreset(channel, "gemini");
    expect(next).toMatchObject({
        apiFormat: "gemini",
        baseUrl: "https://generativelanguage.googleapis.com",
        apiKey: channel.apiKey,
        models: channel.models,
    });
    expect(next.name).toBe(channel.name);
    expect(next.models[0].script).toBe("return 1;");
});

test("the compatible relay preset keeps a custom endpoint", () => {
    const next = applyApiProtocolPreset(channel, "openai-compatible");
    expect(next.apiFormat).toBe("openai");
    expect(next.baseUrl).toBe(channel.baseUrl);
    expect(next.apiKey).toBe(channel.apiKey);
    expect(next.models).toBe(channel.models);
});

test("preset detection distinguishes official, relay, and Gemini endpoints", () => {
    expect(apiProtocolPresetForChannel({ apiFormat: "openai", baseUrl: "https://api.openai.com/" })?.id).toBe("openai");
    expect(apiProtocolPresetForChannel(channel)?.id).toBe("openai-compatible");
    expect(apiProtocolPresetForChannel({ apiFormat: "gemini", baseUrl: "https://generativelanguage.googleapis.com/" })?.id).toBe("gemini");
});

test("the preset list starts with official OpenAI and contains native Gemini", () => {
    expect(API_PROTOCOL_PRESETS[0].id).toBe("openai");
    expect(API_PROTOCOL_PRESETS.some((preset) => preset.id === "gemini" && preset.apiFormat === "gemini")).toBe(true);
});
