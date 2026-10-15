import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Segmented, Switch } from "antd";
import { CircleDot, Eraser, Grid2x2, Group, Hand, Image as ImageIcon, Info, LocateFixed, Moon, MousePointer2, Music2, Palette, Puzzle, Redo2, Settings2, Square, Sun, Trash2, Type, Undo2, Upload, Video } from "lucide-react";

import "./canvas-dock.css";

import { canvasThemes, type CanvasBackgroundMode } from "@/lib/canvas-theme";
import { getNodePluginId, listNodeDefinitions, useNodeRegistryVersion } from "@/lib/canvas/node-registry";
import { getNodeSpec } from "@/constant/canvas";
import { useThemeStore } from "@/stores/use-theme-store";
import { ThemeSwitch } from "@/components/ui/theme-switch";
import { useTranslation } from "react-i18next";

/*
 * Dock 参数，含义与 reactbits 原版一一对应（见 canvas-dock.css 顶部的说明）。
 * 静止尺寸沿用改造前的工具栏：图标 32px、面板高 56px、间距 4px。
 * peak / distance 按原版与 base 的比例折算（原版 50→70、distance 200、间距 60），
 * 所以放大倍率仍是 1.4×、影响范围仍是左右各三项左右。
 */
const RAW_BASE = 32;
const RAW_PEAK = 45;
const RAW_PANEL = 56;
const RAW_GAP = 4;
const RAW_DISTANCE = 120;
/** 圆角：键帽半径 = base * ROUNDNESS * 0.5，面板半径 = 键帽半径 + 内边距（原版的同心圆角）。 */
const ROUNDNESS = 0.5;
const SPRING = { mass: 0.1, stiffness: 150, damping: 12 };
/** 原版量可用宽度时留的边距。 */
const EDGE = 12;
/** 放不开时整体缩小的下限，跟原版一致。 */
const MIN_FIT = 0.4;
const DANGER = "#f87171";

