import { defaultConfig, resolveModelForCapability, type AiConfig } from "@/stores/use-config-store";
import i18n from "@/i18n";
import { ensureImagePreview, resolveImageUrl, uploadImage } from "@/services/image-storage";
import { resolveMediaUrl } from "@/services/file-storage";
import { imageMetadata, referenceUrl } from "@/lib/canvas/canvas-node-factory";
import { computeMediaSize, computeVideoSize, inferMediaScale } from "@/lib/media-size";
import { nanoid } from "nanoid";
import type { NodeGenerationInput } from "@/components/canvas/canvas-node-generation";
import type { CanvasNodeGenerationMode } from "@/components/canvas/canvas-node-prompt-panel";
import type { CanvasImageAngleParams } from "@/components/canvas/canvas-node-angle-dialog";
import type { ReferenceImage } from "@/types/image";
import { CanvasNodeType, type CanvasAssistantSession, type CanvasConnection, type CanvasGenerationMode, type CanvasNodeData, type CanvasNodeMetadata } from "@/types/canvas";

export function generationRequestId() {
    return `generation-${nanoid(12)}`;
}

export function startGenerationMetadata(metadata: CanvasNodeMetadata | undefined, mode: CanvasGenerationMode, previous?: CanvasNodeMetadata["generationRequest"]): CanvasNodeMetadata {
    // A completed/canceled request starts a new id; retrying an unknown request
    // keeps its id so the same logical operation is not counted as a new one.
    const isResumable = previous?.status === "running" || previous?.status === "unknown";
    return {
        ...metadata,
        status: "loading",
        errorDetails: undefined,
        generationRequest: {
            id: isResumable ? previous.id : generationRequestId(),
            mode,
            status: "running",
            startedAt: new Date().toISOString(),
            attempts: (isResumable ? previous.attempts : 0) + 1,
        },
    };
}

export function markGenerationRequestUnknown(metadata: CanvasNodeMetadata | undefined, reason: string): CanvasNodeMetadata {
    if (!metadata?.generationRequest) return { ...metadata, status: "error", errorDetails: reason };
    return {
        ...metadata,
        status: "error",
        errorDetails: reason,
        recovery: "unknown",
        generationRequest: { ...metadata.generationRequest, status: "unknown", lastError: reason },
    };
}

export function markGenerationRequestCanceled(metadata: CanvasNodeMetadata | undefined): CanvasNodeMetadata {
    if (!metadata?.generationRequest) return { ...metadata, status: "idle", errorDetails: undefined };
    return {
        ...metadata,
        status: "idle",
        errorDetails: undefined,
        recovery: "canceled",
        generationRequest: { ...metadata.generationRequest, status: "canceled", lastError: undefined },
    };
}

export function clearGenerationRequestMetadata(metadata: CanvasNodeMetadata | undefined): CanvasNodeMetadata {
    if (!metadata) return {};
    const { generationRequest: _completed, recovery: _recovery, ...rest } = metadata;
    return rest;
}

export function imageExtension(dataUrl: string) {
    return dataUrl.match(/^data:image[/]([^;]+)/)?.[1] || dataUrl.match(/image[/]([^;]+)/)?.[1] || "png";
}

export function audioExtension(mimeType?: string) {
    if (mimeType?.includes("wav")) return "wav";
    if (mimeType?.includes("opus")) return "opus";
    if (mimeType?.includes("aac")) return "aac";
    if (mimeType?.includes("flac")) return "flac";
    if (mimeType?.includes("pcm")) return "pcm";
    return "mp3";
}

export function generationReferenceUrls(context: { referenceImages: ReferenceImage[]; referenceVideos: Array<{ storageKey?: string; url?: string }>; referenceAudios?: Array<{ storageKey?: string; url?: string }> }) {
    return [
        ...context.referenceImages.map(referenceUrl).filter((url): url is string => Boolean(url)),
        ...context.referenceVideos.map((video) => video.storageKey || video.url).filter((url): url is string => Boolean(url)),
        ...(context.referenceAudios || []).map((audio) => audio.storageKey || audio.url).filter((url): url is string => Boolean(url)),
    ];
}

export async function resolveMetadataReferences(metadata: CanvasNodeMetadata) {
    if (metadata.generationType !== "edit") return [];
    if (!metadata.references?.length) return null;
    const references = await Promise.all(
        metadata.references.map(async (url, index) => {
            const dataUrl = url.startsWith("image:") ? await resolveImageUrl(url, "") : url;
            return dataUrl ? { id: `${index}`, name: `reference-${index}.png`, type: "image/png", dataUrl, storageKey: url.startsWith("image:") ? url : undefined } : null;
        }),
    );
    return references.every(Boolean) ? (references as ReferenceImage[]) : null;
}

