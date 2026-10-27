import { useEffect, useRef, useState } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { ChevronDown, ChevronLeft, Plus, Type, Image as ImageIcon, Video, Music2, Undo2, Redo2, Settings2, MousePointer2, Hand, Puzzle, Eraser, Grid2x2, Grip, Square, Info, Scan } from "lucide-react";
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
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const toolbarDock = useCanvasSidePanelStore((state) => state.toolbarDock);
    const setToolbarDock = useCanvasSidePanelStore((state) => state.setToolbarDock);
    const [dockTransition, setDockTransition] = useState<"idle" | "exit-left" | "enter-bottom" | "exit-bottom" | "enter-left">("idle");
    const dockTransitionTimers = useRef<number[]>([]);
    type ToolbarMenu = "create" | "settings";
    const [menu, setMenu] = useState<ToolbarMenu | null>(null);
    const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | null>(null);
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
    const toggle = (value: ToolbarMenu, event: ReactMouseEvent<HTMLButtonElement>) => {
        if (menu === value) {
            setMenu(null);
            return;
        }
        const root = rootRef.current;
        if (root) {
            const rootRect = root.getBoundingClientRect();
            const triggerRect = event.currentTarget.getBoundingClientRect();
            setMenuAnchor({
                x: triggerRect.left + triggerRect.width / 2 - rootRect.left,
                y: triggerRect.top + triggerRect.height / 2 - rootRect.top,
            });
        }
        setMenu(value);
    };
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
            <div className="atelier-tools-primary">
                <button type="button" className="atelier-tool atelier-tool-add" aria-label="更多工具" title="更多工具" aria-expanded={menu === "create"} onClick={(event) => toggle("create", event)}>
                    <Plus size={21} />
                </button>
                <button type="button" className="atelier-tool" aria-label="切换选择与移动" title={t("canvas.toolbar." + canvasTool)} aria-pressed={canvasTool === "select"} onClick={() => onCanvasToolChange(canvasTool === "select" ? "pan" : "select")}>
                    {canvasTool === "select" ? <MousePointer2 size={18} /> : <Hand size={18} />}
                </button>
                <button type="button" className="atelier-tool" aria-label={t("canvas.undo")} title={t("canvas.undo")} disabled={!canUndo} onClick={onUndo}>
                    <Undo2 size={18} />
                </button>
                <button type="button" className="atelier-tool" aria-label={t("canvas.redo")} title={t("canvas.redo")} disabled={!canRedo} onClick={onRedo}>
                    <Redo2 size={18} />
                </button>
                <button type="button" className="atelier-tool" aria-label={t("navigation.config")} title={t("navigation.config")} onClick={() => openConfigDialog(false)}>
                    <Settings2 size={18} />
                </button>
                {/*
                 * 这个按钮管的是画布背景（点阵 / 网格 / 纯色），不是主题切换。
                 * 原来用月亮/太阳图标，看起来像"切深浅色"，实际点开只有背景选项，
                 * 图标和行为对不上；换成网格图标，和菜单里的三项一致。
                 * 同时把 title 里误导性的"主题：深色"去掉，改成当前背景模式。
                 */}
                <button
                    type="button"
                    className="atelier-tool"
                    aria-label="画布背景"
                    title={`画布背景：${backgroundMode === "dots" ? "点阵" : backgroundMode === "lines" ? "网格" : "纯色"}`}
                    aria-expanded={menu === "settings"}
                    onClick={(event) => toggle("settings", event)}
                >
                    <Grid2x2 size={18} />
                </button>
            </div>
            <div className="atelier-tools-extra">
                <button type="button" className="atelier-tool" aria-label={t("canvas.toolbar.focus")} title={t("canvas.toolbar.focus")} disabled={!selectedCount} onClick={onFocusSelected}>
                    <Scan size={18} />
                </button>
                <button type="button" className="atelier-tool" aria-label={t("canvas.toolbar.clear")} title={t("canvas.toolbar.clear")} onClick={onClear}>
                    <Eraser size={18} />
                </button>
                <button
                    type="button"
                    className="atelier-tool atelier-tool-toggle"
                    aria-label={t("canvas.toolbar.imageInfo")}
                    title={`${t("canvas.toolbar.imageInfo")}：${showImageInfo ? "已开启" : "已关闭"}`}
                    aria-pressed={showImageInfo}
                    onClick={() => onShowImageInfoChange(!showImageInfo)}
                >
                    <Info size={18} />
                </button>
            </div>
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
                <div
                    className="atelier-tool-menu-anchor"
                    style={
                        {
                            "--atelier-menu-anchor-x": `${menuAnchor?.x ?? 0}px`,
                            "--atelier-menu-anchor-y": `${menuAnchor?.y ?? 0}px`,
                        } as CSSProperties
                    }
                >
                    <div className="atelier-tool-menu" role="menu" style={{ background: theme.node.panel, borderColor: theme.toolbar.border }}>
                        <div className="atelier-menu-caption">{menu === "create" ? "添加节点" : "画布选项"}</div>
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
                        {menu === "settings" ? (
                            <>
                                {(["dots", "lines", "blank"] as const).map((mode) => (
                                    <button
                                        key={mode}
                                        type="button"
                                        className="atelier-menu-row"
                                        aria-pressed={backgroundMode === mode}
                                        onClick={() => {
                                            action(() => onBackgroundModeChange(mode));
                                        }}
                                    >
                                        {mode === "dots" ? <Grip size={16} /> : mode === "lines" ? <Grid2x2 size={16} /> : <Square size={16} />}
                                        <span>{mode === "dots" ? "点阵背景" : mode === "lines" ? "网格背景" : "纯色背景"}</span>
                                        {backgroundMode === mode ? <span className="atelier-menu-current">当前</span> : null}
                                    </button>
                                ))}
                            </>
                        ) : null}
                    </div>
                </div>
            ) : null}
        </div>
    );
}
