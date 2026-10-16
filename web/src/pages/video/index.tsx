import { ArrowLeft, ArrowRight, CheckSquare, ClipboardPaste, Download, FolderOpen, FolderPlus, LoaderCircle, Plus, Sparkles, Star, Trash2, Upload, VideoIcon } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore, type DragEvent } from "react";
import { App, Button, Checkbox, Drawer, Dropdown, Input, Modal, Tag, Tooltip, Typography } from "antd";
import localforage from "localforage";
import { nanoid } from "nanoid";
import { saveAs } from "file-saver";
import { useTranslation } from "react-i18next";

import { AssetPickerModal, type InsertAssetPayload } from "@/components/canvas/asset-picker-modal";
import { WorkbenchFolderPicker } from "@/components/workbench/workbench-folder-picker";
import { WorkbenchLibraryDrawer, type WorkbenchLibraryView } from "@/components/workbench/workbench-library-drawer";
import { PopoverGroup, useCloseExclusivePopoverGroup } from "@/components/ui/popover-group";
import { ModelPicker } from "@/components/model-picker";
import { normalizeVideoResolutionValue, normalizeVideoSizeValue, videoModeLabel, videoResolutionLabel, videoResolutionOptions, videoSecondsLabel, videoSecondsRange, videoSizeLabel, videoSizeOptions } from "@/components/video-settings-panel";
import { WORKBENCH_PILL_CLASS } from "@/components/workbench/workbench-input-pills";
import { useExclusivePopover } from "@/components/ui/popover-group";
import { clampVideoSeconds } from "@/lib/media-size";
import { formatBytes, formatDuration } from "@/lib/image-utils";
import { deleteStoredMedia, resolveMediaUrl } from "@/services/file-storage";
import { resolveImageUrl, ensureImagePreview, getImagePreviewRevision, previewUrlFor, subscribeImagePreviews, uploadImage } from "@/services/image-storage";
import { createVideoGenerationTask, pollVideoGenerationTask, storeGeneratedVideo, type VideoGenerationTask } from "@/services/api/video";
import { useAssetStore } from "@/stores/use-asset-store";
import { useWorkbenchAgentStore } from "@/stores/use-workbench-agent-store";
import { boolConfig, modelOptionLabel, useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { useWorkbenchLibraryStore } from "@/stores/use-workbench-library-store";
import type { ReferenceImage } from "@/types/image";
import i18n from "@/i18n";

type GeneratedVideo = {
    id: string;
    url: string;
    storageKey: string;
    durationMs: number;
    width: number;
    height: number;
    bytes: number;
    mimeType: string;
};

type GenerationResult = {
    id: string;
    status: "pending" | "success" | "failed";
    video?: GeneratedVideo;
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
    size: string;
    resolution: string;
    seconds: string;
    status: "pending" | "success" | "failed";
    task?: VideoGenerationTask;
    video?: GeneratedVideo;
    error?: string;
};

type GenerationLogConfig = Pick<AiConfig, "model" | "videoModel" | "size" | "vquality" | "videoSeconds" | "videoGenerateAudio" | "videoWatermark" | "videoMode">;

type UpdateAiConfig = <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => void;

const LOG_STORE_KEY = "infinite-canvas:video_generation_logs";
const logStore = localforage.createInstance({ name: "infinite-canvas", storeName: "video_generation_logs" });

export default function VideoPage() {
    return <PopoverGroup><VideoWorkbench /></PopoverGroup>;
}

function VideoWorkbench() {
    const { message } = App.useApp();
    const closeInputPopovers = useCloseExclusivePopoverGroup();
    const { t } = useTranslation();
    useSyncExternalStore(subscribeImagePreviews, getImagePreviewRevision);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const dragDepthRef = useRef(0);
    const activeLogIdsRef = useRef<Set<string>>(new Set());
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
    const [assetPickerOpen, setAssetPickerOpen] = useState(false);
    const [libraryOpen, setLibraryOpen] = useState(false);
    const [libraryView, setLibraryView] = useState<WorkbenchLibraryView>({ kind: "all" });
    const [startedAt, setStartedAt] = useState(0);
    const [elapsedMs, setElapsedMs] = useState(0);
    const [selectedLogIds, setSelectedLogIds] = useState<string[]>([]);
    const [previewLog, setPreviewLog] = useState<GenerationLog | null>(null);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [referenceDragTarget, setReferenceDragTarget] = useState(false);
    const [autoRunToken, setAutoRunToken] = useState(0);
    const videoCommand = useWorkbenchAgentStore((state) => state.videoCommand);
    const videoFavoriteIds = useWorkbenchLibraryStore((state) => state.videoFavoriteIds);
    const videoFolders = useWorkbenchLibraryStore((state) => state.videoFolders);
    const clearVideoCommand = useWorkbenchAgentStore((state) => state.clearVideoCommand);
    const updateAgentTask = useWorkbenchAgentStore((state) => state.updateTask);
    const processedCommandRef = useRef(0);
    const agentTaskIdRef = useRef<string | undefined>(undefined);

    const model = effectiveConfig.videoModel || effectiveConfig.model;
    const canGenerate = Boolean(prompt.trim());
    const videoIds = logs.flatMap((log) => log.video ? [log.video.id] : []);
    const visibleLogs = logs.filter((log) => {
        if (!log.video) return false;
        if (libraryView.kind === "favorites") return videoFavoriteIds.includes(log.video.id);
        if (libraryView.kind === "folder") return Boolean(videoFolders[log.video.id]?.includes(libraryView.id));
        return true;
    });
    const libraryFolders = useWorkbenchLibraryStore((state) => state.folders);
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
        const selectedFiles = Array.from(files || []);
        const unsupported = selectedFiles.filter((file) => !file.type.startsWith("image/"));
        if (unsupported.length) message.warning(t("videoWorkbench.unsupportedFiles"));
        const imageFiles = selectedFiles.filter((file) => file.type.startsWith("image/")).slice(0, 7 - references.length);
        const nextReferences = await Promise.all(
            imageFiles.map(async (file) => {
                const image = await uploadImage(file);
                return { id: nanoid(), name: file.name, type: image.mimeType, dataUrl: image.url, storageKey: image.storageKey };
            }),
        );
        setReferences((value) => [...value, ...nextReferences].slice(0, 7));
    };

    const handleReferenceDragEnter = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        dragDepthRef.current += 1;
        if (event.dataTransfer.types.includes("Files")) setReferenceDragTarget(true);
    };

    const handleReferenceDragLeave = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (!dragDepthRef.current) setReferenceDragTarget(false);
    };

    const handleReferenceDrop = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        dragDepthRef.current = 0;
        setReferenceDragTarget(false);
        void addReferences(event.dataTransfer.files);
    };

    const addReferencesFromClipboard = async () => {
        try {
            const items = await navigator.clipboard.read();
            const blobs = await Promise.all(items.flatMap((item) => item.types.filter((type) => type.startsWith("image/")).map((type) => item.getType(type))));
            if (!blobs.length) {
                message.error(t("videoWorkbench.clipboardEmpty"));
                return;
            }
            const nextReferences = await Promise.all(
                blobs.slice(0, 7 - references.length).map(async (blob, index) => {
                    const image = await uploadImage(blob);
                    return { id: nanoid(), name: `clipboard-${index + 1}.png`, type: image.mimeType, dataUrl: image.url, storageKey: image.storageKey };
                }),
            );
            setReferences((value) => [...value, ...nextReferences].slice(0, 7));
            message.success(t("videoWorkbench.clipboardAdded", { count: nextReferences.length }));
        } catch {
            message.error(t("videoWorkbench.clipboardEmpty"));
        }
    };
    const generate = async () => {
        const agentTaskId = agentTaskIdRef.current;
        agentTaskIdRef.current = undefined;
        const snapshot = buildRequestSnapshot();
        if (!snapshot) {
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", error: t("videoWorkbench.invalidParams") });
            return;
        }
        setElapsedMs(0);
        setRunning(true);
        if (agentTaskId) updateAgentTask(agentTaskId, { status: "running", error: undefined });
        setPreviewLog(null);
        setResults([{ id: nanoid(), status: "pending" }]);
        const batchStartedAt = performance.now();
        setStartedAt(batchStartedAt);
        try {
            const task = await createVideoGenerationTask(snapshot.config, snapshot.text, snapshot.references);
            const log = buildLog({ prompt: snapshot.text, model, config: snapshot.config, references: snapshot.references, durationMs: 0, status: "pending", task });
            await saveLog(log, false);
            void pollGenerationLog(log, snapshot.config, agentTaskId);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : t("workbench.generationFailed");
            setResults([{ id: nanoid(), status: "failed", error: errorMessage }]);
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", successCount: 0, failCount: 1, error: errorMessage });
            await saveLog(buildLog({ prompt: snapshot.text, model, config: snapshot.config, references: snapshot.references, durationMs: performance.now() - batchStartedAt, status: "failed", error: errorMessage }));
            message.error(errorMessage);
            setRunning(false);
        }
    };

    // Handle video-generation commands from the Agent panel by setting the prompt and optionally starting generation.
    useEffect(() => {
        if (!videoCommand || videoCommand.nonce === processedCommandRef.current) return;
        processedCommandRef.current = videoCommand.nonce;
        clearVideoCommand();
        if (typeof videoCommand.prompt === "string") setPrompt(videoCommand.prompt);
        if (videoCommand.run && running) {
            if (videoCommand.taskId) updateAgentTask(videoCommand.taskId, { status: "failed", error: t("videoWorkbench.busy") });
            return;
        }
        if (videoCommand.run) {
            agentTaskIdRef.current = videoCommand.taskId;
            setAutoRunToken((value) => value + 1);
        }
    }, [videoCommand, clearVideoCommand, running, updateAgentTask]);

    useEffect(() => {
        if (!autoRunToken) return;
        void generate();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoRunToken]);

    const buildRequestSnapshot = () => {
        const text = prompt.trim();
        if (!text) {
            message.error(t("videoWorkbench.promptRequired"));
            return null;
        }
        if (!isAiConfigReady(effectiveConfig, model)) {
            message.warning(t("workbench.configFirst"));
            openConfigDialog(true);
            return null;
        }
        return { text, config: buildVideoConfig(effectiveConfig, model), references: [...references] };
    };

    const retryResult = () => {
        void generate();
    };

    const downloadVideo = (video: GeneratedVideo) => {
        saveAs(video.url, "video.mp4");
    };

    const saveResultToAssets = (video: GeneratedVideo) => {
        addAsset({
            kind: "video",
            title: t("videoWorkbench.resultTitle"),
            coverUrl: "",
            tags: [],
            source: t("videoWorkbench.source"),
            data: { url: video.url, storageKey: video.storageKey, width: video.width, height: video.height, bytes: video.bytes, mimeType: video.mimeType },
            metadata: { source: "video-page", prompt },
        });
        message.success(t("common.addedToAssets"));
    };

    const insertPickedAsset = async (payload: InsertAssetPayload) => {
        if (payload.kind === "text") {
            setPrompt(payload.content);
        } else if (payload.kind === "image") {
            const stored = await uploadImage(payload.dataUrl);
            setReferences((value) => [...value, { id: nanoid(), name: payload.title, type: stored.mimeType, dataUrl: stored.url, storageKey: stored.storageKey }].slice(0, 7));
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
        const mediaKeys = logs
            .filter((log) => selectedLogIds.includes(log.id))
            .map((log) => log.video?.storageKey)
            .filter((key): key is string => Boolean(key));
        void Promise.all([deleteStoredMedia(mediaKeys), ...selectedLogIds.map((id) => logStore.removeItem(id))]).then(() => refreshLogs());
        if (previewLog && selectedLogIds.includes(previewLog.id)) {
            setPreviewLog(null);
            setResults([]);
        }
        setSelectedLogIds([]);
        setDeleteConfirmOpen(false);
    };

    const saveLog = async (log: GenerationLog, resumePending = true) => {
        await logStore.setItem(log.id, serializeLog(log));
        await refreshLogs(resumePending);
    };

    const refreshLogs = async (resumePending = true) => {
        const nextLogs = await readStoredLogs();
        setLogs(nextLogs);
        if (resumePending) resumePendingLogs(nextLogs);
        return nextLogs;
    };

    const resumePendingLogs = (items: GenerationLog[]) => {
        for (const log of items) {
            if (log.status === "pending" && log.task) void pollGenerationLog(log);
        }
    };

    const pollGenerationLog = async (log: GenerationLog, configOverride?: AiConfig, agentTaskId?: string) => {
        if (!log.task || activeLogIdsRef.current.has(log.id)) return;
        activeLogIdsRef.current.add(log.id);
        setRunning(true);
        setStartedAt((value) => value || performance.now());
        setResults((value) => (value.length ? value : [{ id: log.id, status: "pending" }]));
        const taskConfig = buildVideoConfig({ ...effectiveConfig, ...log.config }, log.task.model || log.model);
        try {
            for (let attempt = 0; attempt < 120; attempt += 1) {
                const state = await pollVideoGenerationTask(configOverride || taskConfig, log.task);
                if (state.status === "completed") {
                    const stored = await storeGeneratedVideo(state.result);
                    const nextVideo: GeneratedVideo = {
                        id: nanoid(),
                        url: stored.url,
                        storageKey: stored.storageKey,
                        durationMs: Date.now() - log.createdAt,
                        width: stored.width || 1280,
                        height: stored.height || 720,
                        bytes: stored.bytes,
                        mimeType: stored.mimeType,
                    };
                    setResults([{ id: nextVideo.id, status: "success", video: nextVideo }]);
                    if (agentTaskId) updateAgentTask(agentTaskId, { status: "succeeded", successCount: 1, failCount: 0, error: undefined });
                    await saveLog({ ...log, status: "success", durationMs: nextVideo.durationMs, video: nextVideo, error: undefined });
                    message.success(t("videoWorkbench.generated"));
                    return;
                }
                if (state.status === "failed") throw new Error(state.error);
                if (attempt === 119) throw new Error(t("videoWorkbench.timeout"));
                await delay(2500);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : t("workbench.generationFailed");
            setResults([{ id: log.id, status: "failed", error: errorMessage }]);
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", successCount: 0, failCount: 1, error: errorMessage });
            await saveLog({ ...log, status: "failed", durationMs: Date.now() - log.createdAt, error: errorMessage });
            message.error(errorMessage);
        } finally {
            activeLogIdsRef.current.delete(log.id);
            if (!activeLogIdsRef.current.size) {
                setRunning(false);
                setStartedAt(0);
            }
        }
    };

    const previewGenerationLog = (log: GenerationLog) => {
        setPreviewLog(log);
        setPrompt(log.prompt);
        setReferences(log.references || []);
        if (log.config.videoModel || log.model) updateConfig("videoModel", log.config.videoModel || log.model);
        if (log.config.size) updateConfig("size", log.config.size);
        if (log.config.vquality) updateConfig("vquality", log.config.vquality);
        if (log.config.videoSeconds) updateConfig("videoSeconds", log.config.videoSeconds);
        if (log.config.videoGenerateAudio) updateConfig("videoGenerateAudio", log.config.videoGenerateAudio);
        if (log.config.videoWatermark) updateConfig("videoWatermark", log.config.videoWatermark);
        if (log.config.videoMode) updateConfig("videoMode", log.config.videoMode);
        setResults(log.status === "pending" ? [{ id: log.id, status: "pending" }] : log.video ? [{ id: log.video.id, status: "success", video: log.video }] : [{ id: log.id, status: "failed", error: log.error || t("workbench.generationFailed") }]);
    };

    return (
        <div className="flex h-full flex-col overflow-hidden bg-stone-50 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
            <main className="min-h-0 flex-1 overflow-y-auto px-4 pt-5 pb-72 sm:px-6 sm:pb-56">
                <div className="mx-auto w-full max-w-7xl">
                    <div className="mb-4 flex min-w-0 items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-1 text-xs text-stone-400">
                            <button type="button" className="shrink-0 rounded-lg px-1 py-2 hover:text-stone-800 dark:hover:text-stone-100" onClick={() => setLibraryView({ kind: "all" })}>{t("videoWorkbench.title")}</button>
                            {libraryView.kind !== "all" ? <><span aria-hidden>›</span><span className="truncate text-stone-600 dark:text-stone-200">{libraryViewLabel}</span></> : null}
                        </div>
                        <div className="flex shrink-0 gap-2">
                            <button type="button" className="inline-flex h-9 shrink-0 items-center gap-2 rounded-xl border border-stone-200 bg-white/70 px-3 text-xs text-stone-600 transition-colors hover:bg-white dark:border-stone-800 dark:bg-stone-900/70 dark:text-stone-300 dark:hover:bg-stone-800" onClick={() => setLibraryOpen(true)} aria-expanded={libraryOpen}>
                                <FolderOpen className="size-3.5" />{t("imageWorkbench.library")}
                            </button>
                        </div>
                    </div>
                    {results.some((result) => result.status !== "success") ? <div className="mb-5 grid gap-4">{results.filter((result) => result.status !== "success").map((result) => result.status === "failed" ? <FailedVideoCard key={result.id} error={result.error || t("workbench.generationFailed")} onRetry={retryResult} /> : <PendingVideoCard key={result.id} />)}</div> : null}
                    {visibleLogs.length ? <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{visibleLogs.map((log) => log.video ? <ResultVideoCard key={log.video.id} video={log.video} onDownload={downloadVideo} onSaveAsset={saveResultToAssets} /> : null)}</div> : (
                        <div className="flex min-h-[35vh] flex-col items-center justify-center gap-5 text-center" role="status">
                            <VideoIcon className="size-12 text-stone-300/70 dark:text-stone-700" strokeWidth={1.3} />
                            <p className="text-sm text-stone-400 dark:text-stone-500">{libraryView.kind === "all" ? t("videoWorkbench.empty") : t("imageWorkbench.emptyCollection")}</p>
                            {libraryView.kind !== "all" ? <button type="button" className="text-xs text-stone-500 underline underline-offset-4" onClick={() => setLibraryView({ kind: "all" })}>{t("videoWorkbench.title")}</button> : null}
                        </div>
                    )}
                </div>
            </main>
            <div className="pointer-events-none fixed bottom-4 left-1/2 z-30 w-full -translate-x-1/2 px-3 sm:bottom-6 sm:px-4">
                <div
                    className={`playground-composer pointer-events-auto mx-auto w-full max-w-5xl rounded-2xl border bg-white/90 p-3 shadow-[0_18px_55px_rgba(15,23,42,0.12)] backdrop-blur-2xl transition-colors sm:rounded-3xl sm:p-4 dark:bg-stone-900/95 dark:shadow-[0_20px_60px_rgba(0,0,0,0.38)] ${referenceDragTarget ? "border-stone-400 dark:border-stone-500" : "border-stone-200/90 dark:border-white/[0.09]"}`}
                    onDragEnter={handleReferenceDragEnter}
                    onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
                    onDragLeave={handleReferenceDragLeave}
                    onDrop={handleReferenceDrop}
                >
                    <div className={`flex gap-2 overflow-x-auto ${references.length ? "mb-2" : "hidden"}`}>
                        {references.map((item, index) => (
                            <div key={item.id} className="group relative size-12 shrink-0 overflow-hidden rounded-lg border border-stone-200 dark:border-stone-800">
                                <img src={previewUrlFor(item.storageKey) || item.dataUrl} alt={item.name} className="size-full object-cover" />
                                <span className="absolute left-0.5 bottom-0.5 rounded bg-black/60 px-1 text-[9px] text-white">{index + 1}</span>
                                <button type="button" className="absolute right-0.5 top-0.5 flex size-5 items-center justify-center rounded bg-black/60 text-white sm:opacity-0 sm:group-hover:opacity-100" onClick={() => setReferences((value) => value.filter((ref) => ref.id !== item.id))} aria-label={t("videoWorkbench.removeImage")}><Trash2 className="size-3" /></button>
                            </div>
                        ))}
                    </div>
                    <Input.TextArea
                        value={prompt}
                        onChange={(event) => setPrompt(event.target.value)}
                        onMouseDown={closeInputPopovers}
                        onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && canGenerate && !running) { event.preventDefault(); void generate(); } }}
                        onPaste={(event) => { if (Array.from(event.clipboardData.files).some((file) => file.type.startsWith("image/"))) { event.preventDefault(); void addReferences(event.clipboardData.files); } }}
                        placeholder={t("videoWorkbench.promptPlaceholder")}
                        aria-label={t("workbench.prompt")}
                        autoSize={{ minRows: 1, maxRows: 4 }}
                        variant="borderless"
                        className="playground-prompt min-w-0 !border-0 !px-1 !py-2 !text-sm !outline-none !shadow-none focus:!border-0 focus:!outline-none focus:!ring-0 focus:!shadow-none focus-visible:!outline-none"
                    />
                    {referenceDragTarget && !references.length ? <div className="px-2 pb-1 text-xs text-stone-500">{t("videoWorkbench.dropReferences")}</div> : null}
                    <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-stone-200/80 pt-3 dark:border-white/[0.08] sm:mt-3 sm:gap-2.5">
                        <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto">
                            <ModelPicker flat showIcon={false} side="top" contentClassName="w-[var(--radix-select-trigger-width)] min-w-0" config={effectiveConfig} value={model} onChange={(value) => updateConfig("videoModel", value)} capability="video" className="!h-8 min-w-0 max-w-[220px] !rounded-full !border !border-stone-200/80 !bg-white/75 !px-3 !text-xs !font-medium !text-stone-600 !shadow-sm dark:!border-white/[0.08] dark:!bg-white/[0.04] dark:!text-stone-300 max-sm:w-full max-sm:max-w-none data-[size=default]:!h-8" onMissingConfig={() => openConfigDialog(false)} />
                            <VideoOptionPill label={t("settingsPanels.video.quality")} value={videoResolutionLabel(effectiveConfig.vquality || "720")} options={videoResolutionOptions} onChange={(value) => updateConfig("vquality", value)} />
                            <VideoOptionPill label={t("settingsPanels.video.ratio")} value={videoSizeLabel(effectiveConfig.size)} options={videoSizeOptions.map((option) => ({ ...option, label: option.label }))} onChange={(value) => updateConfig("size", normalizeVideoSizeValue(value, effectiveConfig.vquality || "720"))} />
                            <VideoOptionPill label={t("settingsPanels.video.seconds")} value={videoSecondsLabel(String(normalizeVideoSeconds(effectiveConfig.videoSeconds)))} options={Array.from({ length: videoSecondsRange.max - videoSecondsRange.min + 1 }, (_, index) => ({ value: String(videoSecondsRange.max - index), label: `${videoSecondsRange.max - index}s` }))} onChange={(value) => updateConfig("videoSeconds", value)} scrollable />
                            <VideoOptionPill label={t("settingsPanels.video.mode")} value={videoModeLabel(effectiveConfig.videoMode)} options={[{ value: "frames", label: videoModeLabel("frames") }, { value: "reference", label: videoModeLabel("reference") }]} onChange={(value) => updateConfig("videoMode", value)} autoHeight />
                        </div>
                        <div className="hidden min-w-4 flex-1 sm:block" />
                        {running ? <span className="shrink-0 text-xs tabular-nums text-stone-500">{formatDuration(elapsedMs)}</span> : null}
                        <Dropdown trigger={["click"]} placement="topRight" menu={{ items: [
                            { key: "upload", label: t("workbench.upload"), icon: <Upload className="size-3.5" /> },
                            { key: "clipboard", label: t("workbench.clipboard"), icon: <ClipboardPaste className="size-3.5" /> },
                            { key: "assets", label: t("workbench.viewAssets"), icon: <FolderPlus className="size-3.5" /> },
                        ], onClick: ({ key }) => { if (key === "upload") fileInputRef.current?.click(); else if (key === "clipboard") void addReferencesFromClipboard(); else setAssetPickerOpen(true); } }}>
                            <button type="button" className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-stone-200/90 bg-white/75 text-stone-600 shadow-sm transition-colors hover:bg-stone-50 hover:text-stone-900 dark:border-white/10 dark:bg-white/[0.04] dark:text-stone-300 dark:hover:bg-white/[0.08]" aria-label={t("imageWorkbench.addReferenceSource")}><Plus className="size-4" /></button>
                        </Dropdown>
                        <button type="button" className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-stone-900 !text-white shadow-[0_5px_14px_rgba(15,23,42,0.2)] transition-[transform,opacity,background-color] hover:-translate-y-0.5 hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-stone-100 dark:!text-stone-900 dark:hover:bg-stone-300" disabled={!canGenerate || running} onClick={() => void generate()} aria-label={t("workbench.generate")} title={t("workbench.generate")}>
                            {running ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                        </button>
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
            <WorkbenchLibraryDrawer open={libraryOpen} view={libraryView} imageIds={videoIds} mediaType="video" onClose={() => setLibraryOpen(false)} onSelect={setLibraryView} />
            <AssetPickerModal open={assetPickerOpen} defaultTab="my-assets" onInsert={(payload) => void insertPickedAsset(payload)} onClose={() => setAssetPickerOpen(false)} />
            <Modal title={t("workbench.deleteLogs")} open={deleteConfirmOpen} onCancel={() => setDeleteConfirmOpen(false)} onOk={deleteSelectedLogs} okText={t("common.delete")} okButtonProps={{ danger: true }} cancelText={t("common.cancel")}>
                {t("workbench.deleteLogsConfirm", { count: selectedLogIds.length })}
            </Modal>
        </div>
    );
}