type DockLayout = { fit: number; isItem: boolean[] };

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
    onAddConfig,
    onAddGroup,
    onAddExtensionNode,
    onUndo,
    onRedo,
    onUpload,
    onDelete,
    onClear,
    onCanvasToolChange,
    onBackgroundModeChange,
    onShowImageInfoChange,
    onFocusSelected,
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
    onAddConfig: () => void;
    onAddGroup: () => void;
    onAddExtensionNode: (type: string) => void;
    onUndo: () => void;
    onRedo: () => void;
    onUpload: () => void;
    onDelete: () => void;
    onClear: () => void;
    onCanvasToolChange: (tool: "select" | "pan") => void;
    onBackgroundModeChange: (mode: CanvasBackgroundMode) => void;
    onShowImageInfoChange: (show: boolean) => void;
    onFocusSelected: () => void;
}) {
    const wrapRef = useRef<HTMLDivElement>(null);
    const { t } = useTranslation();
    const rootRef = useRef<HTMLDivElement>(null);
    const colorTheme = useThemeStore((state) => state.theme);
    const setTheme = useThemeStore((state) => state.setTheme);
    const theme = canvasThemes[colorTheme];
    const [appearanceOpen, setAppearanceOpen] = useState(false);
    const [panelX, setPanelX] = useState(0);
    const [extensionsOpen, setExtensionsOpen] = useState(false);
    const [extPanelX, setExtPanelX] = useState(0);
    const [dock, setDock] = useState<DockLayout>({ fit: 1, isItem: [] });
    // Keep extension plugin nodes synchronized with registry changes.
    useNodeRegistryVersion();
    const extensionDefs = listNodeDefinitions().filter((def) => def.showInCreateMenu !== false && getNodePluginId(def.type) !== "builtin");
    const isLight = colorTheme === "light";

    /*
     * 量放不放得下。原版在放不下时整条等比缩小（而不是出现横向滚动条）——
     * 因为放大动效要求面板 overflow 可见，一旦允许滚动，长大的键帽会被裁掉。
     */
    useLayoutEffect(() => {
        const panel = wrapRef.current;
        const host = panel?.offsetParent as HTMLElement | null;
        if (!panel || !host) return;

        const measure = () => {
            const kids = Array.from(panel.children);
            const isItem = kids.map((child) => child.classList.contains("canvas-dock-item"));
            const itemCount = isItem.filter(Boolean).length;
            const rawLength = itemCount * RAW_BASE + (kids.length - itemCount) * 1 + RAW_GAP * Math.max(0, kids.length - 1) + (RAW_PANEL - RAW_BASE);
            const room = host.clientWidth - EDGE * 2;
            const next = rawLength > 0 ? Math.min(1, Math.max(MIN_FIT, room / rawLength)) : 1;
            const fit = Math.round(next * 1000) / 1000;
            // 只有真变了才换引用。否则 ResizeObserver 每响一次就产生一个新对象，
            // 下面的动画 effect 会被反复重建、中途清掉内联尺寸，放大永远起不来。
            setDock((prev) => {
                const same = prev.fit === fit && prev.isItem.length === isItem.length && prev.isItem.every((value, index) => value === isItem[index]);
                return same ? prev : { fit, isItem };
            });
        };

        measure();
        const resize = new ResizeObserver(measure);
        resize.observe(host);
        // 扩展节点 / 删除按钮是按条件渲染的，增删项时长度会变，得重新量。
        const mutate = new MutationObserver(measure);
        mutate.observe(panel, { childList: true });
        return () => {
            resize.disconnect();
            mutate.disconnect();
        };
    }, []);

    /*
     * 放大动效。每帧按「指针到这一项静止位的距离」算目标尺寸，再走弹簧插值，
     * 然后把尺寸写成项的宽高、把 `size / base` 写成键帽的 scale。
     * 项本身是 flex 子项，宽高一变邻居就被推开 —— 这就是 dock 的观感来源。
     */
    useEffect(() => {
        const panel = wrapRef.current;
        if (!panel || !dock.isItem.some(Boolean)) return;

        const base = RAW_BASE * dock.fit;
        const peak = RAW_PEAK * dock.fit;
        const gap = RAW_GAP * dock.fit;
        const distance = RAW_DISTANCE * dock.fit;
        const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

        // 槽位：分隔线也要占位，否则 rest 位置会和实际布局错开。
        const slots: (HTMLElement | null)[] = Array.from(panel.children).map((child) => (child.classList.contains("canvas-dock-item") ? (child as HTMLElement) : null));
        const spans = slots.map((el) => (el ? base : 1));
        let cursor = -(spans.reduce((sum, span) => sum + span, 0) + gap * Math.max(0, spans.length - 1)) / 2;
        const rest = spans.map((span) => {
            const middle = cursor + span / 2;
            cursor += span + gap;
            return middle;
        });

        const motion = new Map<number, { size: number; velocity: number }>();
        const entry = (index: number) => {
            let state = motion.get(index);
            if (!state) {
                state = { size: base, velocity: 0 };
                motion.set(index, state);
            }
            return state;
        };

        const pointer = { x: 0, inside: false };
        let raf = 0;
        let last = performance.now();
        let alive = true;
        const k = SPRING.stiffness / SPRING.mass;
        const c = SPRING.damping / SPRING.mass;

        const tick = (now: number) => {
            raf = 0;
            if (!alive) return;
            const dt = Math.min(1 / 30, Math.max(0.001, (now - last) / 1000));
            last = now;
            // 面板是居中的，放大时自身也在变宽，所以每帧重新取中心。
            const rect = panel.getBoundingClientRect();
            const focus = pointer.inside ? pointer.x - (rect.left + rect.width / 2) : null;
            const steps = Math.max(1, Math.ceil(dt * 240));
            const h = dt / steps;
            let moving = false;

            slots.forEach((el, index) => {
                if (!el) return;
                const state = entry(index);
                const reach = focus === null ? 1 : Math.abs(focus - rest[index]) / distance;
                const target = base + (peak - base) * (reach < 1 ? Math.cos((reach * Math.PI) / 2) ** 2 : 0);
                if (reduce) {
                    state.size = target;
                    state.velocity = 0;
                } else {
                    for (let step = 0; step < steps; step++) {
                        state.velocity = (state.velocity + h * k * (target - state.size)) / (1 + h * c + h * h * k);
                        state.size += state.velocity * h;
                    }
                }
                if (Math.abs(state.velocity) < 0.01 && Math.abs(target - state.size) < 0.01) {
                    state.size = target;
                    state.velocity = 0;
                } else {
                    moving = true;
                }

                const size = Math.max(1, state.size);
                el.style.width = `${size}px`;
                el.style.height = `${size}px`;
                const tile = el.firstElementChild as HTMLElement | null;
                if (tile) tile.style.transform = `scale(${size / base})`;
            });

            if (moving) raf = requestAnimationFrame(tick);
        };

        const wake = () => {
            if (raf || !alive) return;
            last = performance.now();
            raf = requestAnimationFrame(tick);
        };
        const handleMove = (event: PointerEvent) => {
            pointer.x = event.clientX;
            pointer.inside = true;
            wake();
        };
        const handleLeave = () => {
            pointer.inside = false;
            wake();
        };

        panel.addEventListener("pointermove", handleMove);
        panel.addEventListener("pointerleave", handleLeave);
        wake();
        return () => {
            alive = false;
            if (raf) cancelAnimationFrame(raf);
            panel.removeEventListener("pointermove", handleMove);
            panel.removeEventListener("pointerleave", handleLeave);
            slots.forEach((el) => {
                if (!el) return;
                el.style.width = "";
                el.style.height = "";
                const tile = el.firstElementChild as HTMLElement | null;
                if (tile) tile.style.transform = "";
            });
        };
    }, [dock]);

    // Close extension-node and canvas-appearance popovers when clicking outside the toolbar and its panels.
    useEffect(() => {
        if (!extensionsOpen && !appearanceOpen) return;
        const handlePointerDown = (event: PointerEvent) => {
            if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
                setExtensionsOpen(false);
                setAppearanceOpen(false);
            }
        };
        document.addEventListener("pointerdown", handlePointerDown, true);
        return () => document.removeEventListener("pointerdown", handlePointerDown, true);
    }, [extensionsOpen, appearanceOpen]);

    const fit = dock.fit;
    const base = RAW_BASE * fit;
    const pad = ((RAW_PANEL - RAW_BASE) / 2) * fit;
    const tileRadius = base * ROUNDNESS * 0.5;
    // 键帽比面板略亮一档：深色主题往亮里调、浅色主题往暗里调，都靠 theme 自己的两个色混出来。
    const tileTop = `color-mix(in srgb, ${theme.toolbar.panel} ${isLight ? 94 : 84}%, ${theme.node.text})`;
    const tileBottom = `color-mix(in srgb, ${theme.toolbar.panel} ${isLight ? 86 : 92}%, ${theme.node.text})`;

    const dockStyle = {
        background: theme.toolbar.panel,
        color: theme.toolbar.item,
        ["--dock-base" as string]: `${base}px`,
        ["--dock-gap" as string]: `${RAW_GAP * fit}px`,
        ["--dock-thickness" as string]: `${RAW_PANEL * fit}px`,
        ["--dock-pad" as string]: `${pad}px`,
        ["--dock-radius" as string]: `${tileRadius + pad}px`,
        ["--dock-tile-radius" as string]: `${tileRadius}px`,
        ["--dock-dot-offset" as string]: `${Math.max(pad / 2, 5) - 2}px`,
        ["--dock-tile" as string]: `linear-gradient(180deg, ${tileTop} 0%, ${tileBottom} 100%)`,
        ["--dock-tile-edge" as string]: isLight ? "rgba(24,24,27,.08)" : "rgba(255,255,255,.07)",
        ["--dock-tile-highlight" as string]: isLight ? "rgba(255,255,255,.95)" : "rgba(255,255,255,.14)",
        ["--dock-tile-shadow" as string]: isLight ? "0 4px 10px -5px rgba(24,24,27,.25)" : "0 4px 10px -4px rgba(0,0,0,.7)",
        ["--dock-panel-edge" as string]: theme.toolbar.border,
        ["--dock-panel-shadow" as string]: isLight ? "0 16px 40px rgba(28,25,23,.12)" : "0 18px 45px rgba(0,0,0,.32)",
        ["--dock-separator" as string]: theme.toolbar.border,
        ["--dock-dot" as string]: theme.node.muted,
        ["--dock-label" as string]: theme.node.text,
        ["--dock-label-ink" as string]: theme.node.panel,
        ["--dock-accent" as string]: theme.node.activeStroke,
    };

    return (
        <div ref={rootRef} className="pointer-events-none absolute bottom-5 z-50 flex justify-center" style={{ left: 300, right: 16 }} data-canvas-bottom-toolbar>
            <div ref={wrapRef} className="canvas-dock pointer-events-auto max-w-full" style={dockStyle}>
                <DockItem label={t(`canvas.toolbar.${canvasTool}`)} active onClick={() => onCanvasToolChange(canvasTool === "select" ? "pan" : "select")}>
                    {canvasTool === "select" ? <MousePointer2 className="size-4.5" /> : <Hand className="size-4.5" />}
                </DockItem>
                <DockItem label={t("canvas.undo")} disabled={!canUndo} onClick={onUndo}>
                    <Undo2 className="size-4.5" />
                </DockItem>
                <DockItem label={t("canvas.redo")} disabled={!canRedo} onClick={onRedo}>
                    <Redo2 className="size-4.5" />
                </DockItem>
                <DockItem label={t("canvas.toolbar.focus")} disabled={!selectedCount} onClick={onFocusSelected}>
                    <LocateFixed className="size-4.5" />
                </DockItem>
                <Divider />
                <DockItem label={t("canvas.toolbar.text")} onClick={onAddText}>
                    <Type className="size-4.5" />
                </DockItem>
                <DockItem label={t("canvas.toolbar.image")} onClick={onAddImage}>
                    <ImageIcon className="size-4.5" />
                </DockItem>
                <DockItem label={t("canvas.toolbar.video")} onClick={onAddVideo}>
                    <Video className="size-4.5" />
                </DockItem>
                <DockItem label={t("canvas.toolbar.audio")} onClick={onAddAudio}>
                    <Music2 className="size-4.5" />
                </DockItem>
                <DockItem label={t("canvas.toolbar.config")} onClick={onAddConfig}>
                    <Settings2 className="size-4.5" />
                </DockItem>
                <DockItem label={t("canvas.toolbar.group")} onClick={onAddGroup}>
                    <Group className="size-4.5" />
                </DockItem>
                {extensionDefs.length ? (
                    <DockItem
                        label={t("canvas.toolbar.extensions")}
                        active={extensionsOpen}
                        onClick={(event) => {
                            setExtPanelX(getTipX(wrapRef.current, event.currentTarget));
                            setAppearanceOpen(false);
                            setExtensionsOpen((value) => !value);
                        }}
                    >
                        <Puzzle className="size-4.5" />
                    </DockItem>
                ) : null}
                <DockItem label={t("canvas.toolbar.upload")} onClick={onUpload}>
                    <Upload className="size-4.5" />
                </DockItem>
                <Divider />
                <DockItem
                    label={t("canvas.toolbar.appearance")}
                    active={appearanceOpen}
                    onClick={(event) => {
                        setPanelX(getTipX(wrapRef.current, event.currentTarget));
                        setExtensionsOpen(false);
                        setAppearanceOpen((value) => !value);
                    }}
                >
                    <Palette className="size-4.5" />
                </DockItem>
                {selectedCount ? (
                    <>
                        <Divider />
                        <DockItem label={t("canvas.deleteSelected")} danger onClick={onDelete}>
                            <Trash2 className="size-4.5" />
                        </DockItem>
                    </>
                ) : null}
                <Divider />
                <DockItem label={t("canvas.toolbar.clear")} danger onClick={onClear}>
                    <Eraser className="size-4.5" />
                </DockItem>
            </div>

            {extensionsOpen && extensionDefs.length ? (
                <div
                    className="thin-scrollbar pointer-events-auto absolute bottom-[72px] z-30 max-h-[50vh] w-[240px] -translate-x-1/2 overflow-y-auto rounded-xl border p-2 shadow-xl backdrop-blur"
                    style={{ left: extPanelX || "50%", background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.toolbar.item }}
                >
                    <div className="px-1.5 pb-1.5 text-[11px] font-medium opacity-50">{t("canvas.toolbar.extensions")}</div>
                    <div className="grid gap-0.5">
                        {extensionDefs.map((def) => (
                            <button
                                key={def.type}
                                type="button"
                                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition"
                                style={{ color: theme.toolbar.item }}
                                onMouseEnter={(event) => (event.currentTarget.style.background = theme.toolbar.itemHover)}
                                onMouseLeave={(event) => (event.currentTarget.style.background = "transparent")}
                                onClick={() => {
                                    onAddExtensionNode(def.type);
                                    setExtensionsOpen(false);
                                }}
                            >
                                <span className="grid size-7 shrink-0 place-items-center rounded-md text-base" style={{ background: theme.toolbar.itemHover }}>
                                    {def.icon}
                                </span>
                                <span className="min-w-0 flex-1 truncate">{getNodeSpec(def.type).title}</span>
                            </button>
                        ))}
                    </div>
                </div>
            ) : null}

            {appearanceOpen ? (
                <div
                    className="pointer-events-auto absolute bottom-[72px] z-30 w-[248px] -translate-x-1/2 rounded-xl border p-2.5 shadow-xl backdrop-blur"
                    style={{ left: panelX || "50%", background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.toolbar.item }}
                >
                    <div className="px-1 pb-2 text-sm font-medium opacity-65">{t("canvas.toolbar.appearance")}</div>
                    <div className="px-1 pb-1.5 text-[11px] font-medium opacity-50">{t("canvas.toolbar.themeMode")}</div>
                    <div className="flex items-center justify-between rounded-lg px-2 py-1.5" style={{ background: theme.toolbar.itemHover }}>
                        <span className="flex items-center gap-1.5 text-sm">
                            {colorTheme === "dark" ? <Moon className="size-4" /> : <Sun className="size-4" />}
                            {colorTheme === "dark" ? t("canvas.toolbar.dark") : t("canvas.toolbar.light")}
                        </span>
                        <ThemeSwitch theme={colorTheme} onThemeChange={(next) => setTheme(next)} />
                    </div>
                    <div className="mt-3 px-1 pb-1.5 text-[11px] font-medium opacity-50">{t("canvas.toolbar.gridStyle")}</div>
                    <Segmented
                        className="w-full !p-1 [&_.ant-segmented-group]:!flex [&_.ant-segmented-item]:!min-h-8 [&_.ant-segmented-item]:!flex-1 [&_.ant-segmented-item-label]:!min-h-8 [&_.ant-segmented-item-label]:!leading-8"
                        value={backgroundMode}
                        onChange={(value) => onBackgroundModeChange(value as CanvasBackgroundMode)}
                        options={[
                            {
                                value: "dots",
                                label: (
                                    <span className="inline-flex items-center gap-1.5">
                                        <CircleDot className="size-4" />{t("canvas.toolbar.dots")}
                                    </span>
                                ),
                            },
                            {
                                value: "lines",
                                label: (
                                    <span className="inline-flex items-center gap-1.5">
                                        <Grid2x2 className="size-4" />{t("canvas.toolbar.lines")}
                                    </span>
                                ),
                            },
                            {
                                value: "blank",
                                label: (
                                    <span className="inline-flex items-center gap-1.5">
                                        <Square className="size-4" />
                                        {t("canvas.toolbar.blank")}
                                    </span>
                                ),
                            },
                        ]}
                    />
                    <div className="mt-3 flex items-center justify-between gap-3 rounded-lg px-1.5 py-1">
                        <span className="inline-flex min-w-0 items-center gap-1.5 text-[11px] font-medium opacity-65">
                            <Info className="size-3.5" />
                            {t("canvas.toolbar.imageInfo")}
                        </span>
                        <Switch size="small" checked={showImageInfo} onChange={onShowImageInfoChange} />
                    </div>
                </div>
            ) : null}
        </div>
    );
}

