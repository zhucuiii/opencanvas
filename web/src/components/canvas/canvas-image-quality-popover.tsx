import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Gauge } from "lucide-react";
import { Button } from "antd";
import { useTranslation } from "react-i18next";

import { ImageQualityGrid, imageQualityLabel } from "@/components/image-settings-panel";
import { canvasThemes } from "@/lib/canvas-theme";
import { onCanvasPopoverDismiss } from "@/lib/canvas/canvas-popover-dismiss";
import { useThemeStore } from "@/stores/use-theme-store";

type CanvasImageQualityPopoverProps = {
    quality: string;
    onChange: (quality: string) => void;
    buttonClassName?: string;
    /** 画布节点底栏的扁平样式：去掉胶囊的底色，只留图标加文字。 */
    flat?: boolean;
};

/*
 * 提示词面板底栏的质量控件：胶囊显示当前质量（自动 / 低 / 中 / 高 / 极高 / 最高），
 * 点击向上弹出六档宫格。数据仍走节点的 config.quality，只是从「参数」弹层挪到了
 * 底栏、放在转绘按钮前面——质量和尺寸一样是每次生成都要看一眼的参数。
 * 选定即收起：这里只有一个字段，没有继续改别的的必要。
 */
export function CanvasImageQualityPopover({ quality, onChange, buttonClassName, flat = false }: CanvasImageQualityPopoverProps) {
    const { t } = useTranslation();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const buttonRef = useRef<HTMLSpanElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [buttonRect, setButtonRect] = useState<DOMRect | null>(null);

    useEffect(() => {
        if (!open) return;
        const syncPosition = () => setButtonRect(buttonRef.current?.getBoundingClientRect() || null);
        const closeOnOutsidePointer = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
            setOpen(false);
        };

        syncPosition();
        // 滚轮平移/缩放不派发 pointerdown，收起得靠画布那边喊一声（见 canvas-popover-dismiss.ts）。
        const stopDismissing = onCanvasPopoverDismiss(() => setOpen(false));
        window.addEventListener("resize", syncPosition);
        window.addEventListener("scroll", syncPosition, true);
        window.addEventListener("pointerdown", closeOnOutsidePointer, true);
        return () => {
            stopDismissing();
            window.removeEventListener("resize", syncPosition);
            window.removeEventListener("scroll", syncPosition, true);
            window.removeEventListener("pointerdown", closeOnOutsidePointer, true);
        };
    }, [open]);

    return (
        <>
            <span ref={buttonRef} className="inline-flex min-w-0">
                <Button
                    size="small"
                    type="text"
                    className={buttonClassName || "!h-10 !max-w-[120px] !justify-start !rounded-full !px-3"}
                    style={{ background: flat ? "transparent" : theme.node.fill, color: theme.node.text }}
                    icon={<Gauge className="size-3.5" />}
                    onClick={() => setOpen(!open)}
                    aria-label={t("settingsPanels.image.quality")}
                    title={t("settingsPanels.image.quality")}
                >
                    <span className="truncate">{imageQualityLabel(quality)}</span>
                </Button>
            </span>
            {/* 和「参数」一样常驻 portal，让退场动画有地方播。 */}
            <QualityPortal
                open={open}
                buttonRect={buttonRect}
                panelRef={panelRef}
                theme={theme}
                quality={quality}
                onChange={(value) => {
                    onChange(value);
                    setOpen(false);
                }}
            />
        </>
    );
}

function QualityPortal({
    open,
    buttonRect,
    panelRef,
    theme,
    quality,
    onChange,
}: {
    open: boolean;
    buttonRect: DOMRect | null;
    panelRef: RefObject<HTMLDivElement | null>;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    quality: string;
    onChange: (quality: string) => void;
}) {
    const { t } = useTranslation();
    const reduce = useReducedMotion();
    const width = 240;
    const gap = 8;
    const margin = 12;
    if (!buttonRect) return null;
    const style = {
        position: "fixed",
        zIndex: 1200,
        width,
        left: Math.max(margin, Math.min(window.innerWidth - width - margin, buttonRect.left)),
        // 和「参数」一致：向下展开，别盖住上面的提示词输入区。
        top: buttonRect.bottom + gap,
        maxHeight: Math.max(200, window.innerHeight - buttonRect.bottom - gap - margin),
        overflowY: "auto",
        background: theme.toolbar.panel,
        borderRadius: 18,
        boxShadow: "0 18px 54px rgba(28, 25, 23, 0.16)",
        padding: 14,
        color: theme.node.text,
    } as const;

    return createPortal(
        <AnimatePresence>
            {open ? (
                <motion.div
                    ref={panelRef}
                    style={{ ...style, transformOrigin: "left top" }}
                    initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: -6 }}
                    animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
                    exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: -4 }}
                    transition={reduce ? { duration: 0.12 } : { type: "spring", stiffness: 420, damping: 30, mass: 0.7 }}
                    onPointerDown={(event) => event.stopPropagation()}
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={(event) => event.stopPropagation()}
                >
                    <div className="mb-2 px-1 text-sm font-medium" style={{ color: theme.node.muted }}>
                        {t("settingsPanels.image.quality")}
                    </div>
                    <ImageQualityGrid quality={quality} theme={theme} onChange={onChange} className="grid grid-cols-3 gap-2" />
                </motion.div>
            ) : null}
        </AnimatePresence>,
        document.body,
    );
}
