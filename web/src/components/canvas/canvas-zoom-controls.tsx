import type { ReactNode } from "react";
import { Compass, Focus, HelpCircle } from "lucide-react";
import { useState } from "react";
import { Button, Modal, Tooltip } from "antd";
import { useTranslation } from "react-i18next";

import { canvasThemes } from "@/lib/canvas-theme";
import { useConfigStore } from "@/stores/use-config-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { WakeSlider } from "@/components/ui/wake-slider";

type CanvasZoomControlsProps = {
    scale: number;
    onScaleChange: (scale: number) => void;
    onReset: () => void;
    isMiniMapOpen: boolean;
    onToggleMiniMap: () => void;
    /** 与底部 Dock 共用的自适应比例，让两条浮条同步缩小并保持等高。 */
    fit?: number;
};

export function CanvasZoomControls({ scale, onScaleChange, onReset, isMiniMapOpen, onToggleMiniMap, fit = 1 }: CanvasZoomControlsProps) {
    const [shortcutsOpen, setShortcutsOpen] = useState(false);
    const { t } = useTranslation();
    const colorTheme = useThemeStore((state) => state.theme);
    const canvasOperationMode = useConfigStore((state) => state.config.canvasOperationMode);
    const theme = canvasThemes[colorTheme];
    const dockStyle = { background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.toolbar.item, boxShadow: colorTheme === "dark" ? "0 18px 45px rgba(0,0,0,.32)" : "0 16px 40px rgba(28,25,23,.12)" };
    const activeStyle = { background: theme.toolbar.activeBg, color: theme.toolbar.activeText };

    return (
        <div className="absolute bottom-5 left-5 z-50" data-canvas-zoom-controls onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
            {/*
             * 用 transform 整体缩放而不是改尺寸：高度、圆角、内边距、图标全都按同一比例走，
             * 和 Dock 的 RAW_PANEL * fit 正好等高。origin 取左下角，缩放时底边不动。
             */}
            <div className="flex h-14 items-center gap-1 rounded-xl border px-2 shadow-lg backdrop-blur" style={{ ...dockStyle, transform: fit !== 1 ? `scale(${fit})` : undefined, transformOrigin: "left bottom" }}>
                <Tooltip title={isMiniMapOpen ? t("canvas.miniMapClose") : t("canvas.miniMapOpen")}>
                    <Button
                        type="text"
                        className="!h-8 !w-8 !min-w-8 !p-0"
                        style={isMiniMapOpen ? activeStyle : { color: theme.toolbar.item }}
                        icon={<Compass className="size-4" />}
                        onClick={onToggleMiniMap}
                        aria-label={isMiniMapOpen ? t("canvas.miniMapClose") : t("canvas.miniMapOpen")}
                    />
                </Tooltip>
                <Tooltip title={t("canvas.resetView")}>
                    <Button type="text" className="!h-8 !w-8 !min-w-8 !p-0" style={{ color: theme.toolbar.item }} icon={<Focus className="size-4" />} onClick={onReset} aria-label={t("canvas.resetView")} />
                </Tooltip>
                <Tooltip title={t("canvas.zoom")}>
                    {/* 一排小竖条，静止时是细线，拖动时头部鼓出尾迹波。宽度要够摆下 18 根条。 */}
                    <div className="w-[170px] shrink-0">
                        <WakeSlider
                            min={5}
                            max={500}
                            step={1}
                            bars={18}
                            height={44}
                            restHeight={10}
                            gap={4}
                            value={Math.round(scale * 100)}
                            onChange={(next) => onScaleChange(next / 100)}
                            fillColor={theme.node.activeStroke}
                            trackColor={theme.toolbar.itemHover}
                            ariaLabel={t("canvas.zoom")}
                        />
                    </div>
                </Tooltip>
                <span className="w-10 text-right text-xs tabular-nums" style={{ color: theme.node.muted }}>
                    {Math.round(scale * 100)}%
                </span>
                <Tooltip title={t("canvas.shortcuts")}>
                    <Button type="text" className="!h-8 !w-8 !min-w-8 !p-0" style={shortcutsOpen ? activeStyle : { color: theme.toolbar.item }} icon={<HelpCircle className="size-4" />} onClick={() => setShortcutsOpen(true)} aria-label={t("canvas.shortcuts")} />
                </Tooltip>
            </div>
            <Modal title={t("canvas.shortcuts")} open={shortcutsOpen} onCancel={() => setShortcutsOpen(false)} footer={null} centered>
                <div className="space-y-3 border-t pt-4 text-sm" style={{ borderColor: theme.node.stroke }}>
                    {canvasOperationMode === "libtv" ? (
                        <>
                            <Shortcut label={t("canvas.shortcut.wheel")} value={t("canvas.shortcut.scrollVertical")} />
                            <Shortcut label={`Shift + ${t("canvas.shortcut.wheel")}`} value={t("canvas.shortcut.scrollHorizontal")} />
                            <Shortcut label={`Ctrl / Cmd + ${t("canvas.shortcut.wheel")}`} value={t("canvas.shortcut.zoom")} />
                            <Shortcut label={t("canvas.shortcut.drag")} value={`${t("canvas.shortcut.boxSelect")} / ${t("canvas.shortcut.pan")}`} />
                            <Shortcut label={`Space + ${t("canvas.shortcut.drag")}`} value={t("canvas.shortcut.pan")} />
                            <Shortcut label={`Shift / Cmd + ${t("canvas.shortcut.click")}`} value={t("canvas.shortcut.addSelection")} />
                        </>
                    ) : (
                        <>
                            <Shortcut label={`Ctrl / Space + ${t("canvas.shortcut.drag")}`} value={t("canvas.shortcut.toggleTool")} />
                            <Shortcut label={t("canvas.shortcut.wheel")} value={t("canvas.shortcut.zoom")} />
                            <Shortcut label={t("canvas.shortcut.drag")} value={t("canvas.shortcut.boxSelect")} />
                            <Shortcut label={`Shift / Cmd + ${t("canvas.shortcut.click")}`} value={t("canvas.shortcut.addSelection")} />
                        </>
                    )}
                    <Shortcut label="Ctrl / Cmd + C / V" value={t("canvas.shortcut.copyPasteNodes")} />
                    <Shortcut label="Ctrl / Cmd + G" value={t("canvas.shortcut.group")} />
                    <Shortcut label="Ctrl / Cmd + Shift + G" value={t("canvas.shortcut.ungroup")} />
                    <Shortcut label="Delete / Backspace" value={t("canvas.shortcut.delete")} />
                </div>
            </Modal>
        </div>
    );
}

function Shortcut({ label, value }: { label: ReactNode; value: string }) {
    return (
        <div className="flex items-center justify-between gap-4">
            <span className="text-base font-medium">{label}</span>
            <span className="opacity-60">{value}</span>
        </div>
    );
}
