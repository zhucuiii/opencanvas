import { ArrowRight, ChevronRight, ClipboardPaste, FolderOpen, FolderPlus, Image as ImageIcon, LoaderCircle, Plus, Trash2, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { App, Dropdown, Input } from "antd";
import localforage from "localforage";
import { saveAs } from "file-saver";
import { useTranslation } from "react-i18next";

import { ModelPicker } from "@/components/model-picker";
import { WorkbenchFailedCard, WorkbenchImageCard, WorkbenchPendingCard, type WorkbenchImage } from "@/components/workbench/workbench-image-card";
import { WorkbenchGenerationControls } from "@/components/workbench/workbench-generation-controls";
import { WorkbenchLibraryDrawer, type WorkbenchLibraryView } from "@/components/workbench/workbench-library-drawer";
import { PopoverGroup, useExclusivePopover } from "@/components/ui/popover-group";
import { imageDownloadExtension } from "@/lib/workbench-gallery";
import { AssetPickerModal, type InsertAssetPayload } from "@/components/canvas/asset-picker-modal";
import { formatDuration } from "@/lib/image-utils";
import { requestEdit, requestGeneration } from "@/services/api/image";
import { ensureImagePreview, getImagePreviewRevision, previewUrlFor, resolveImageUrl, subscribeImagePreviews, uploadImage } from "@/services/image-storage";
import { useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { useWorkbenchAgentStore } from "@/stores/use-workbench-agent-store";
import { useWorkbenchLibraryStore } from "@/stores/use-workbench-library-store";
import { useAssetStore } from "@/stores/use-asset-store";
import { nanoid } from "nanoid";
import type { ReferenceImage } from "@/types/image";
import i18n from "@/i18n";

// 网格卡片和生成结果共用同一个图片形状，卡片那边定义了一份。
type GeneratedImage = WorkbenchImage;

type GenerationResult = {
    id: string;
    status: "pending" | "success" | "failed";
    image?: GeneratedImage;
    error?: string;
};

type GenerationLog = {
    id: string;
    createdAt: number;
    title: string;
    prompt: string;
    time: string;
    model: string;
    config: GenerationLogConfig;
    references: ReferenceImage[];
    durationMs: number;
    successCount: number;
    failCount: number;
    imageCount: number;
    size: string;
    quality: string;
    status: "success" | "failed";
    images: GeneratedImage[];
};

type GenerationLogConfig = Pick<AiConfig, "model" | "imageModel" | "quality" | "size" | "count" | "background" | "imageOutputFormat" | "imageModeration" | "imageReferencesAsBase64">;

type UpdateAiConfig = <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => void;

const LOG_STORE_KEY = "infinite-canvas:image_generation_logs";
const logStore = localforage.createInstance({ name: "infinite-canvas", storeName: "image_generation_logs" });

export default function ImagePage() {
    return (
        <PopoverGroup>
            <ImageWorkbench />
        </PopoverGroup>
    );
}

function ImageWorkbench() {
    const { message } = App.useApp();
    const { t } = useTranslation();
    useSyncExternalStore(subscribeImagePreviews, getImagePreviewRevision);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const dragDepthRef = useRef(0);
    const config = useConfigStore((state) => state.config);
    const effectiveConfig = useEffectiveConfig();
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const [prompt, setPrompt] = useState("");
    const [references, setReferences] = useState<ReferenceImage[]>([]);
    const [results, setResults] = useState<GenerationResult[]>([]);
    const [logs, setLogs] = useState<GenerationLog[]>([]);
    const [running, setRunning] = useState(false);
    const [assetPickerOpen, setAssetPickerOpen] = useState(false);
    const [referenceMenuOpen, setReferenceMenuOpen] = useExclusivePopover();
    const [libraryOpen, setLibraryOpen] = useExclusivePopover();
    const [libraryView, setLibraryView] = useState<WorkbenchLibraryView>({ kind: "all" });
    const favoriteIds = useWorkbenchLibraryStore((state) => state.favoriteIds);
    const libraryFolders = useWorkbenchLibraryStore((state) => state.folders);
    const imageFolders = useWorkbenchLibraryStore((state) => state.imageFolders);
    const [startedAt, setStartedAt] = useState(0);
    const [elapsedMs, setElapsedMs] = useState(0);
    const [previewLog, setPreviewLog] = useState<GenerationLog | null>(null);
    const [isReferenceDragActive, setIsReferenceDragActive] = useState(false);
    const [autoRunToken, setAutoRunToken] = useState(0);
    const imageCommand = useWorkbenchAgentStore((state) => state.imageCommand);
    const clearImageCommand = useWorkbenchAgentStore((state) => state.clearImageCommand);
    const updateAgentTask = useWorkbenchAgentStore((state) => state.updateTask);
    const processedCommandRef = useRef(0);
    const agentTaskIdRef = useRef<string | undefined>(undefined);

    const model = effectiveConfig.imageModel || effectiveConfig.model;
    const canGenerate = Boolean(prompt.trim());
    const generationCount = Math.max(1, Math.min(10, Number(config.count) || 1));

    /*
     * 网格铺开「本次生成 + 所有历史」。
     * logs 本来就是一次性全量读进内存的（readStoredLogs 走 localforage.iterate），
     * 所以不需要分页或懒加载数据；这里只负责摊平成一张列表。
     * 本次生成排在最前，历史按时间倒序跟着。
     */
    const gridItems = useMemo(() => {
        const fromRun = results.map((result, index) => ({ kind: "run" as const, result, index }));
        const currentIds = new Set(results.flatMap((result) => (result.image ? [result.image.id] : [])));
        const history = logs.flatMap((log) => log.images.filter((image) => image.dataUrl && !currentIds.has(image.id)).map((image, index) => ({ kind: "history" as const, log, image, index })));
        return [...fromRun, ...history];
    }, [logs, results]);
    const favoriteSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);
    const libraryImageIds = useMemo(() => [...new Set(gridItems.map((item) => (item.kind === "run" ? item.result.image?.id : item.image.id)).filter((id): id is string => Boolean(id)))], [gridItems]);
    const galleryItems = useMemo(
        () =>
            gridItems.filter((item) => {
                if (libraryView.kind === "all") return true;
                const imageId = item.kind === "run" ? item.result.image?.id : item.image.id;
                if (!imageId) return false;
                return libraryView.kind === "favorites" ? favoriteSet.has(imageId) : Boolean(imageFolders[imageId]?.includes(libraryView.id));
            }),
        [gridItems, libraryView, favoriteSet, imageFolders],
    );
    const libraryViewLabel = libraryView.kind === "favorites" ? t("imageWorkbench.starred") : libraryView.kind === "folder" ? libraryFolders.find((folder) => folder.id === libraryView.id)?.name : "";

    useEffect(() => {
        if (!running || !startedAt) return;
        const timer = window.setInterval(() => setElapsedMs(performance.now() - startedAt), 1000);
        return () => window.clearInterval(timer);
    }, [running, startedAt]);

    useEffect(() => {
        void refreshLogs();
    }, []);

    const addReferences = async (files?: FileList | null) => {
        const imageFiles = Array.from(files || []).filter((file) => file.type.startsWith("image/"));
        const nextReferences = await Promise.all(
            imageFiles.map(async (file) => {
                const image = await uploadImage(file);
                return { id: nanoid(), name: file.name, type: image.mimeType, dataUrl: image.url, storageKey: image.storageKey };
            }),
        );
        setReferences((value) => [...value, ...nextReferences]);
    };

    const addReferencesFromClipboard = async () => {
        try {
            const items = await navigator.clipboard.read();
            const blobs = await Promise.all(items.flatMap((item) => item.types.filter((type) => type.startsWith("image/")).map((type) => item.getType(type))));
            if (!blobs.length) {
                message.error(t("imageWorkbench.clipboardEmpty"));
                return;
            }
            const nextReferences = await Promise.all(
                blobs.map(async (blob, index) => {
                    const image = await uploadImage(blob);
                    return { id: nanoid(), name: `clipboard-${index + 1}.png`, type: image.mimeType, dataUrl: image.url, storageKey: image.storageKey };
                }),
            );
            setReferences((value) => [...value, ...nextReferences]);
            message.success(t("imageWorkbench.clipboardAdded", { count: nextReferences.length }));
        } catch {
            message.error(t("imageWorkbench.clipboardEmpty"));
        }
    };

    const generate = async () => {
        if (running) return;
        const agentTaskId = agentTaskIdRef.current;
        agentTaskIdRef.current = undefined;
        const text = prompt.trim();
        if (!text) {
            message.error(t("imageWorkbench.promptRequired"));
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", error: t("imageWorkbench.promptRequired") });
            return;
        }
        if (!isAiConfigReady(effectiveConfig, model)) {
            message.warning(t("workbench.configFirst"));
            openConfigDialog(true);
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", error: t("imageWorkbench.configIncomplete") });
            return;
        }

        const snapshot = buildRequestSnapshot();
        if (!snapshot) {
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", error: t("imageWorkbench.invalidParams") });
            return;
        }

        setElapsedMs(0);
        setRunning(true);
        setLibraryView({ kind: "all" });
        if (agentTaskId) updateAgentTask(agentTaskId, { status: "running", error: undefined });
        setPreviewLog(null);
        setResults(Array.from({ length: generationCount }, () => ({ id: nanoid(), status: "pending" })));
        const batchStartedAt = performance.now();
        setStartedAt(batchStartedAt);

        const tasks = Array.from({ length: generationCount }, (_, index) => runGenerationSlot(index, snapshot));

        const result = await Promise.allSettled(tasks);
        const successImages = result.filter((item): item is PromiseFulfilledResult<GeneratedImage> => item.status === "fulfilled").map((item) => item.value);
        const successCount = successImages.length;
        const failCount = generationCount - successCount;
        const failed = result.find((item): item is PromiseRejectedResult => item.status === "rejected");
        const error = failed?.reason instanceof Error ? failed.reason.message : failCount ? t("workbench.generationFailed") : undefined;
        if (agentTaskId) updateAgentTask(agentTaskId, { status: successCount ? "succeeded" : "failed", successCount, failCount, error: successCount ? undefined : error });

        try {
            saveLog(
                buildLog({
                    prompt: text,
                    model,
                    config: { ...snapshot.config, count: String(generationCount) },
                    references: snapshot.references,
                    durationMs: performance.now() - batchStartedAt,
                    successCount,
                    failCount,
                    status: successCount ? "success" : "failed",
                    images: successImages,
                }),
            );
            successCount ? message.success(t("imageWorkbench.generated")) : message.error(failed?.reason instanceof Error ? failed.reason.message : t("workbench.generationFailed"));
        } finally {
            setRunning(false);
        }
    };

    // Handle image-generation commands from the Agent panel by setting the prompt and optionally starting generation.
    useEffect(() => {
        if (!imageCommand || imageCommand.nonce === processedCommandRef.current) return;
        processedCommandRef.current = imageCommand.nonce;
        clearImageCommand();
        if (typeof imageCommand.prompt === "string") setPrompt(imageCommand.prompt);
        if (imageCommand.run && running) {
            if (imageCommand.taskId) updateAgentTask(imageCommand.taskId, { status: "failed", error: t("imageWorkbench.busy") });
            return;
        }
        if (imageCommand.run) {
            agentTaskIdRef.current = imageCommand.taskId;
            setAutoRunToken((value) => value + 1);
        }
    }, [imageCommand, clearImageCommand, running, updateAgentTask]);

    useEffect(() => {
        if (!autoRunToken) return;
        void generate();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoRunToken]);

    const downloadImage = (image: GeneratedImage, index: number) => {
        saveAs(image.dataUrl, `image-${index + 1}.${imageDownloadExtension(image.mimeType)}`);
    };

    const addResultToReferences = async (image: GeneratedImage, index: number) => {
        const stored = await uploadImage(image.dataUrl);
        setReferences((value) => [...value, { id: nanoid(), name: `result-${index + 1}.${imageDownloadExtension(stored.mimeType)}`, type: stored.mimeType, dataUrl: stored.url, storageKey: stored.storageKey }]);
        message.success(t("imageWorkbench.addedReference"));
    };

    const saveResultToAssets = async (image: GeneratedImage, index: number, sourcePrompt = prompt) => {
        try {
            if (!useAssetStore.getState().hydrated)
                await new Promise<void>((resolve) => {
                    const unsubscribe = useAssetStore.subscribe((state) => {
                        if (state.hydrated) {
                            unsubscribe();
                            resolve();
                        }
                    });
                });
            const existing = () => useAssetStore.getState().assets.some((asset) => asset.kind === "image" && (asset.metadata?.sourceImageId === image.id || Boolean(image.storageKey && asset.data.storageKey === image.storageKey)));
            if (existing()) {
                message.info(t("imageWorkbench.alreadySaved"));
                return;
            }
            const stored = await uploadImage(image.dataUrl);
            if (existing()) {
                message.info(t("imageWorkbench.alreadySaved"));
                return;
            }
            useAssetStore.getState().addAsset({
                kind: "image",
                title: sourcePrompt.slice(0, 30) || t("imageWorkbench.resultTitle", { count: index + 1 }),
                coverUrl: stored.url,
                tags: [],
                source: t("imageWorkbench.source"),
                data: { dataUrl: stored.url, storageKey: stored.storageKey, width: stored.width, height: stored.height, bytes: stored.bytes, mimeType: stored.mimeType },
                metadata: { source: "image-page", sourceImageId: image.id, prompt: sourcePrompt },
            });
            message.success(t("common.addedToAssets"));
        } catch {
            message.error(t("imageWorkbench.saveAssetFailed"));
        }
    };

    const insertPickedAsset = async (payload: InsertAssetPayload) => {
        if (payload.kind === "text") {
            setPrompt(payload.content);
        } else if (payload.kind === "image") {
            const stored = await uploadImage(payload.dataUrl);
            setReferences((value) => [...value, { id: nanoid(), name: payload.title, type: stored.mimeType, dataUrl: stored.url, storageKey: stored.storageKey }]);
        } else {
            message.warning(t("imageWorkbench.unsupportedAsset"));
        }
        setAssetPickerOpen(false);
    };

    const saveLog = (log: GenerationLog) => {
        void logStore.setItem(log.id, serializeLog(log)).then(refreshLogs);
    };

    const refreshLogs = async () => setLogs(await readStoredLogs());

    /*
     * 回放一条历史：把提示词 / 参考图 / 参数填回输入区。
     * 不再把它的图灌进结果区 —— 网格本来就铺开了所有历史，灌进去反而会重复。
     */
    const previewGenerationLog = async (log: GenerationLog) => {
        if (running) {
            message.warning(t("imageWorkbench.busy"));
            return;
        }
        setPreviewLog(log);
        setPrompt(log.prompt);
        setReferences(log.references || []);
        if (log.config.imageModel || log.model) updateConfig("imageModel", log.config.imageModel || log.model);
        if (log.config.quality) updateConfig("quality", log.config.quality);
        if (log.config.size) updateConfig("size", log.config.size);
        if (log.config.count) updateConfig("count", log.config.count);
        updateConfig("background", log.config.background || "");
        updateConfig("imageOutputFormat", log.config.imageOutputFormat || "png");
        updateConfig("imageModeration", log.config.imageModeration || "auto");
        updateConfig("imageReferencesAsBase64", log.config.imageReferencesAsBase64 !== false);
    };

    const buildRequestSnapshot = () => {
        const text = prompt.trim();
        if (!text) {
            message.error(t("imageWorkbench.promptRequired"));
            return null;
        }
        if (!isAiConfigReady(effectiveConfig, model)) {
            message.warning(t("workbench.configFirst"));
            openConfigDialog(true);
            return null;
        }
        return { text, config: { ...effectiveConfig, model, count: "1" }, references: [...references] };
    };

    const runGenerationSlot = async (index: number, snapshot: { text: string; config: AiConfig; references: ReferenceImage[] }) => {
        const itemStartedAt = performance.now();
        try {
            const result = snapshot.references.length ? await requestEdit(snapshot.config, snapshot.text, snapshot.references) : await requestGeneration(snapshot.config, snapshot.text);
            const image = result[0];
            if (!image) throw new Error(t("imageWorkbench.missingResult"));
            const stored = await uploadImage(image.dataUrl);
            const nextImage: GeneratedImage = {
                id: image.id,
                dataUrl: stored.url,
                ...(stored.storageKey ? { storageKey: stored.storageKey } : {}),
                durationMs: performance.now() - itemStartedAt,
                width: stored.width,
                height: stored.height,
                bytes: stored.bytes,
                mimeType: stored.mimeType,
            };
            setResults((value) => updateResultAt(value, index, { status: "success", image: nextImage }));
            return nextImage;
        } catch (error) {
            setResults((value) => updateResultAt(value, index, { status: "failed", error: error instanceof Error ? error.message : t("workbench.generationFailed") }));
            throw error;
        }
    };

    const retryResult = async (index: number) => {
        if (running) return;
        const snapshot = buildRequestSnapshot();
        if (!snapshot) return;
        setRunning(true);
        setLibraryView({ kind: "all" });
        setStartedAt(performance.now());
        setElapsedMs(0);
        setPreviewLog(null);
        setResults((value) => updateResultAt(value, index, { status: "pending", error: undefined, image: undefined }));
        const retryStartedAt = performance.now();
        try {
            const image = await runGenerationSlot(index, snapshot);
            saveLog(
                buildLog({
                    prompt: snapshot.text,
                    model,
                    config: { ...snapshot.config, count: "1" },
                    references: snapshot.references,
                    durationMs: performance.now() - retryStartedAt,
                    successCount: 1,
                    failCount: 0,
                    status: "success",
                    images: [image],
                }),
            );
            message.success(t("workbench.retrySuccess"));
        } catch {
            // runGenerationSlot has already marked the result as failed.
        } finally {
            setRunning(false);
        }
    };

    return (
        <div className="image-playground flex h-full flex-col overflow-hidden bg-stone-50 text-stone-900 dark:bg-black dark:text-stone-100">
            {/*
             * 滚动层：整页滚，pb-48 给底部悬浮输入条腾位（参考项目就是 pb-48）。
             * 网格铺开「本次生成 + 所有历史」，所以进页面就能看到全部产出。
             */}
            <main className="min-h-0 flex-1 overflow-y-auto bg-stone-50 px-4 pt-5 pb-72 dark:bg-black sm:px-6 sm:pb-56">
                <div className="mx-auto w-full max-w-7xl">
                    <h1 className="sr-only">{t("imageWorkbench.title")}</h1>
                    <div className="mb-4 flex min-w-0 items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-1 text-xs text-stone-400">
                            <button type="button" className="shrink-0 cursor-pointer rounded-lg px-1 py-2 hover:!text-stone-800 dark:hover:!text-stone-100" onClick={() => setLibraryView({ kind: "all" })}>
                                {t("imageWorkbench.allImages")}
                            </button>
                            {libraryView.kind !== "all" ? (
                                <>
                                    <ChevronRight className="size-3 shrink-0" />
                                    <span className="truncate text-stone-600 dark:text-stone-200">{libraryViewLabel}</span>
                                </>
                            ) : null}
                        </div>
                        <button
                            type="button"
                            className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-xl border border-stone-200 bg-white/70 px-3 text-xs !text-stone-600 transition-colors hover:bg-white dark:border-stone-800 dark:bg-stone-900/70 dark:!text-stone-300 dark:hover:bg-stone-800"
                            onClick={() => setLibraryOpen(true)}
                            aria-expanded={libraryOpen}
                            aria-label={t("imageWorkbench.library")}
                        >
                            <FolderOpen className="size-3.5" />
                            {t("imageWorkbench.library")}
                        </button>
                    </div>

                    {galleryItems.length ? (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {galleryItems.map((item) =>
                                item.kind === "run" ? (
                                    item.result.status === "success" && item.result.image ? (
                                        <WorkbenchImageCard
                                            key={item.result.id}
                                            image={item.result.image}
                                            index={item.index}
                                            onAddToReferences={(image) => void addResultToReferences(image, item.index)}
                                            onDownload={(image) => downloadImage(image, item.index)}
                                            onSaveAsset={(image) => saveResultToAssets(image, item.index)}
                                        />
                                    ) : item.result.status === "failed" ? (
                                        <WorkbenchFailedCard key={item.result.id} error={item.result.error || t("workbench.generationFailed")} onRetry={() => void retryResult(item.index)} />
                                    ) : (
                                        <WorkbenchPendingCard key={item.result.id} />
                                    )
                                ) : (
                                    <WorkbenchImageCard
                                        key={`${item.log.id}-${item.image.id}`}
                                        image={item.image}
                                        index={item.index}
                                        active={previewLog?.id === item.log.id}
                                        onReplay={() => void previewGenerationLog(item.log)}
                                        onAddToReferences={(image) => void addResultToReferences(image, item.index)}
                                        onDownload={(image) => downloadImage(image, item.index)}
                                        onSaveAsset={(image) => saveResultToAssets(image, item.index, item.log.prompt)}
                                    />
                                ),
                            )}
                        </div>
                    ) : (
                        <div className="flex min-h-[35vh] flex-col items-center justify-center gap-5 text-center" role="status">
                            <ImageIcon className="size-12 text-stone-300/70 dark:text-stone-700" strokeWidth={1.3} />
                            <p className="text-sm text-stone-400 dark:text-stone-500">{libraryView.kind === "all" ? t("imageWorkbench.startPrompt") : t("imageWorkbench.emptyCollection")}</p>
                            {libraryView.kind !== "all" ? (
                                <>
                                    <p className="max-w-xs px-4 text-xs leading-relaxed text-stone-400">{t("imageWorkbench.emptyCollectionHint")}</p>
                                    <button type="button" className="cursor-pointer text-xs !text-stone-500 underline underline-offset-4" onClick={() => setLibraryView({ kind: "all" })}>
                                        {t("imageWorkbench.allImages")}
                                    </button>
                                </>
                            ) : null}
                        </div>
                    )}
                </div>
            </main>

            {/* Keep the gallery interactive outside the floating composer. */}
            <div className="pointer-events-none fixed bottom-3 left-1/2 z-30 w-full -translate-x-1/2 px-3 sm:bottom-5 sm:px-4">
                <div className="workbench-composer-stack mx-auto w-full max-w-5xl">
                <div
                    className={`playground-composer pointer-events-auto relative z-10 mx-auto w-full rounded-2xl border bg-white/90 p-3 shadow-[0_18px_55px_rgba(15,23,42,0.12)] backdrop-blur-2xl transition-colors sm:rounded-3xl sm:p-4 dark:bg-[#1b1c20] dark:shadow-[0_20px_60px_rgba(0,0,0,0.55)] ${isReferenceDragActive ? "border-stone-400 dark:border-stone-500" : "border-stone-200/90 dark:border-white/[0.10]"}`}
                    data-workbench-input-bar
                    onPointerDown={(event) => event.stopPropagation()}
                    // 拖拽参考图：整条卡片都是投放区，拖进来时描边变色给反馈（参考图那行本身可能不占位）。
                    onDragEnter={(event) => {
                        event.preventDefault();
                        dragDepthRef.current += 1;
                        if (event.dataTransfer.types.includes("Files")) setIsReferenceDragActive(true);
                    }}
                    onDragOver={(event) => {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "copy";
                    }}
                    onDragLeave={(event) => {
                        event.preventDefault();
                        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
                        if (!dragDepthRef.current) setIsReferenceDragActive(false);
                    }}
                    onDrop={(event) => {
                        event.preventDefault();
                        dragDepthRef.current = 0;
                        setIsReferenceDragActive(false);
                        void addReferences(event.dataTransfer.files);
                    }}
                >
                    {/* Reference thumbnails only take space when images are attached. */}
                    <div className={`workbench-reference-strip flex gap-2 overflow-x-auto ${references.length ? "mb-2" : "hidden"}`}>
                        {references.map((item) => (
                            <div key={item.id} className="group relative size-12 shrink-0 overflow-hidden rounded-lg border border-stone-200 dark:border-stone-800">
                                <img src={previewUrlFor(item.storageKey) || item.dataUrl} alt={item.name} className="size-full object-cover" />
                                <button
                                    type="button"
                                    className="absolute right-0.5 top-0.5 flex size-5 cursor-pointer items-center justify-center rounded bg-black/60 text-white sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                                    onClick={() => setReferences((value) => value.filter((ref) => ref.id !== item.id))}
                                    aria-label={t("imageWorkbench.removeReference")}
                                >
                                    <Trash2 className="size-3" />
                                </button>
                            </div>
                        ))}
                    </div>

                    <Input.TextArea
                        value={prompt}
                        onChange={(event) => setPrompt(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && canGenerate && !running) {
                                event.preventDefault();
                                void generate();
                            }
                        }}
                        placeholder={t("imageWorkbench.promptHint")}
                        aria-label={t("workbench.prompt")}
                        onPaste={(event) => {
                            if (Array.from(event.clipboardData.files).some((file) => file.type.startsWith("image/"))) {
                                event.preventDefault();
                                void addReferences(event.clipboardData.files);
                            }
                        }}
                        autoSize={false}
                        rows={3}
                        variant="borderless"
                        className="playground-prompt min-w-0 !border-0 !px-1 !py-2 !text-sm !outline-none !shadow-none focus:!border-0 focus:!outline-none focus:!ring-0 focus:!shadow-none focus-visible:!outline-none"
                    />

                    {/*
                     * 拖拽参考图时的提示只在悬停条上没有参考图时才显示 —— 有缩略图时那一行已经被占住了。
                     * isReferenceDragActive 由上面那行的拖拽处理置位，但上面那行在没有参考图时是 hidden，
                     * 所以这里用同一个标志把整条卡片描边切一下，用户拖拽时看得到反馈。
                     */}
                    {isReferenceDragActive && !references.length ? <div className="px-2 pb-1 text-xs text-stone-500">{t("imageWorkbench.dropReferences")}</div> : null}

                    <div className="workbench-composer-actions flex items-center gap-2 sm:gap-2.5">
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                            <Dropdown
                                trigger={["click"]}
                                placement="topRight"
                                open={referenceMenuOpen}
                                onOpenChange={setReferenceMenuOpen}
                                menu={{
                                    items: [
                                        { key: "upload", label: t("workbench.upload"), icon: <Upload className="size-3.5" /> },
                                        { key: "clipboard", label: t("workbench.clipboard"), icon: <ClipboardPaste className="size-3.5" /> },
                                        { key: "assets", label: t("workbench.viewAssets"), icon: <FolderPlus className="size-3.5" /> },
                                    ],
                                    onClick: ({ key }) => {
                                        setReferenceMenuOpen(false);
                                        if (key === "upload") fileInputRef.current?.click();
                                        else if (key === "clipboard") void addReferencesFromClipboard();
                                        else setAssetPickerOpen(true);
                                    },
                                }}
                            >
                                <button type="button" className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-stone-500 transition hover:bg-stone-100 hover:text-stone-900 dark:text-stone-300 dark:hover:bg-white/[0.08] dark:hover:text-white" aria-label={t("imageWorkbench.addReferenceSource")} aria-expanded={referenceMenuOpen} title={t("imageWorkbench.addReferenceSource")}>
                                    <Plus className="size-4" />
                                </button>
                            </Dropdown>
                            <button type="button" className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-stone-500 transition hover:bg-stone-100 hover:text-stone-900 dark:text-stone-300 dark:hover:bg-white/[0.08] dark:hover:text-white" onClick={() => fileInputRef.current?.click()} aria-label={t("workbench.upload")} title={t("workbench.upload")}>
                                <ImageIcon className="size-4" />
                            </button>
                            <span className="h-5 w-px shrink-0 bg-stone-200 dark:bg-white/[0.12]" aria-hidden />
                            <ModelPicker
                                flat
                                side="top"
                                config={effectiveConfig}
                                value={model}
                                onChange={(next) => updateConfig("imageModel", next)}
                                capability="image"
                                className="!h-8 min-w-0 max-w-[190px] !rounded-full !border-0 !bg-transparent !px-2 !text-xs !font-semibold !text-stone-700 !shadow-none hover:!bg-stone-100 focus-visible:!outline-2 focus-visible:!outline-offset-2 dark:!text-stone-200 dark:hover:!bg-white/[0.08] max-sm:max-w-[150px] data-[size=default]:!h-8"
                            />
                        </div>

                        {running ? <span className="shrink-0 text-xs tabular-nums text-stone-500">{formatDuration(elapsedMs)}</span> : null}

                        {/* 发送：圆钮，运行中换成转圈并锁住。 */}
                        <button
                            type="button"
                            className="inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-stone-900 !text-white shadow-[0_5px_14px_rgba(15,23,42,0.2)] transition-[transform,opacity,background-color] hover:-translate-y-0.5 hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-[#303034] dark:!text-white dark:hover:bg-[#414145]"
                            disabled={!canGenerate || running}
                            onClick={() => void generate()}
                            aria-label={t("imageWorkbench.generateImage")}
                            title={t("imageWorkbench.shortcut")}
                        >
                            {running ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
                        </button>
                    </div>
                </div>
                <div className="playground-settings-rail pointer-events-auto relative z-20 mx-auto -mt-px flex min-h-12 items-center justify-between gap-3 rounded-xl border border-stone-200 bg-stone-100/95 px-3 py-1.5 shadow-[0_14px_36px_rgba(15,23,42,0.12)] backdrop-blur-xl dark:border-white/[0.08] dark:bg-[#101116] dark:shadow-[0_18px_40px_rgba(0,0,0,0.5)] sm:mx-4 sm:min-h-11 sm:px-3.5">
                    <WorkbenchGenerationControls mode="image" config={effectiveConfig} model={model} onChange={updateConfig} />
                    <div className="workbench-mode-spacer" aria-hidden="true" />
                </div>
                </div>
            </div>

            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(event) => {
                    void addReferences(event.target.files);
                    event.target.value = "";
                }}
            />
            <AssetPickerModal open={assetPickerOpen} defaultTab="my-assets" onInsert={(payload) => void insertPickedAsset(payload)} onClose={() => setAssetPickerOpen(false)} />
            <WorkbenchLibraryDrawer open={libraryOpen} view={libraryView} imageIds={libraryImageIds} onClose={() => setLibraryOpen(false)} onSelect={setLibraryView} />
        </div>
    );
}

