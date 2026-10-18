import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown, ChevronLeft, Plus, Type, Image as ImageIcon, Video, Music2, Undo2, Redo2, Settings2, MousePointer2, Hand, Trash2, LocateFixed, Puzzle, Eraser, Grid2x2, Sun, Moon, FolderOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { canvasThemes, type CanvasBackgroundMode } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { useConfigStore } from "@/stores/use-config-store";
import { useCanvasSidePanelStore } from "@/stores/use-canvas-side-panel-store";
import { getNodePluginId, listNodeDefinitions, useNodeRegistryVersion } from "@/lib/canvas/node-registry";
import { getNodeSpec } from "@/constant/canvas";
import "./canvas-atelier.css";

export function CanvasToolbar({
    selectedCount,
    canvasTool,
    canUndo,
    canRedo,
    backgroundMode,
    showImageInfo,
    onAddImage,
    onAddVideo,
    onAddAudio,
    onAddText,
    onAddExtensionNode,
    onUndo,
    onRedo,
    onDelete,
    onClear,
    onCanvasToolChange,
    onBackgroundModeChange,
    onShowImageInfoChange,
    onFocusSelected,
    onFitChange,
}: {
    selectedCount: number;
    canvasTool: "select" | "pan";
    canUndo: boolean;
    canRedo: boolean;
    backgroundMode: CanvasBackgroundMode;
    showImageInfo: boolean;
    onAddImage: () => void;
    onAddVideo: () => void;
    onAddAudio: () => void;
    onAddText: () => void;
    onAddExtensionNode: (type: string) => void;
    onUndo: () => void;
    onRedo: () => void;
    onDelete: () => void;
    onClear: () => void;
    onCanvasToolChange: (tool: "select" | "pan") => void;
    onBackgroundModeChange: (mode: CanvasBackgroundMode) => void;
    onShowImageInfoChange: (show: boolean) => void;
    onFocusSelected: () => void;
    /** 上报当前自适应比例，让左下角缩放控件跟着一起缩放、保持两条浮条等高。 */
    onFitChange?: (fit: number) => void;
}) {
    const { t } = useTranslation();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const colorTheme = useThemeStore((state) => state.theme);
    const setTheme = useThemeStore((state) => state.setTheme);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const toggleSidePanel = useCanvasSidePanelStore((state) => state.togglePanel);
    const toolbarDock = useCanvasSidePanelStore((state) => state.toolbarDock);
    const setToolbarDock = useCanvasSidePanelStore((state) => state.setToolbarDock);
    const [dockTransition, setDockTransition] = useState<"idle" | "exit-left" | "enter-bottom" | "exit-bottom" | "enter-left">("idle");
    const dockTransitionTimers = useRef<number[]>([]);
    const [menu, setMenu] = useState<"create" | "history" | "settings" | "background" | null>(null);
    const rootRef = useRef<HTMLDivElement>(null);
    useNodeRegistryVersion();
    const extensions = listNodeDefinitions().filter((def) => def.showInCreateMenu !== false && getNodePluginId(def.type) !== "builtin");
    useEffect(() => {
        onFitChange?.(1);
    }, [onFitChange]);
    useEffect(
        () => () => {
            dockTransitionTimers.current.forEach((timer) => window.clearTimeout(timer));
        },
        [],
    );
    useEffect(() => {
        if (!menu) return;
        const close = (event: PointerEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) setMenu(null);
        };
        const key = (event: KeyboardEvent) => {
            if (event.key === "Escape") setMenu(null);
        };
        window.addEventListener("pointerdown", close, true);
        window.addEventListener("keydown", key);
        return () => {
            window.removeEventListener("pointerdown", close, true);
            window.removeEventListener("keydown", key);
        };
    }, [menu]);
    const toggle = (value: typeof menu) => setMenu((current) => (current === value ? null : value));
    const switchToolbarDock = () => {
        if (dockTransition !== "idle") return;
        setMenu(null);
        const nextDock = toolbarDock === "bottom" ? "left" : "bottom";
        if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
            setToolbarDock(nextDock);
            return;
        }
        setDockTransition(toolbarDock === "bottom" ? "exit-bottom" : "exit-left");
        const exitMs = 180;
        const enterMs = 320;
        const exitTimer = window.setTimeout(() => {
            setToolbarDock(nextDock);
            setDockTransition(nextDock === "bottom" ? "enter-bottom" : "enter-left");
        }, exitMs);
        const enterTimer = window.setTimeout(() => setDockTransition("idle"), exitMs + enterMs);
        dockTransitionTimers.current.push(exitTimer, enterTimer);
    };
    const action = (run: () => void) => {
        run();
        setMenu(null);
    };
    const row = (label: string, icon: ReactNode, run: () => void, disabled = false) => (
        <button type="button" className="atelier-menu-row" onClick={() => action(run)} disabled={disabled}>
            {icon}
            <span>{label}</span>
        </button>
    );
    return (
        <div
            ref={rootRef}
            className={`atelier-tools${toolbarDock === "bottom" ? " atelier-tools--bottom" : ""}${dockTransition !== "idle" ? ` atelier-tools--${dockTransition}` : ""}`}
            data-canvas-bottom-toolbar
            data-canvas-no-zoom
            style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.toolbar.item }}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
        >
            <button type="button" className="atelier-tool atelier-tool-add" aria-label="更多工具" title="更多工具" aria-expanded={menu === "create"} onClick={() => toggle("create")}>
                <Plus size={21} />
            </button>
            <button type="button" className="atelier-tool" aria-label="切换选择与移动" title={t("canvas.toolbar." + canvasTool)} aria-pressed={canvasTool === "select"} onClick={() => onCanvasToolChange(canvasTool === "select" ? "pan" : "select")}>
                {canvasTool === "select" ? <MousePointer2 size={18} /> : <Hand size={18} />}
            </button>
            <button type="button" className="atelier-tool" aria-label="操作历史" title="操作历史" aria-expanded={menu === "history"} onClick={() => toggle("history")}>
                <Undo2 size={18} />
            </button>
            <button type="button" className="atelier-tool" aria-label={t("navigation.config")} title={t("navigation.config")} onClick={() => openConfigDialog(false)}>
                <Settings2 size={18} />
            </button>
            <button type="button" className="atelier-tool" aria-label="画布背景" title="画布背景" aria-expanded={menu === "background"} onClick={() => toggle("background")}>
                <Grid2x2 size={18} />
            </button>
            <button type="button" className="atelier-tool" aria-label="画布选项" title="画布选项" aria-expanded={menu === "settings"} onClick={() => toggle("settings")}>
                <LocateFixed size={18} />
            </button>
            <button
                type="button"
                className="atelier-tool atelier-tool-dock"
                aria-label={toolbarDock === "bottom" ? "移到左侧" : "移到底部"}
                title={toolbarDock === "bottom" ? "移到左侧" : "移到底部"}
                onClick={switchToolbarDock}
            >
                {toolbarDock === "bottom" ? <ChevronLeft size={17} /> : <ChevronDown size={17} />}
            </button>
            {menu ? (
                <div className="atelier-tool-menu" role="menu" style={{ background: theme.node.panel, borderColor: theme.toolbar.border }}>
                    <div className="atelier-menu-caption">{menu === "create" ? "添加节点" : menu === "history" ? "操作历史" : menu === "background" ? "画布背景" : "画布选项"}</div>
                    {menu === "create" ? (
                        <>
                            {row(t("canvas.toolbar.image"), <ImageIcon size={16} />, onAddImage)}
                            {row(t("canvas.toolbar.video"), <Video size={16} />, onAddVideo)}
                            {row(t("canvas.toolbar.text"), <Type size={16} />, onAddText)}
                            {row(t("canvas.toolbar.audio"), <Music2 size={16} />, onAddAudio)}
                            {extensions.map((def) => (
                                <div key={def.type}>{row(getNodeSpec(def.type).title, <Puzzle size={16} />, () => onAddExtensionNode(def.type))}</div>
                            ))}
                        </>
                    ) : null}
                    {menu === "history" ? (
                        <>
                            {row(t("canvas.undo"), <Undo2 size={16} />, onUndo, !canUndo)}
                            {row(t("canvas.redo"), <Redo2 size={16} />, onRedo, !canRedo)}
                        </>
                    ) : null}
                    {menu === "background" ? (
                        <>
                            {(["dots", "lines", "blank"] as const).map((mode) => (
                                <button
                                    key={mode}
                                    type="button"
                                    className="atelier-menu-row"
                                    aria-pressed={backgroundMode === mode}
                                    onClick={() => {
                                        onBackgroundModeChange(mode);
                                        setMenu(null);
                                    }}
                                >
                                    <Grid2x2 size={16} />
                                    <span>{mode === "dots" ? "点阵背景" : mode === "lines" ? "网格背景" : "纯色背景"}</span>
                                    {backgroundMode === mode ? <span className="ml-auto text-xs opacity-60">当前</span> : null}
                                </button>
                            ))}
                        </>
                    ) : null}
                    {menu === "settings" ? (
                        <>
                            {row("素材库", <FolderOpen size={16} />, toggleSidePanel)}
                            {row(colorTheme === "dark" ? "切换到浅色主题" : "切换到深色主题", colorTheme === "dark" ? <Sun size={16} /> : <Moon size={16} />, () => setTheme(colorTheme === "dark" ? "light" : "dark"))}
                            {row(t("canvas.toolbar.focus"), <LocateFixed size={16} />, onFocusSelected, !selectedCount)}
                            <label className="atelier-menu-row">
                                <input type="checkbox" checked={showImageInfo} onChange={(event) => onShowImageInfoChange(event.target.checked)} />
                                <span>{t("canvas.toolbar.imageInfo")}</span>
                            </label>
                            {row(t("canvas.deleteSelected"), <Trash2 size={16} />, onDelete, !selectedCount)}
                            {row(t("canvas.toolbar.clear"), <Eraser size={16} />, onClear)}
                        </>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}
