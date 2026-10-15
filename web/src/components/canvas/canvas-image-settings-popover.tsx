import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Settings2 } from "lucide-react";
import { Button } from "antd";
import { useTranslation } from "react-i18next";

import { AspectIcon, ImageSettingsPanel, imageQualityLabel, imageSizeLabel } from "@/components/image-settings-panel";
import { canvasThemes } from "@/lib/canvas-theme";
import { inferMediaRatio, inferMediaScale, readMediaDimensions } from "@/lib/media-size";
import { useThemeStore } from "@/stores/use-theme-store";
import type { AiConfig } from "@/stores/use-config-store";

type CanvasImageSettingsPopoverProps = {
    config: AiConfig;
    onConfigChange: (key: keyof AiConfig, value: string) => void;
    onMissingConfig?: () => void;
    onOpenChange?: (open: boolean) => void;
    buttonClassName?: string;
    getPopupContainer?: (triggerNode: HTMLElement) => HTMLElement;
    placement?: "topLeft" | "top" | "topRight" | "bottomLeft" | "bottom" | "bottomRight";
    autoAdjustOverflow?: boolean;
    /** 画布节点把质量挪到了底栏的独立控件，这里就要连标签一起省掉质量。 */
    showQuality?: boolean;
    /** 画布节点底栏的扁平样式：去掉胶囊的底色，只留图标加文字。 */
    flat?: boolean;
};

export function CanvasImageSettingsPopover({ config, onConfigChange, onOpenChange, buttonClassName, placement = "topLeft", showQuality = true, flat = false }: CanvasImageSettingsPopoverProps) {
    const { t } = useTranslation();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const buttonRef = useRef<HTMLSpanElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [buttonRect, setButtonRect] = useState<DOMRect | null>(null);
    const quality = config.quality || "auto";
    const count = Math.max(1, Math.min(15, Math.floor(Math.abs(Number(config.count)) || 1)));
    const activeSize = config.size || "auto";
    // 扁平模式下图标要跟着比例变形，所以得拿到当前尺寸的像素值。
    const dimensions = readMediaDimensions(activeSize, inferMediaScale(activeSize), inferMediaRatio(activeSize));
    const updateOpen = (nextOpen: boolean) => {
        setOpen(nextOpen);
        onOpenChange?.(nextOpen);
    };

    useEffect(() => {
        if (!open) return;
        const syncPosition = () => setButtonRect(buttonRef.current?.getBoundingClientRect() || null);
        const closeOnOutsidePointer = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
            if (document.activeElement instanceof HTMLElement && panelRef.current?.contains(document.activeElement)) document.activeElement.blur();
            setOpen(false);
            onOpenChange?.(false);
        };

        syncPosition();
        window.addEventListener("resize", syncPosition);
        window.addEventListener("scroll", syncPosition, true);
        window.addEventListener("pointerdown", closeOnOutsidePointer, true);
        return () => {
            window.removeEventListener("resize", syncPosition);
            window.removeEventListener("scroll", syncPosition, true);
            window.removeEventListener("pointerdown", closeOnOutsidePointer, true);
        };
    }, [onOpenChange, open]);

    // 弹层常驻 portal（只是内容按 open 挂载），这样关掉时 AnimatePresence 还能播退场。
    const panel = <ImageSettingsPortal open={open} buttonRect={buttonRect} panelRef={panelRef} placement={placement} theme={theme} config={config} onConfigChange={onConfigChange} showQuality={showQuality} />

    return (
        <>
            <span ref={buttonRef} className="inline-flex min-w-0">
                <Button
                    size="small"
                    type="text"
                    className={buttonClassName || "!h-8 !max-w-[180px] !justify-start !rounded-full !px-2.5"}
                    style={{ background: flat ? "transparent" : theme.node.fill, color: theme.node.text }}
                    icon={
                        flat ? (
                            // 图标槽是按最大尺寸留的，竖构图时图形两边各有约 9px 余白。
                            // 参考图里这个比例图标明显更靠近右边的文字，所以整体往右挪 4px。
                            <span className="inline-flex translate-x-1">
                                <AspectIcon width={dimensions.width} height={dimensions.height} color={theme.node.text} box={16} thickness={1.5} />
                            </span>
                        ) : (
                            <Settings2 className="size-3.5" />
                        )
                    }
                    onClick={() => updateOpen(!open)}
                >
                    {/* 张数和质量都改由底栏的独立控件负责，这里只显示尺寸。 */}
                    <span className="truncate">{showQuality ? `${imageQualityLabel(quality)} · ${imageSizeLabel(activeSize)}` : imageSizeLabel(activeSize)}</span>
                </Button>
            </span>
            {panel}
        </>
    );
}

