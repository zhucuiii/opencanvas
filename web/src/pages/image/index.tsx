import { ClipboardPaste, FolderPlus, History, ImagePlus, SlidersHorizontal, Sparkles, Trash2, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { App, Button, Empty, Input, Modal, Tag, Tooltip } from "antd";
import localforage from "localforage";
import { saveAs } from "file-saver";
import { useTranslation } from "react-i18next";

import { ImageSettingsPanel } from "@/components/image-settings-panel";
import { ModelPicker } from "@/components/model-picker";
import { WorkbenchFailedCard, WorkbenchImageCard, WorkbenchPendingCard, type WorkbenchImage } from "@/components/workbench/workbench-image-card";
import { WorkbenchHistoryPanel } from "@/components/workbench/workbench-history-panel";
import { AssetPickerModal, type InsertAssetPayload } from "@/components/canvas/asset-picker-modal";
import { canvasThemes } from "@/lib/canvas-theme";
import { formatBytes, formatDuration } from "@/lib/image-utils";
import { requestEdit, requestGeneration } from "@/services/api/image";
import { deleteStoredImages, ensureImagePreview, getImagePreviewRevision, previewUrlFor, resolveImageUrl, subscribeImagePreviews, uploadImage } from "@/services/image-storage";
import { useAssetStore } from "@/stores/use-asset-store";
import { useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { useWorkbenchAgentStore } from "@/stores/use-workbench-agent-store";
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

type GenerationLogConfig = Pick<AiConfig, "model" | "imageModel" | "quality" | "size" | "count">;

type UpdateAiConfig = <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => void;

const LOG_STORE_KEY = "infinite-canvas:image_generation_logs";
const RESULT_ACTION_BUTTON_CLASS = "min-w-0 px-1.5 [&_.ant-btn-icon]:shrink-0 [&>span:last-child]:min-w-0 [&>span:last-child]:truncate";
const logStore = localforage.createInstance({ name: "infinite-canvas", storeName: "image_generation_logs" });

export default function ImagePage() {
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
    const addAsset = useAssetStore((state) => state.addAsset);
    const [prompt, setPrompt] = useState("");
    const [references, setReferences] = useState<ReferenceImage[]>([]);
    const [results, setResults] = useState<GenerationResult[]>([]);
    const [logs, setLogs] = useState<GenerationLog[]>([]);
    const [running, setRunning] = useState(false);
    const [logsOpen, setLogsOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [assetPickerOpen, setAssetPickerOpen] = useState(false);
    const [startedAt, setStartedAt] = useState(0);
    const [elapsedMs, setElapsedMs] = useState(0);
    const [selectedLogIds, setSelectedLogIds] = useState<string[]>([]);
    const [previewLog, setPreviewLog] = useState<GenerationLog | null>(null);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [isReferenceDragActive, setIsReferenceDragActive] = useState(false);
    const [autoRunToken, setAutoRunToken] = useState(0);
    const historyAnchorRef = useRef<HTMLDivElement>(null);
    const imageCommand = useWorkbenchAgentStore((state) => state.imageCommand);
    const clearImageCommand = useWorkbenchAgentStore((state) => state.clearImageCommand);
    const updateAgentTask = useWorkbenchAgentStore((state) => state.updateTask);
    const processedCommandRef = useRef(0);
    const agentTaskIdRef = useRef<string | undefined>(undefined);

    const model = effectiveConfig.imageModel || effectiveConfig.model;
    const canGenerate = Boolean(prompt.trim());
    const generationCount = Math.max(1, Math.min(10, Number(config.count) || 1));
    const themeName = useThemeStore((state) => state.theme);

    /*
     * 网格铺开「本次生成 + 所有历史」。
     * logs 本来就是一次性全量读进内存的（readStoredLogs 走 localforage.iterate），
     * 所以不需要分页或懒加载数据；这里只负责摊平成一张列表。
     * 本次生成排在最前，历史按时间倒序跟着。
     */
    const gridItems = useMemo(() => {
        const fromRun = results.map((result, index) => ({ kind: "run" as const, result, index }));
        const history = logs.flatMap((log) => log.images.filter((image) => image.dataUrl).map((image, index) => ({ kind: "history" as const, log, image, index })));
        return [...fromRun, ...history];
    }, [logs, results]);

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
        saveAs(image.dataUrl, `image-${index + 1}.png`);
    };

    const addResultToReferences = async (image: GeneratedImage, index: number) => {
        const stored = await uploadImage(image.dataUrl);
        setReferences((value) => [...value, { id: nanoid(), name: `result-${index + 1}.png`, type: stored.mimeType, dataUrl: stored.url, storageKey: stored.storageKey }]);
        message.success(t("imageWorkbench.addedReference"));
    };

    const saveResultToAssets = async (image: GeneratedImage, index: number) => {
        const stored = await uploadImage(image.dataUrl);
        addAsset({
            kind: "image",
            title: t("imageWorkbench.resultTitle", { count: index + 1 }),
            coverUrl: stored.url,
            tags: [],
            source: t("imageWorkbench.source"),
            data: { dataUrl: stored.url, storageKey: stored.storageKey, width: stored.width, height: stored.height, bytes: stored.bytes, mimeType: stored.mimeType },
            metadata: { source: "image-page", prompt },
        });
        message.success(t("common.addedToAssets"));
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

    const createSession = () => {
        setPrompt("");
        setReferences([]);
        setResults([]);
        setElapsedMs(0);
        setStartedAt(0);
        setSelectedLogIds([]);
        setPreviewLog(null);
    };

    const deleteSelectedLogs = () => {
        const imageKeys = logs.filter((log) => selectedLogIds.includes(log.id)).flatMap((log) => log.images.map((image) => image.storageKey).filter((key): key is string => Boolean(key)));
        void Promise.all([deleteStoredImages(imageKeys), ...selectedLogIds.map((id) => logStore.removeItem(id))]).then(refreshLogs);
        if (previewLog && selectedLogIds.includes(previewLog.id)) {
            setPreviewLog(null);
            setResults([]);
        }
        setSelectedLogIds([]);
        setDeleteConfirmOpen(false);
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
        setPreviewLog(log);
        setLogsOpen(false);
        setPrompt(log.prompt);
        setReferences(log.references || []);
        if (log.config.imageModel || log.model) updateConfig("imageModel", log.config.imageModel || log.model);
        if (log.config.quality) updateConfig("quality", log.config.quality);
        if (log.config.size) updateConfig("size", log.config.size);
        if (log.config.count) updateConfig("count", log.config.count);
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
            const nextImage: GeneratedImage = { id: image.id, dataUrl: stored.url, ...(stored.storageKey ? { storageKey: stored.storageKey } : {}), durationMs: performance.now() - itemStartedAt, width: stored.width, height: stored.height, bytes: stored.bytes, mimeType: stored.mimeType };
            setResults((value) => updateResultAt(value, index, { status: "success", image: nextImage }));
            return nextImage;
        } catch (error) {
            setResults((value) => updateResultAt(value, index, { status: "failed", error: error instanceof Error ? error.message : t("workbench.generationFailed") }));
            throw error;
        }
    };

    const retryResult = async (index: number) => {
        const snapshot = buildRequestSnapshot();
        if (!snapshot) return;
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
        }
    };

    return (
        <div className="flex h-full flex-col overflow-hidden bg-stone-50 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
            {/*
             * 滚动层：整页滚，pb-48 给底部悬浮输入条腾位（参考项目就是 pb-48）。
             * 网格铺开「本次生成 + 所有历史」，所以进页面就能看到全部产出。
             */}
            <main className="min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-48">
                <div className="mx-auto w-full max-w-7xl">
                    <header className="mb-4 flex items-center justify-between gap-3">
                        <h1 className="text-lg font-semibold text-stone-950 dark:text-stone-100 sm:text-xl">{t("imageWorkbench.title")}</h1>
                        <div className="relative">
                            <Button icon={<History className="size-4" />} onClick={() => setLogsOpen((value) => !value)}>
                                {t("workbench.logs")}
                            </Button>
                            {logsOpen ? (
                                <WorkbenchHistoryPanel
                                    logs={logs}
                                    selectedLogIds={selectedLogIds}
                                    activeLogId={previewLog?.id}
                                    onSelectedLogIdsChange={setSelectedLogIds}
                                    onCreateSession={() => { createSession(); setLogsOpen(false); }}
                                    onDeleteSelected={() => { setDeleteConfirmOpen(true); setLogsOpen(false); }}
                                    onPreviewLog={(log) => void previewGenerationLog(log)}
                                    onDismiss={() => setLogsOpen(false)}
                                    anchorRef={historyAnchorRef}
                                />
                            ) : null}
                        </div>
                    </header>

                    {gridItems.length ? (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {gridItems.map((item) =>
                                item.kind === "run" ? (
                                    item.result.status === "success" && item.result.image ? (
                                        <WorkbenchImageCard
                                            key={item.result.id}
                                            image={item.result.image}
                                            index={item.index}
                                            onAddToReferences={(image) => void addResultToReferences(image, item.index)}
                                            onDownload={(image) => downloadImage(image, item.index)}
                                            onSaveAsset={(image) => void saveResultToAssets(image, item.index)}
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
                                        onSaveAsset={(image) => void saveResultToAssets(image, item.index)}
                                    />
                                ),
                            )}
                        </div>
                    ) : (
                        <div className="flex min-h-[40vh] flex-col items-center justify-center rounded-xl border border-dashed border-stone-300 text-center dark:border-stone-700">
                            <ImagePlus className="mb-4 size-11 text-stone-400" />
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("imageWorkbench.empty")} />
                        </div>
                    )}
                </div>
            </main>

            {/*
             * 底部悬浮输入条：两层结构 —— 外层 pointer-events-none 铺满、内层 pointer-events-auto 接点击，
             * 这样悬浮条以外的区域照常可交互（照抄 canvas-toolbar.tsx 的做法）。
             */}
            <div className="pointer-events-none fixed bottom-4 left-1/2 z-30 w-full -translate-x-1/2 px-3 sm:bottom-6 sm:px-4">
                <div
                    className="pointer-events-auto rounded-2xl border border-stone-200 bg-white/80 p-3 shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-2xl sm:rounded-3xl sm:p-4 dark:border-stone-800 dark:bg-stone-900/80"
                    data-workbench-input-bar
                    onPointerDown={(event) => event.stopPropagation()}
                >
                    <div className="flex items-start gap-2">
                        <Input.TextArea
                            value={prompt}
                            onChange={(event) => setPrompt(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter" && !event.shiftKey && canGenerate && !running) {
                                    event.preventDefault();
                                    void generate();
                                }
                            }}
                            placeholder={t("imageWorkbench.promptPlaceholder")}
                            autoSize={{ minRows: 1, maxRows: 4 }}
                            variant="borderless"
                            className="!px-1 !py-1 text-sm"
                        />
                        {running ? <Tag className="m-0 shrink-0 self-center px-2 py-1">{t("workbench.waiting", { time: formatDuration(elapsedMs) })}</Tag> : null}
                        <div className="flex shrink-0 items-center gap-1 self-center">
                            <Tooltip title={t("workbench.clipboard")}>
                                <Button size="small" type="text" icon={<ClipboardPaste className="size-3.5" />} onClick={() => void addReferencesFromClipboard()} aria-label={t("workbench.clipboard")} />
                            </Tooltip>
                            <Tooltip title={t("workbench.upload")}>
                                <Button size="small" type="text" icon={<Upload className="size-3.5" />} onClick={() => fileInputRef.current?.click()} aria-label={t("workbench.upload")} />
                            </Tooltip>
                            <Tooltip title={t("workbench.viewAssets")}>
                                <Button size="small" type="text" icon={<FolderPlus className="size-3.5" />} onClick={() => setAssetPickerOpen(true)} aria-label={t("workbench.viewAssets")} />
                            </Tooltip>
                        </div>
                    </div>

                    <div
                        className={`mt-2 flex gap-2 overflow-x-auto rounded-lg border border-dashed p-2 ${isReferenceDragActive ? "border-stone-900 bg-stone-100/80 dark:border-stone-100 dark:bg-stone-900/80" : "border-stone-300 dark:border-stone-700"}`}
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
                            {references.map((item, index) => (
                                <div key={item.id} className="group relative size-14 shrink-0 overflow-hidden rounded-md border border-stone-200 dark:border-stone-800">
                                    <img src={previewUrlFor(item.storageKey) || item.dataUrl} alt={item.name} className="size-full object-cover" />
                                    <button
                                        type="button"
                                        className="absolute right-0.5 top-0.5 hidden size-5 items-center justify-center rounded bg-black/60 text-white group-hover:flex"
                                        onClick={() => setReferences((value) => value.filter((ref) => ref.id !== item.id))}
                                        aria-label={t("imageWorkbench.removeReference")}
                                    >
                                        <Trash2 className="size-3" />
                                    </button>
                                </div>
                            ))}
                            {!references.length ? <div className="flex min-w-full items-center justify-center py-1 text-xs text-stone-500">{t("imageWorkbench.dropReferences")}</div> : null}
                    </div>

                    {/* 底栏：常用的（模型 / 张数 / 生成）直接露出，其余参数收进弹窗。 */}
                    <div className="mt-2 flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                            <ModelPicker flat config={effectiveConfig} value={model} onChange={(next) => updateConfig("imageModel", next)} capability="image" className="min-w-0 max-w-[200px]" />
                        </div>
                        <span className="h-4 w-px shrink-0" style={{ background: "var(--border)" }} aria-hidden />
                        <span className="shrink-0 text-xs tabular-nums text-stone-500">{generationCount}×</span>
                        <Button size="small" icon={<SlidersHorizontal className="size-3.5" />} onClick={() => setSettingsOpen(true)}>
                            {t("workbench.settings")}
                        </Button>
                        <Button type="primary" icon={<Sparkles className="size-4" />} loading={running} disabled={!canGenerate || running} onClick={() => void generate()}>
                            {t("workbench.generate")}
                        </Button>
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
            {/* 参数弹窗：张数已经提到悬浮条上，所以 showCount 关掉，避免出现两处。 */}
            <Modal title={t("workbench.settings")} open={settingsOpen} onCancel={() => setSettingsOpen(false)} footer={null} width={520} destroyOnHidden>
                <ImageSettingsPanel config={effectiveConfig} onConfigChange={(key, value) => updateConfig(key, value)} theme={canvasThemes[themeName]} showTitle={false} showCount={false} className="space-y-4" />
            </Modal>
            <AssetPickerModal open={assetPickerOpen} defaultTab="my-assets" onInsert={(payload) => void insertPickedAsset(payload)} onClose={() => setAssetPickerOpen(false)} />

            <AssetPickerModal open={assetPickerOpen} defaultTab="my-assets" onInsert={(payload) => void insertPickedAsset(payload)} onClose={() => setAssetPickerOpen(false)} />
            <Modal title={t("workbench.deleteLogs")} open={deleteConfirmOpen} onCancel={() => setDeleteConfirmOpen(false)} onOk={deleteSelectedLogs} okText={t("common.delete")} okButtonProps={{ danger: true }} cancelText={t("common.cancel")}>
                {t("workbench.deleteLogsConfirm", { count: selectedLogIds.length })}
            </Modal>
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