export async function hydrateCanvasImages(nodes: CanvasNodeData[]) {
    return Promise.all(
        nodes.map(async (node) => {
            const metadata = node.metadata;
            const content = metadata?.content;
            if ((node.type === CanvasNodeType.Video || node.type === CanvasNodeType.Audio) && metadata?.storageKey) return { ...node, metadata: { ...metadata, content: await resolveMediaUrl(metadata.storageKey, content) } };
            if (node.type !== CanvasNodeType.Image || !metadata || !content) return node;
            const images = await Promise.all(
                (metadata.images || []).map(async (image) => {
                    if (!image.content) return image;
                    void ensureImagePreview(image.storageKey);
                    return { ...image, content: await resolveImageUrl(image.storageKey, image.content) };
                }),
            );
            if (metadata.storageKey) {
                void ensureImagePreview(metadata.storageKey);
                return { ...node, metadata: { ...metadata, content: await resolveImageUrl(metadata.storageKey, content), images } };
            }
            if (!content.startsWith("data:image/")) return node;
            return { ...node, metadata: { ...metadata, ...imageMetadata(await uploadImage(content)) } };
        }),
    );
}

export async function hydrateAssistantImages(sessions: CanvasAssistantSession[]) {
    const hydrateItem = async <T extends { dataUrl?: string; storageKey?: string }>(item: T) => {
        if (item.storageKey) return { ...item, dataUrl: await resolveImageUrl(item.storageKey, item.dataUrl) };
        if (item.dataUrl?.startsWith("data:image/")) {
            const image = await uploadImage(item.dataUrl);
            return { ...item, dataUrl: image.url, storageKey: image.storageKey };
        }
        return item;
    };
    return Promise.all(
        sessions.map(async (session) => ({
            ...session,
            messages: await Promise.all(
                session.messages.map(async (message) => ({
                    ...message,
                    references: await Promise.all((message.references || []).map(hydrateItem)),
                })),
            ),
        })),
    );
}

export function getGenerationCount(count: string) {
    return Math.max(1, Math.min(4, Math.floor(Math.abs(Number(count)) || 1)));
}

export function getInputSummary(inputs: NodeGenerationInput[]) {
    const resources = [...new Map(inputs.flatMap((input) => (input.type === "group" ? input.children : [input])).map((input) => [input.nodeId, input])).values()];
    return {
        textCount: resources.filter((input) => input.type === "text").length,
        imageCount: resources.filter((input) => input.type === "image").length,
        videoCount: resources.filter((input) => input.type === "video").length,
        audioCount: resources.filter((input) => input.type === "audio").length,
    };
}

// Compose a default size string for a generation mode from the configured
// default ratio and resolution. Falls back to the stored size when the ratio is
// "auto" (meaning the user wants the model to decide).
function defaultSizeForMode(config: AiConfig, mode: CanvasNodeGenerationMode) {
    if (mode === "video") {
        const ratio = config.videoRatio || "16:9";
        if (ratio === "auto") return config.size || defaultConfig.size;
        return computeVideoSize(config.vquality || defaultConfig.vquality, ratio);
    }
    if (mode === "image") {
        const ratio = config.imageRatio || "1:1";
        if (ratio === "auto") return config.size || defaultConfig.size;
        return computeMediaSize(inferMediaScale(config.size), ratio);
    }
    return config.size || defaultConfig.size;
}

export function buildGenerationConfig(config: AiConfig, node: CanvasNodeData | undefined, mode: CanvasNodeGenerationMode): AiConfig {
    return {
        ...config,
        model: resolveModelForCapability(config, node?.metadata?.model, mode),
        reasoningEffort: node?.metadata?.reasoningEffort || config.reasoningEffort || defaultConfig.reasoningEffort,
        quality: node?.metadata?.quality || config.quality || defaultConfig.quality,
        // A node's own size wins; otherwise compose one from the per-mode default
        // ratio and resolution so new nodes do not all fall back to 1:1.
        size: node?.metadata?.size || defaultSizeForMode(config, mode),
        // 节点自己选的分辨率优先：它单独存着，和比例互不影响（请求里按 resolution 参数发出去）。
        imageScale: node?.metadata?.imageScale || config.imageScale,
        background: node?.metadata?.background ?? config.background ?? defaultConfig.background,
        videoSeconds: node?.metadata?.seconds || config.videoSeconds || defaultConfig.videoSeconds,
        vquality: node?.metadata?.vquality || config.vquality || defaultConfig.vquality,
        videoGenerateAudio: node?.metadata?.generateAudio || config.videoGenerateAudio || defaultConfig.videoGenerateAudio,
        videoWatermark: node?.metadata?.watermark || config.videoWatermark || defaultConfig.videoWatermark,
        videoMode: node?.metadata?.videoMode || config.videoMode || defaultConfig.videoMode,
        audioVoice: node?.metadata?.audioVoice || config.audioVoice || defaultConfig.audioVoice,
        audioFormat: node?.metadata?.audioFormat || config.audioFormat || defaultConfig.audioFormat,
        audioSpeed: node?.metadata?.audioSpeed || config.audioSpeed || defaultConfig.audioSpeed,
        audioInstructions: node?.metadata?.audioInstructions || config.audioInstructions || defaultConfig.audioInstructions,
        count: String(node?.metadata?.count || config.count || defaultConfig.count),
    };
}