function updateResultAt(results: GenerationResult[], index: number, next: Partial<GenerationResult>) {
    return results.map((item, itemIndex) => (itemIndex === index ? { ...item, ...next } : item));
}

async function readStoredLogs() {
    if (typeof window === "undefined") return [];
    try {
        const values: GenerationLog[] = [];
        await logStore.iterate<GenerationLog, void>((value) => {
            values.push(value);
        });
        const logs = await Promise.all(values.map(normalizeLog));
        return logs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    } catch {
        return [];
    }
}

async function normalizeLog(log: Partial<GenerationLog>): Promise<GenerationLog> {
    const references = await Promise.all(
        (log.references || []).map(async (item) => {
            void ensureImagePreview(item.storageKey);
            return { ...item, dataUrl: await resolveImageUrl(item.storageKey, item.dataUrl) };
        }),
    );
    const images = await Promise.all(
        (log.images || []).map(async (item) => {
            void ensureImagePreview(item.storageKey);
            return { ...item, dataUrl: await resolveImageUrl(item.storageKey, item.dataUrl) };
        }),
    );
    const config = normalizeLogConfig(log);
    return {
        id: log.id || nanoid(),
        createdAt: log.createdAt || Date.now(),
        title: log.title || log.model || i18n.t("workbench.untitled"),
        prompt: log.prompt || log.title || "",
        time: log.time || new Date().toLocaleString(i18n.resolvedLanguage, { hour12: false }),
        model: log.model || config.imageModel || "",
        config,
        references,
        durationMs: log.durationMs || 0,
        successCount: log.successCount ?? log.imageCount ?? 0,
        failCount: log.failCount || 0,
        imageCount: log.imageCount || log.successCount || 0,
        size: log.size || config.size || "",
        quality: log.quality || config.quality || "",
        status: log.status || "success",
        images,
    };
}

