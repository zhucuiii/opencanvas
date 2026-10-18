import type { ReactNode } from "react";
import { useState } from "react";
import { Modal } from "antd";
import { useTranslation } from "react-i18next";

import { canvasThemes } from "@/lib/canvas-theme";
import { useConfigStore } from "@/stores/use-config-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { WakeSlider } from "@/components/ui/wake-slider";

type CanvasZoomControlsProps = {
    scale: number;
    onScaleChange: (scale: number) => void;
    onReset?: () => void;
    isMiniMapOpen?: boolean;
    onToggleMiniMap?: () => void;
    /** 与底部 Dock 共用的自适应比例，让两条浮条同步缩小并保持等高。 */
    fit?: number;
};

export function CanvasZoomControls({ scale, onScaleChange, fit = 1 }: CanvasZoomControlsProps) {
    const [shortcutsOpen, setShortcutsOpen] = useState(false);
    const { t } = useTranslation();
    const colorTheme = useThemeStore((state) => state.theme);
    const canvasOperationMode = useConfigStore((state) => state.config.canvasOperationMode);
    const theme = canvasThemes[colorTheme];

    return (
        <div className="canvas-zoom-controls absolute bottom-5 left-5 z-50" data-canvas-zoom-controls onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
            <div className="canvas-zoom-controls__bare flex items-center" style={{ transform: fit !== 1 ? `scale(${fit})` : undefined, transformOrigin: "left bottom" }}>
                <div className="canvas-zoom-controls__slider shrink-0">
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
                        fillColor={theme.node.text}
                        trackColor={theme.toolbar.itemHover}
                        ariaLabel={t("canvas.zoom")}
                    />
                </div>
                <span className="canvas-zoom-controls__value" style={{ color: theme.node.muted }}>
                    <span className="canvas-zoom-controls__value-text">{Math.round(scale * 100)}%</span>
                </span>
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
