import { afterAll, expect, test } from "bun:test";
import type { AiConfig } from "../src/stores/use-config-store";

// Config 与 i18n 在模块初始化阶段就会读 localStorage，桩必须在 import 之前装好。
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

const { defaultConfig, resolveModelForCapability } = await import("../src/stores/use-config-store");
const { MODEL_CONFIG_KEY, buildGenerationConfig, generationModeOf } = await import("../src/lib/canvas/canvas-generation-helpers");
const { CanvasNodeType } = await import("../src/types/canvas");

/**
 * 「这次用了模型 1，下次新建节点自动还是模型 1」这条链路的验证。
 *
 * 链路三段：
 *   1. 在节点上换模型 → handleConfigNodeChange 写回 config[MODEL_CONFIG_KEY[mode]]
 *   2. 新建节点 → 空节点 metadata 不带 model（由 NODE_SPECS 保证）
 *   3. 生成时 buildGenerationConfig → 回落到 config[xxxModel]
 *
 * 这里验证第 1 段的映射和第 3 段的回落。
 */

/** 最小可用配置：一条渠道，四种能力各两个可选模型。 */
function configWith(models: Partial<Record<"image" | "video" | "text" | "audio", string>>): AiConfig {
    const named = (capability: "image" | "video" | "text" | "audio", name: string) => ({ name, capability });
    return {
        ...defaultConfig,
        channels: [
            {
                id: "ch1",
                name: "test",
                enabled: true,
                baseUrl: "https://example.test/v1",
                apiKey: "k",
                apiFormat: "openai",
                models: [
                    named("image", models.image ?? "img-default"),
                    named("video", models.video ?? "vid-default"),
                    named("text", models.text ?? "txt-default"),
                    named("audio", models.audio ?? "aud-default"),
                    named("image", "img-second"),
                    named("video", "vid-second"),
                    named("text", "txt-second"),
                    named("audio", "aud-second"),
                ],
            },
        ],
        imageModel: models.image ?? "img-default",
        videoModel: models.video ?? "vid-default",
        textModel: models.text ?? "txt-default",
        audioModel: models.audio ?? "aud-default",
    } as AiConfig;
}

test("四种生成模式各自对应一个独立的配置字段", () => {
    expect(MODEL_CONFIG_KEY.image).toBe("imageModel");
    expect(MODEL_CONFIG_KEY.video).toBe("videoModel");
    expect(MODEL_CONFIG_KEY.text).toBe("textModel");
    expect(MODEL_CONFIG_KEY.audio).toBe("audioModel");

    // 四个键互不相同 —— 否则「图片节点换模型」会连带动到别的能力。
    expect(new Set(Object.values(MODEL_CONFIG_KEY)).size).toBe(4);
});

test("节点类型推出的生成模式与节点面板的 defaultMode 一致", () => {
    expect(generationModeOf(CanvasNodeType.Text)).toBe("text");
    expect(generationModeOf(CanvasNodeType.Video)).toBe("video");
    expect(generationModeOf(CanvasNodeType.Audio)).toBe("audio");
    expect(generationModeOf(CanvasNodeType.Image)).toBe("image");
    // 配置节点按 metadata.generationMode 决定能力，这里按图片兜底。
    expect(generationModeOf(CanvasNodeType.Config)).toBe("image");
});

test("在图片节点上换模型后，新建空节点沿用该模型", () => {
    // 第 1 段：模拟 handleConfigNodeChange 的回写
    const updated = configWith({ image: "img-default" });
    updated[MODEL_CONFIG_KEY.image] = "img-second";

    // 第 2 段：新节点没有自己的 model
    const freshNode = { id: "n1", type: CanvasNodeType.Image, metadata: { content: "", status: "idle" } };

    // 第 3 段：生成配置回落到全局 imageModel
    expect(buildGenerationConfig(updated, freshNode as never, "image").model).toBe("img-second");
});

test("换图片模型不会影响视频/文本/音频的默认模型", () => {
    const config = configWith({});
    config.imageModel = "img-second";

    expect(config.videoModel).toBe("vid-default");
    expect(config.textModel).toBe("txt-default");
    expect(config.audioModel).toBe("aud-default");

    // 新建空视频节点仍拿到视频自己的默认模型
    const videoNode = { id: "v1", type: CanvasNodeType.Video, metadata: { content: "", status: "idle" } };
    expect(buildGenerationConfig(config, videoNode as never, "video").model).toBe("vid-default");
});

test("节点自己存的 model 优先于全局默认（已生成节点不被改掉）", () => {
    const config = configWith({ image: "img-default" });
    const existingNode = {
        id: "n2",
        type: CanvasNodeType.Image,
        metadata: { content: "x", status: "success", model: "img-second" },
    };
    expect(buildGenerationConfig(config, existingNode as never, "image").model).toBe("img-second");
});

test("配置节点按 metadata.generationMode 决定回写到哪个字段", () => {
    const configNode = { id: "c1", type: CanvasNodeType.Config, metadata: { generationMode: "video" } };
    const mode = configNode.metadata.generationMode ?? generationModeOf(configNode.type);
    expect(mode).toBe("video");
    expect(MODEL_CONFIG_KEY[mode]).toBe("videoModel");
});

test("切回原模型后解析结果同步回原值（幂等，不会残留）", () => {
    const config = configWith({ image: "img-default" });
    config.imageModel = "img-second";
    config.imageModel = "img-default";
    expect(resolveModelForCapability(config, undefined, "image")).toBe("img-default");
});