function ImageSettingsPortal({
    open,
    buttonRect,
    panelRef,
    placement,
    theme,
    config,
    onConfigChange,
    showQuality,
}: {
    open: boolean;
    buttonRect: DOMRect | null;
    panelRef: RefObject<HTMLDivElement | null>;
    placement: CanvasImageSettingsPopoverProps["placement"];
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    config: AiConfig;
    onConfigChange: (key: keyof AiConfig, value: string) => void;
    showQuality?: boolean;
}) {
    const reduce = useReducedMotion();
    const width = 356;
    const gap = 8;
    const margin = 12;
    if (!buttonRect) return null;
    const alignRight = placement?.endsWith("Right");
    const alignCenter = placement === "top" || placement === "bottom";
    const left = alignCenter ? buttonRect.left + buttonRect.width / 2 - width / 2 : alignRight ? buttonRect.right - width : buttonRect.left;
    const topPlacement = placement?.startsWith("top");
    const style = {
        position: "fixed",
        zIndex: 1200,
        width,
        left: Math.max(margin, Math.min(window.innerWidth - width - margin, left)),
        ...(topPlacement ? { bottom: window.innerHeight - buttonRect.top + gap, maxHeight: Math.max(260, buttonRect.top - margin * 2) } : { top: buttonRect.bottom + gap, maxHeight: Math.max(260, window.innerHeight - buttonRect.bottom - margin * 2) }),
        background: theme.toolbar.panel,
        borderRadius: 18,
        boxShadow: "0 18px 54px rgba(28, 25, 23, 0.16)",
        padding: 18,
        overflowY: "auto",
        // 横向必须裁掉：底下的 gooey 控件用一张比控件大一圈的 canvas 画气泡和水珠，
        // 不裁的话它会撑出几十像素的横向滚动区 —— 底下多一条滚动条，
        // 而且点击时浏览器把按钮滚进视口会把整块内容左移，右边空出一条。
        overflowX: "hidden",
        color: theme.node.text,
    } as const;

    // 从芯片那一侧长出来：向下展开的弹层以顶边为原点，向上展开的以底边为原点。
    const origin = `${alignRight ? "right" : "left"} ${topPlacement ? "bottom" : "top"}`;
    const away = topPlacement ? 6 : -6;

    return createPortal(
        <AnimatePresence>
            {open ? (
                <motion.div
                    ref={panelRef}
                    className="canvas-image-settings-popover"
                    style={{ ...style, transformOrigin: origin }}
                    initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: away }}
                    animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
                    exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: away * 0.6 }}
                    transition={reduce ? { duration: 0.12 } : { type: "spring", stiffness: 420, damping: 30, mass: 0.7 }}
                    onPointerDown={(event) => event.stopPropagation()}
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={(event) => event.stopPropagation()}
                >
                    {/* 把 gooey canvas 那圈溢出裁在面板边界上：既保住面板内的气泡和水珠，
                        又不让它撑出滚动区（撑出去的话底部会多一条横向滚动条，内容还会被滚走）。 */}
                    <div className="overflow-hidden">
                        <ImageSettingsPanel config={config} onConfigChange={(key, value) => onConfigChange(key, value)} theme={theme} className="space-y-4" showCount={false} showQuality={showQuality} />
                    </div>
                </motion.div>
            ) : null}
        </AnimatePresence>,
        document.body,
    );
}