function serializeLog(log: GenerationLog): GenerationLog {
    return {
        ...log,
        references: log.references.map((item) => ({ ...item, dataUrl: item.storageKey ? "" : item.dataUrl })),
        images: log.images.map((image) => ({ ...image, dataUrl: image.storageKey ? "" : image.dataUrl })),
    };
}

function normalizeLogConfig(log: Partial<GenerationLog>): GenerationLogConfig {
    return {
        model: log.config?.model || log.model || "",
        imageModel: log.config?.imageModel || log.model || "",
        quality: log.config?.quality || log.quality || "",
        size: log.config?.size || log.size || "",
        count: log.config?.count || String(log.imageCount || log.successCount || 1),
        background: log.config?.background || "",
        imageOutputFormat: log.config?.imageOutputFormat || "png",
        imageModeration: log.config?.imageModeration || "auto",
        imageReferencesAsBase64: log.config?.imageReferencesAsBase64 !== false,
    };
}

function buildLog({
    prompt,
    model,
    config,
    references,
    durationMs,
    successCount,
    failCount,
    status,
    images,
}: {
    prompt: string;
    model: string;
    config: GenerationLogConfig;
    references: ReferenceImage[];
    durationMs: number;
    successCount: number;
    failCount: number;
    status: GenerationLog["status"];
    images: GeneratedImage[];
}): GenerationLog {
    const logConfig = {
        model: config.model,
        imageModel: config.imageModel,
        quality: config.quality,
        size: config.size,
        count: config.count,
        background: config.background,
        imageOutputFormat: config.imageOutputFormat || "png",
        imageModeration: config.imageModeration || "auto",
        imageReferencesAsBase64: config.imageReferencesAsBase64 !== false,
    };
    return {
        id: nanoid(),
        createdAt: Date.now(),
        title: prompt.slice(0, 12) || i18n.t("workbench.untitled"),
        prompt,
        time: new Date().toLocaleString(i18n.resolvedLanguage, { hour12: false }),
        model,
        config: logConfig,
        references,
        durationMs,
        successCount,
        failCount,
        imageCount: Number(logConfig.count) || successCount,
        size: logConfig.size,
        quality: logConfig.quality,
        status,
        images,
    };
}