/**
 * 一个 dock 项：外层 button 的宽高由放大动效每帧改写，里面是一个绝对定位的键帽，
 * 再加上当前态圆点和悬停标签。键帽负责视觉，button 负责命中区域。
 */
function DockItem({ label, active, disabled = false, danger = false, onClick, children }: { label: string; active?: boolean; disabled?: boolean; danger?: boolean; onClick?: (event: ReactMouseEvent<HTMLElement>) => void; children: ReactNode }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];

    return (
        <button type="button" className="canvas-dock-item" aria-label={label} aria-pressed={active} disabled={disabled} onClick={onClick}>
            <span className="canvas-dock-tile" style={{ color: danger ? DANGER : theme.toolbar.item }}>
                {children}
            </span>
            {active ? <span className="canvas-dock-dot" aria-hidden="true" /> : null}
            <span className="canvas-dock-label" aria-hidden="true">
                {label}
            </span>
        </button>
    );
}

function Divider() {
    return <span className="canvas-dock-separator" aria-hidden="true" />;
}

function getTipX(wrap: HTMLDivElement | null, target: HTMLElement) {
    if (!wrap) return 0;
    const wrapBox = wrap.parentElement?.getBoundingClientRect() || wrap.getBoundingClientRect();
    const box = target.getBoundingClientRect();
    return box.left - wrapBox.left + box.width / 2;
}