import { useEffect, useRef, useState } from "react";
import { ArrowUp, LoaderCircle, MousePointer2, Plus, MoreHorizontal, Mic, Square, Sparkles, ChevronDown } from "lucide-react";
import { App, Button, Modal } from "antd";
import { useTranslation } from "react-i18next";
import { ModelPicker } from "@/components/model-picker";
import { resolveModelForCapability, useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { CanvasAtelierImageSettings } from "./canvas-atelier-image-settings";
import { CanvasImageQualityPopover } from "./canvas-image-quality-popover";
import { CanvasImageCountChip } from "./canvas-image-count-chip";
import { CanvasAudioSettingsPopover, type CanvasAudioSettingKey } from "./canvas-audio-settings-popover";
import { CanvasPromptChipInput } from "./canvas-prompt-chip-input";
import { CanvasVideoSettingsPopover } from "./canvas-video-settings-popover";
import { CanvasTextSettingsPopover } from "./canvas-text-settings-popover";
import { CanvasNodeType, type CanvasGenerationMode, type CanvasNodeData } from "@/types/canvas";
import type { CanvasResourceReference } from "@/lib/canvas/canvas-resource-references";
import { CanvasNodeReferenceBar } from "./canvas-node-reference-bar";
import { requestImageQuestion } from "@/services/api/image";
import { onCanvasPopoverDismiss } from "@/lib/canvas/canvas-popover-dismiss";
import atelierPresets from "@/lib/canvas/atelier-prompt-presets.json";
import { buildGenerationConfig } from "@/lib/canvas/canvas-generation-helpers";

export type CanvasNodeGenerationMode = CanvasGenerationMode;

type CanvasNodePromptPanelProps = {
    node: CanvasNodeData;
    isRunning: boolean;
    onPromptChange: (nodeId: string, prompt: string) => void;
    onConfigChange: (nodeId: string, patch: Partial<CanvasNodeData["metadata"]>) => void;
    onGenerate: (nodeId: string, mode: CanvasNodeGenerationMode, prompt: string) => void;
    onStop: (nodeId: string) => void;
    mentionReferences?: CanvasResourceReference[];
    nodes: CanvasNodeData[];
    connectedNodes?: CanvasNodeData[];
    onDisconnectReference?: (fromNodeId: string, toNodeId: string) => void;
    onStartReferenceSelection?: (nodeId: string) => void;
    onImageSettingsOpenChange?: (open: boolean) => void;
    modeOverride?: CanvasNodeGenerationMode; // Plugin nodes set their generation type through useBuiltinPanel.mode.
};

type SpeechResult = { results: ArrayLike<ArrayLike<{ transcript: string }>> };
type SpeechSession = { lang: string; interimResults: boolean; start: () => void; stop: () => void; onresult: ((event: SpeechResult) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };

export function CanvasNodePromptPanel({
    node,
    nodes,
    isRunning,
    onPromptChange,
    onConfigChange,
    onGenerate,
    onStop,
    mentionReferences = [],
    connectedNodes = [],
    onDisconnectReference,
    onStartReferenceSelection,
    onImageSettingsOpenChange,
    modeOverride,
}: CanvasNodePromptPanelProps) {
    const [libraryOpen, setLibraryOpen] = useState(false);
    const presetScrollRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (libraryOpen) presetScrollRef.current?.scrollTo({ top: 0 });
    }, [libraryOpen]);
    const { t } = useTranslation();
    const { message } = App.useApp();
    const globalConfig = useEffectiveConfig();
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const updateGlobalConfig = useConfigStore((state) => state.updateConfig);
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const mode = modeOverride ?? defaultMode(node.type);
    const config = buildGenerationConfig(globalConfig, node, mode);
    const hasTextContent = node.type === CanvasNodeType.Text && Boolean(node.metadata?.content?.trim());
    const hasImageContent = node.type === CanvasNodeType.Image && Boolean(node.metadata?.content);
    const [prompt, setPrompt] = useState(node.metadata?.composerContent ?? node.metadata?.prompt ?? "");
    const [expanded, setExpanded] = useState(false);
    const [parametersOpen, setParametersOpen] = useState(false);
    const [parametersMounted, setParametersMounted] = useState(false);
    const [presetsClosing, setPresetsClosing] = useState(false);
    const presetsCloseTimerRef = useRef<number | null>(null);
    const [enhancing, setEnhancing] = useState(false);
    const [listening, setListening] = useState(false);
    const recognitionRef = useRef<SpeechSession | null>(null);
    const enhanceRef = useRef<AbortController | null>(null);
    useEffect(() => {
        setPrompt(node.metadata?.composerContent ?? node.metadata?.prompt ?? "");
        setParametersOpen(false);
        setParametersMounted(false);
        setLibraryOpen(false);
        return () => {
            recognitionRef.current?.stop();
            enhanceRef.current?.abort();
        };
    }, [node.id]);
    useEffect(
        () => () => {
            if (presetsCloseTimerRef.current) window.clearTimeout(presetsCloseTimerRef.current);
        },
        [],
    );
    const closeLibrary = () => {
        if (!libraryOpen || presetsClosing) return;
        if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
            setLibraryOpen(false);
            return;
        }
        setPresetsClosing(true);
        if (presetsCloseTimerRef.current) window.clearTimeout(presetsCloseTimerRef.current);
        presetsCloseTimerRef.current = window.setTimeout(() => {
            setLibraryOpen(false);
            setPresetsClosing(false);
            presetsCloseTimerRef.current = null;
        }, 210);
    };
    useEffect(() => onCanvasPopoverDismiss(() => setLibraryOpen(false)), []);
    useEffect(() => {
        if (!parametersOpen) return;
        const close = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Element)) return;
            if (target.closest(".atelier-advanced-shell")) return;
            setParametersOpen(false);
        };
        document.addEventListener("pointerdown", close, true);
        return () => document.removeEventListener("pointerdown", close, true);
    }, [parametersOpen]);
    useEffect(() => {
        if (parametersOpen) {
            setParametersMounted(true);
            return;
        }
        const timer = window.setTimeout(() => setParametersMounted(false), 320);
        return () => window.clearTimeout(timer);
    }, [parametersOpen]);
    const updatePrompt = (value: string) => {
        setPrompt(value);
        if (hasTextContent || hasImageContent) onConfigChange(node.id, { composerContent: value });
        else onPromptChange(node.id, value);
    };
    const submit = () => {
        if (prompt.trim() && !isRunning) onGenerate(node.id, mode, prompt.trim());
    };
    const enhance = async () => {
        const model = resolveModelForCapability(globalConfig, undefined, "text");
        if (!model) {
            openConfigDialog(true);
            return;
        }
        const controller = new AbortController();
        enhanceRef.current = controller;
        setEnhancing(true);
        try {
            const answer = await requestImageQuestion({ ...globalConfig, model }, [{ role: "user", content: [{ type: "text", text: "请润色以下生成提示词，保留原始意图，补充构图、光线和材质细节。只输出提示词正文：\n" + prompt }] }], () => {}, {
                signal: controller.signal,
            });
            if (!controller.signal.aborted) updatePrompt(answer);
        } catch (error) {
            if (!controller.signal.aborted) message.error(error instanceof Error ? error.message : "提示词增强失败");
        } finally {
            setEnhancing(false);
        }
    };
    const voice = () => {
        if (listening) {
            recognitionRef.current?.stop();
            return;
        }
        const Speech =
            (window as unknown as { SpeechRecognition?: new () => SpeechSession; webkitSpeechRecognition?: new () => SpeechSession }).SpeechRecognition ||
            (window as unknown as { webkitSpeechRecognition?: new () => SpeechSession }).webkitSpeechRecognition;
        if (!Speech) {
            message.info("当前浏览器不支持语音输入，请使用文字输入");
            return;
        }
        const recognition = new Speech();
        recognition.lang = "zh-CN";
        recognition.interimResults = false;
        recognition.onresult = (event) =>
            updatePrompt(
                [
                    prompt,
                    Array.from(event.results)
                        .map((result) => result[0].transcript)
                        .join(""),
                ]
                    .filter(Boolean)
                    .join(" "),
            );
        recognition.onend = () => setListening(false);
        recognition.onerror = () => {
            setListening(false);
            message.warning("无法使用麦克风，请检查浏览器权限");
        };
        recognitionRef.current = recognition;
        try {
            recognition.start();
            setListening(true);
        } catch {
            message.warning("语音输入启动失败");
        }
    };
    return (
        <div
            data-canvas-no-zoom
            className="atelier-prompt-panel"
            style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onWheel={(event) => event.stopPropagation()}
        >
            <div className="atelier-prompt-top">
                <button type="button" className="atelier-square-button" aria-label="焦点编辑" title="焦点编辑" onClick={() => setExpanded(true)}>
                    <MousePointer2 size={17} />
                </button>
                <button type="button" className="atelier-square-button" aria-label="从画布选择可连接的参考节点" title="从画布选择可连接的参考节点" onClick={() => onStartReferenceSelection?.(node.id)}>
                    <Plus size={18} />
                </button>
                {connectedNodes.length ? (
                    <div className="min-w-0 flex-1">
                        <CanvasNodeReferenceBar nodeId={node.id} nodes={nodes} connectedNodes={connectedNodes} onDisconnect={onDisconnectReference} headerAddButton compact />
                    </div>
                ) : null}
            </div>
            {libraryOpen ? (
                <div className={`atelier-preset-section${presetsClosing ? " is-closing" : ""}`}>
                    <button type="button" className="atelier-preset-heading" aria-expanded={true} onClick={closeLibrary}>
                        常用提示词库
                        <ChevronDown size={13} className="rotate-180" />
                    </button>
                    <div ref={presetScrollRef} className="atelier-preset-list" role="list" aria-label="常用提示词">
                        {atelierPresets.map((preset, index) => (
                            <button
                                type="button"
                                key={preset.id}
                                role="listitem"
                                className="atelier-preset-chip"
                                style={{ animationDelay: `${Math.min(5, Math.floor(index / 8)) * 18}ms` }}
                                title={`点击应用：${preset.name}`}
                                onClick={() => {
                                    updatePrompt(preset.prompt);
                                    closeLibrary();
                                }}
                            >
                                {preset.name}
                            </button>
                        ))}
                    </div>
                </div>
            ) : null}
            <div className="atelier-prompt-editor-shell">
                <CanvasPromptChipInput
                    value={prompt}
                    references={mentionReferences}
                    onChange={updatePrompt}
                    onSubmit={submit}
                    className="atelier-prompt-editor thin-scrollbar w-full cursor-text resize-none"
                    style={{ background: "transparent", color: theme.node.text }}
                    placeholder="输入提示词..."
                />
            </div>
            <div className="atelier-prompt-footer">
                <div className="atelier-prompt-options">
                    <ModelPicker flat config={config} value={config.model} onChange={(model) => onConfigChange(node.id, { model })} capability={mode} onMissingConfig={() => openConfigDialog(true)} className="min-w-0 max-w-[190px]" contentClassName="atelier-model-menu" />
                    <span className="atelier-status-divider" />
                    {mode === "image" ? (
                        <CanvasAtelierImageSettings
                            config={config}
                            onChange={(patch) => onConfigChange(node.id, patch)}
                            onOpenChange={(open) => {
                                if (open) closeLibrary();
                                onImageSettingsOpenChange?.(open);
                            }}
                        />
                    ) : mode === "video" ? (
                        <CanvasVideoSettingsPopover flat config={config} buttonClassName="!h-7 !px-0" onConfigChange={(key, value) => onConfigChange(node.id, videoConfigPatch(key, value))} />
                    ) : mode === "audio" ? (
                        <CanvasAudioSettingsPopover flat config={config} buttonClassName="!h-7 !px-0" onConfigChange={(key, value) => onConfigChange(node.id, audioConfigPatch(key, value))} />
                    ) : (
                        <CanvasTextSettingsPopover
                            flat
                            config={config}
                            count={node.metadata?.textCount || 1}
                            buttonClassName="!h-7 !px-0"
                            onConfigChange={(_, value) => onConfigChange(node.id, { reasoningEffort: value })}
                            onCountChange={(textCount) => onConfigChange(node.id, { textCount })}
                        />
                    )}
                    <span className="atelier-status-divider" />
                    {mode === "image" ? (
                        <CanvasImageQualityPopover flat quality={config.quality || "auto"} onChange={(quality) => onConfigChange(node.id, { quality })} buttonClassName="!h-7 !px-0" />
                    ) : null}
                    {!libraryOpen ? (
                        <button type="button" className="atelier-library-trigger" aria-label="词库" aria-expanded={false} title="打开词库" onClick={() => setLibraryOpen(true)}>
                            词库
                        </button>
                    ) : null}
                    <div className="atelier-advanced-shell" data-open={parametersOpen ? "true" : undefined}>
                        {!parametersMounted ? (
                            <button
                                type="button"
                                className="atelier-icon-button"
                                aria-label="展开参数"
                                aria-expanded={false}
                                onClick={() => {
                                    setParametersOpen(true);
                                    closeLibrary();
                                }}
                            >
                                <MoreHorizontal size={17} />
                            </button>
                        ) : (
                            <div className="atelier-advanced" data-state={parametersOpen ? "open" : "closing"}>
                                <label className="atelier-base64">
                                    <input type="checkbox" aria-label="B64" checked={globalConfig.imageReferencesAsBase64 !== false} onChange={(event) => updateGlobalConfig("imageReferencesAsBase64", event.target.checked)} />
                                    B64
                                </label>
                                {mode === "image" ? <CanvasImageCountChip value={Number(config.count) || 1} onChange={(count) => onConfigChange(node.id, { count })} /> : null}
                                <button
                                    type="button"
                                    className="atelier-icon-button"
                                    aria-label="收起参数"
                                    aria-expanded={true}
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        setParametersOpen(false);
                                    }}
                                >
                                    <ChevronDown size={15} />
                                </button>
                            </div>
                        )}
                    </div>
                </div>
                <div className="atelier-prompt-actions">
                    <button type="button" className="atelier-icon-button" aria-label="增强提示词" title="增强提示词" disabled={!prompt.trim() || enhancing} onClick={() => void enhance()}>
                        {enhancing ? <LoaderCircle size={15} className="animate-spin" /> : <Sparkles size={15} />}
                    </button>
                    <button type="button" className="atelier-icon-button" aria-label={listening ? "停止语音输入" : "语音输入"} title="语音输入" aria-pressed={listening} onClick={voice}>
                        <Mic size={15} />
                    </button>
                    <button
                        type="button"
                        className="atelier-send"
                        aria-label={isRunning ? t("canvas.promptPanel.stopGeneration") : t("canvas.promptPanel.generate")}
                        disabled={!isRunning && !prompt.trim()}
                        onClick={isRunning ? () => onStop(node.id) : submit}
                    >
                        {isRunning ? <Square size={13} /> : <ArrowUp size={18} />}
                    </button>
                </div>
            </div>
            <Modal title={t("canvas.promptPanel.editorTitle")} open={expanded} centered width={760} footer={null} onCancel={() => setExpanded(false)} destroyOnHidden>
                <div data-canvas-no-zoom onWheel={(event) => event.stopPropagation()}>
                    <CanvasNodeReferenceBar
                        nodeId={node.id}
                        nodes={nodes}
                        connectedNodes={connectedNodes}
                        onDisconnect={onDisconnectReference}
                        onStartSelection={(id) => {
                            setExpanded(false);
                            onStartReferenceSelection?.(id);
                        }}
                    />
                    <CanvasPromptChipInput
                        value={prompt}
                        references={mentionReferences}
                        onChange={updatePrompt}
                        className="thin-scrollbar h-[52dvh] min-h-60 w-full cursor-text overflow-y-auto border rounded-xl p-4 outline-none"
                        style={{ borderColor: theme.toolbar.border, color: theme.node.text }}
                        placeholder="输入提示词..."
                    />
                    <div className="flex justify-end pt-3">
                        <Button onClick={() => setExpanded(false)}>完成</Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
function defaultMode(type: CanvasNodeData["type"]): CanvasNodeGenerationMode {
    return type === CanvasNodeType.Text ? "text" : type === CanvasNodeType.Video ? "video" : type === CanvasNodeType.Audio ? "audio" : "image";
}

function videoConfigPatch(key: keyof AiConfig, value: string) {
    if (key === "videoSeconds") return { seconds: value };
    if (key === "videoGenerateAudio") return { generateAudio: value };
    if (key === "videoWatermark") return { watermark: value };
    if (key === "videoMode") return { videoMode: value };
    return { [key]: value };
}

function audioConfigPatch(key: CanvasAudioSettingKey, value: string) {
    if (key === "audioVoice") return { audioVoice: value };
    if (key === "audioFormat") return { audioFormat: value };
    if (key === "audioSpeed") return { audioSpeed: value };
    return { audioInstructions: value };
}