export function hasResumableVideoTask(node: CanvasNodeData) {
    return node.type === CanvasNodeType.Video && Boolean(node.metadata?.videoTaskId) && !node.metadata?.content;
}

export function resetInterruptedGeneration(nodes: CanvasNodeData[]) {
    return nodes.map((node) => {
        const isLoading = node.metadata?.status === "loading";
        const isRunning = node.metadata?.generationRequest?.status === "running";
        if (!isLoading && !isRunning) return node;
        if (hasResumableVideoTask(node)) return node;
        return {
            ...node,
            metadata: {
                ...node.metadata,
                ...markGenerationRequestUnknown(
                    {
                        ...node.metadata,
                        generationRequest:
                            node.metadata?.generationRequest ||
                            ({
                                id: `legacy-${node.id}`,
                                mode: node.metadata?.generationMode || "image",
                                status: "running",
                                startedAt: new Date().toISOString(),
                                attempts: 1,
                            } as const),
                    },
                    i18n.t("canvas.generation.interrupted"),
                ),
                images: node.metadata?.images?.map((image) => (image.status === "loading" ? { ...image, status: "error" as const, errorDetails: i18n.t("canvas.generation.interrupted") } : image)),
                texts: node.metadata?.texts?.map((text) => (text.status === "loading" ? { ...text, status: "error" as const, errorDetails: i18n.t("canvas.generation.interrupted") } : text)),
            },
        };
    });
}

export function resumeGenerationMetadata(metadata: CanvasNodeMetadata | undefined): CanvasNodeMetadata {
    if (!metadata?.generationRequest || metadata.generationRequest.status === "running") return metadata || {};
    return {
        ...metadata,
        status: "loading",
        errorDetails: undefined,
        recovery: "resumable",
        generationRequest: { ...metadata.generationRequest, status: "running", lastError: undefined },
    };
}

export function generationRecoveryCounts(nodes: CanvasNodeData[]) {
    return nodes.reduce(
        (counts, node) => {
            // Never report a batch root as one unknown task for every image.
            if (node.type === CanvasNodeType.Config || node.type === CanvasNodeType.Group || node.metadata?.content) return counts;
            const request = node.metadata?.generationRequest;
            if (node.metadata?.status === "loading" && hasResumableVideoTask(node)) counts.resumable += 1;
            else if (request?.status === "unknown") counts.unknown += 1;
            else if (request?.status === "canceled") counts.canceled += 1;
            return counts;
        },
        { resumable: 0, unknown: 0, canceled: 0 },
    );
}

export function isGenerationCanceled(error: unknown) {
    return error instanceof Error && (error.message === i18n.t("common.requestCanceled") || error.name === "AbortError");
}

export function findRetrySourceNode(nodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    const queue = connections.filter((connection) => connection.toNodeId === nodeId).map((connection) => connection.fromNodeId);
    const visited = new Set<string>();
    while (queue.length) {
        const id = queue.shift()!;
        if (visited.has(id)) continue;
        visited.add(id);
        const node = nodes.find((item) => item.id === id);
        if (node?.type === CanvasNodeType.Config) return node;
        connections.filter((connection) => connection.toNodeId === id).forEach((connection) => queue.push(connection.fromNodeId));
    }
    return null;
}

export function sourceNodeReferenceImages(node: CanvasNodeData | null) {
    if (!node || node.type !== CanvasNodeType.Image || !node.metadata?.content) return [];
    return [
        {
            id: node.id,
            name: `${node.title || node.id}.png`,
            type: node.metadata.mimeType || "image/png",
            dataUrl: node.metadata.content,
            storageKey: node.metadata.storageKey,
        },
    ];
}

export function isAudioFile(file: File) {
    return file.type.startsWith("audio/") || /\.(mp3|wav)$/i.test(file.name);
}

export function buildAngleLabel(params: CanvasImageAngleParams) {
    const horizontal = params.horizontalAngle === 0 ? i18n.t("canvas.generation.front") : params.horizontalAngle > 0 ? i18n.t("canvas.generation.rotateRight", { angle: params.horizontalAngle }) : i18n.t("canvas.generation.rotateLeft", { angle: Math.abs(params.horizontalAngle) });
    const pitch = params.pitchAngle === 0 ? i18n.t("canvas.generation.level") : params.pitchAngle > 0 ? i18n.t("canvas.generation.topDown", { angle: params.pitchAngle }) : i18n.t("canvas.generation.lowAngle", { angle: Math.abs(params.pitchAngle) });
    return i18n.t("canvas.generation.angleLabel", { horizontal, pitch, distance: params.cameraDistance.toFixed(1), lens: i18n.t(params.wideAngle ? "canvas.editors.wide" : "canvas.editors.standard") });
}

export function buildAnglePrompt(params: CanvasImageAngleParams) {
    return i18n.t("canvas.generation.anglePrompt", { angle: buildAngleLabel(params) });
}