function VideoOptionPill({ label, value, options, onChange, scrollable = false, autoHeight = false }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void; scrollable?: boolean; autoHeight?: boolean }) {
    const [open, setOpen] = useExclusivePopover();
    const triggerRef = useRef<HTMLButtonElement>(null);
    const [triggerWidth, setTriggerWidth] = useState<number>();
    return (
        <Dropdown
            trigger={["click"]}
            placement="topLeft"
            align={{ offset: [0, -12] }}
            open={open}
            onOpenChange={(nextOpen) => {
                if (nextOpen && triggerRef.current) setTriggerWidth(triggerRef.current.getBoundingClientRect().width);
                setOpen(nextOpen);
            }}
            popupRender={() => (
                <div className={`rounded-xl border border-stone-200 bg-white p-1 shadow-[0_18px_54px_rgba(28,25,23,0.18)] dark:border-stone-700 dark:bg-stone-900 ${scrollable ? "h-[240px] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" : autoHeight ? "overflow-hidden" : "h-[240px] overflow-hidden"}`} style={{ width: triggerWidth, minWidth: triggerWidth }}>
                    <div className={`flex ${scrollable ? "flex-col" : autoHeight ? "flex-col gap-1" : "h-[230px] flex-col justify-between"}`}>
                        {options.map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                aria-pressed={value === option.label}
                                className={`flex min-h-6 w-full items-center justify-center rounded-lg px-2 py-1 text-center text-xs transition-colors ${value === option.label ? "bg-stone-100 font-medium text-sky-600 dark:bg-white/[0.08] dark:text-sky-400" : "text-stone-600 hover:bg-stone-900/[0.05] hover:text-stone-900 dark:text-stone-300 dark:hover:bg-white/[0.06] dark:hover:text-white"}`}
                                onClick={() => { onChange(option.value); setOpen(false); }}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        >
            <button ref={triggerRef} type="button" aria-expanded={open} aria-label={label} title={label} className={WORKBENCH_PILL_CLASS}>
                <span className="text-stone-400">{label}</span>
                <span className="truncate">{value}</span>
            </button>
        </Dropdown>
    );
}

function ResultVideoCard({ video, onDownload, onSaveAsset }: { video: GeneratedVideo; onDownload: (video: GeneratedVideo) => void; onSaveAsset: (video: GeneratedVideo) => void }) {
    const { t } = useTranslation();
    const favorite = useWorkbenchLibraryStore((state) => state.videoFavoriteIds.includes(video.id));
    const toggleFavorite = useWorkbenchLibraryStore((state) => state.toggleVideoFavorite);
    return (
        <div className="overflow-hidden rounded-lg border border-stone-200 bg-background dark:border-stone-800">
            <video src={video.url} controls className="aspect-video w-full bg-black object-contain" />
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-stone-200 px-3 py-2.5 dark:border-stone-800">
                <div className="flex min-w-0 flex-wrap gap-x-2 gap-y-1 text-xs text-stone-500 dark:text-stone-400">
                    <span>
                        {video.width}x{video.height}
                    </span>
                    <span>{formatBytes(video.bytes)}</span>
                    <span>{formatDuration(video.durationMs)}</span>
                </div>
                <div className="flex shrink-0 gap-1">
                    <Tooltip title={t(favorite ? "imageWorkbench.unfavorite" : "imageWorkbench.favorite")}>
                        <Button size="small" type="text" className={favorite ? "!text-amber-500" : ""} icon={<Star className="size-3.5" fill={favorite ? "currentColor" : "none"} />} aria-pressed={favorite} onClick={() => toggleFavorite(video.id)} />
                    </Tooltip>
                    <WorkbenchFolderPicker imageId={video.id} mediaType="video" onSaveAsset={() => onSaveAsset(video)} />
                    <Button size="small" icon={<FolderPlus className="size-3.5" />} onClick={() => onSaveAsset(video)}>
                        {t("common.addToAssets")}
                    </Button>
                    <Button size="small" icon={<Download className="size-3.5" />} onClick={() => onDownload(video)}>
                        {t("common.download")}
                    </Button>
                </div>
            </div>
        </div>
    );
}

function PendingVideoCard() {
    const { t } = useTranslation();
    return (
        <div className="relative aspect-video overflow-hidden rounded-lg border border-dashed border-stone-300 bg-stone-50 dark:border-stone-700 dark:bg-stone-900">
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-stone-500 dark:text-stone-400">
                <LoaderCircle className="size-6 animate-spin" />
                <span>{t("workbench.generating")}</span>
            </div>
        </div>
    );
}

function FailedVideoCard({ error, onRetry }: { error: string; onRetry: () => void }) {
    const { t } = useTranslation();
    return (
        <div className="overflow-hidden rounded-lg border border-red-200 bg-red-50 dark:border-red-950 dark:bg-red-950/20">
            <div className="flex aspect-video flex-col items-center justify-center gap-3 p-5 text-center">
                <div className="text-sm font-medium text-red-600 dark:text-red-300">{t("workbench.failed")}</div>
                <Typography.Paragraph ellipsis={{ rows: 4 }} className="!mb-0 !text-xs !text-red-500 dark:!text-red-300">
                    {error}
                </Typography.Paragraph>
            </div>
            <div className="flex justify-end border-t border-red-200 p-3 dark:border-red-950">
                <Button size="small" danger onClick={onRetry}>
                    {t("workbench.retry")}
                </Button>
            </div>
        </div>
    );
}

function LogPanel({
    logs,
    selectedLogIds,
    activeLogId,
    onSelectedLogIdsChange,
    onCreateSession,
    onDeleteSelected,
    onPreviewLog,
}: {
    logs: GenerationLog[];
    selectedLogIds: string[];
    activeLogId?: string;
    onSelectedLogIdsChange: (ids: string[]) => void;
    onCreateSession: () => void;
    onDeleteSelected: () => void;
    onPreviewLog: (log: GenerationLog) => void;
}) {
    const { t } = useTranslation();
    const allSelected = Boolean(logs.length) && selectedLogIds.length === logs.length;
    const toggleAll = () => onSelectedLogIdsChange(allSelected ? [] : logs.map((log) => log.id));

    return (
        <>
            <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold">{t("workbench.logs")}</h2>
                <Tag className="m-0">{logs.length}</Tag>
            </div>
            <div className="mb-4 flex flex-wrap gap-2">
                <Button size="small" icon={<Plus className="size-3.5" />} onClick={onCreateSession}>
                    {t("workbench.new")}
                </Button>
                <Button size="small" icon={<CheckSquare className="size-3.5" />} disabled={!logs.length} onClick={toggleAll}>
                    {allSelected ? t("common.cancel") : t("workbench.selectAll")}
                </Button>
                <Button size="small" danger icon={<Trash2 className="size-3.5" />} disabled={!selectedLogIds.length} onClick={onDeleteSelected}>
                    {t("common.delete")}
                </Button>
            </div>
            <div className="space-y-3">
                {logs.map((log) => (
                    <LogCard key={log.id} log={log} selected={selectedLogIds.includes(log.id)} active={activeLogId === log.id} onSelectedChange={(checked) => onSelectedLogIdsChange(checked ? [...selectedLogIds, log.id] : selectedLogIds.filter((id) => id !== log.id))} onClick={() => onPreviewLog(log)} />
                ))}
                {!logs.length ? <div className="flex min-h-48 items-center justify-center rounded-lg border border-dashed border-stone-300 text-center text-sm text-stone-500 dark:border-stone-700">{t("workbench.noLogs")}</div> : null}
            </div>
        </>
    );
}

function LogCard({ log, selected, active, onSelectedChange, onClick }: { log: GenerationLog; selected: boolean; active: boolean; onSelectedChange: (checked: boolean) => void; onClick: () => void }) {
    const { t } = useTranslation();
    return (
        <button type="button" className={`block w-full rounded-lg border p-2 text-left transition ${active ? "border-stone-900 bg-blue-50 dark:border-stone-100 dark:bg-blue-950/20" : "border-stone-200 bg-background hover:bg-stone-50 dark:border-stone-800 dark:hover:bg-stone-900"}`} onClick={onClick}>
            <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2">
                <Checkbox className="mt-0.5" checked={selected} onClick={(event) => event.stopPropagation()} onChange={(event) => onSelectedChange(event.target.checked)} />
                <div className="min-w-0">
                    <div className="truncate text-sm font-semibold leading-5">{log.title}</div>
                    <div className="mt-2 flex flex-wrap gap-1">
                        <Tag className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none">{log.size}</Tag>
                        <Tag className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none">{log.resolution}p</Tag>
                        <Tag className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none">{log.seconds}s</Tag>
                    </div>
                </div>
                <div className="grid justify-items-end gap-2">
                    <Tag className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none" color={log.status === "success" ? "blue" : log.status === "pending" ? "processing" : "red"}>
                        {t(`workbench.${log.status === "success" ? "success" : log.status === "pending" ? "generating" : "failed"}`)}
                    </Tag>
                    <Tag className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none" color="green">
                        {formatDuration(log.durationMs)}
                    </Tag>
                </div>
            </div>
        </button>
    );
}

async function readStoredLogs() {
    if (typeof window === "undefined") return [];
    try {
        const logs: GenerationLog[] = [];
        await logStore.iterate<GenerationLog, void>((value) => {
            logs.push(value);
        });
        return (await Promise.all(logs.map(normalizeLog))).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    } catch {
        return [];
    }
}

async function normalizeLog(log: Partial<GenerationLog>): Promise<GenerationLog> {
    const video = log.video?.storageKey ? { ...log.video, url: await resolveMediaUrl(log.video.storageKey, log.video.url) } : log.video;
    const references = await Promise.all(
        (log.references || []).map(async (item) => {
            void ensureImagePreview(item.storageKey);
            return { ...item, dataUrl: await resolveImageUrl(item.storageKey, item.dataUrl) };
        }),
    );
    const config = normalizeLogConfig(log);
    return {
        id: log.id || nanoid(),
        createdAt: log.createdAt || Date.now(),
        title: log.title || log.model || i18n.t("workbench.untitled"),
        prompt: log.prompt || "",
        time: log.time || new Date().toLocaleString(i18n.resolvedLanguage, { hour12: false }),
        model: log.model || config.videoModel || "",
        config,
        references,
        durationMs: log.durationMs || 0,
        size: log.size || config.size || "",
        resolution: normalizeResolution(log.resolution || config.vquality || ""),
        seconds: log.seconds || config.videoSeconds || "",
        status: log.status || "success",
        task: log.task,
        video,
        error: log.error,
    };
}

function serializeLog(log: GenerationLog): GenerationLog {
    return {
        ...log,
        references: log.references.map((item) => ({ ...item, dataUrl: item.storageKey ? "" : item.dataUrl })),
        video: log.video?.storageKey ? { ...log.video, url: "" } : log.video,
    };
}

function moveListItem<T>(items: T[], index: number, offset: number) {
    const targetIndex = index + offset;
    if (targetIndex < 0 || targetIndex >= items.length) return items;
    const next = [...items];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    return next;
}

function ReferenceOrderButtons({ index, total, onMove }: { index: number; total: number; onMove: (offset: number) => void }) {
    if (total <= 1) return null;
    return (
        <div className="absolute inset-x-1 bottom-1 flex justify-between">
            <Button size="small" className="!h-6 !w-6 !min-w-6 !rounded-full !bg-white/85 !p-0 !shadow-sm" icon={<ArrowLeft className="size-3" />} disabled={index <= 0} onClick={() => onMove(-1)} />
            <Button size="small" className="!h-6 !w-6 !min-w-6 !rounded-full !bg-white/85 !p-0 !shadow-sm" icon={<ArrowRight className="size-3" />} disabled={index >= total - 1} onClick={() => onMove(1)} />
        </div>
    );
}

function normalizeLogConfig(log: Partial<GenerationLog>): GenerationLogConfig {
    return {
        model: log.config?.model || log.model || "",
        videoModel: log.config?.videoModel || log.model || "",
        size: log.config?.size || log.size || "",
        vquality: normalizeResolution(log.config?.vquality || log.resolution || ""),
        videoSeconds: log.config?.videoSeconds || log.seconds || "",
        videoGenerateAudio: log.config?.videoGenerateAudio || "true",
        videoWatermark: log.config?.videoWatermark || "false",
        videoMode: log.config?.videoMode === "reference" ? "reference" : "frames",
    };
}

function buildLog({ prompt, model, config, references, durationMs, status, task, video, error }: { prompt: string; model: string; config: AiConfig; references: ReferenceImage[]; durationMs: number; status: GenerationLog["status"]; task?: VideoGenerationTask; video?: GeneratedVideo; error?: string }): GenerationLog {
    const logConfig = {
        model: config.model,
        videoModel: config.videoModel,
        size: config.size,
        vquality: normalizeResolution(config.vquality),
        videoSeconds: config.videoSeconds,
        videoGenerateAudio: config.videoGenerateAudio,
        videoWatermark: config.videoWatermark,
        videoMode: config.videoMode === "reference" ? "reference" : "frames",
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
        size: logConfig.size,
        resolution: logConfig.vquality,
        seconds: logConfig.videoSeconds,
        status,
        task,
        video,
        error,
    };
}

function buildVideoConfig(config: AiConfig, model: string): AiConfig {
    return {
        ...config,
        model,
        videoModel: model,
        size: normalizeVideoSize(config.size),
        videoSeconds: normalizeVideoSeconds(config.videoSeconds),
        vquality: normalizeResolution(config.vquality),
        videoGenerateAudio: String(boolConfig(config.videoGenerateAudio, true)),
        videoWatermark: String(boolConfig(config.videoWatermark, false)),
        videoMode: config.videoMode === "reference" ? "reference" : "frames",
    };
}

function normalizeVideoSeconds(value: string) {
    if (String(value).trim() === "-1") return "-1";
    return clampVideoSeconds(value);
}

function normalizeVideoSize(value: string) {
    return normalizeVideoSizeValue(value);
}

function normalizeResolution(value: string) {
    return normalizeVideoResolutionValue(value);
}

function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
