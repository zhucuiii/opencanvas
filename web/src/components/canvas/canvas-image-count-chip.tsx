import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";

type CanvasImageCountChipProps = {
    /** 当前张数（字符串数字都行，内部会归一）。 */
    value: number;
    /** 可选的最大张数，与图像设置面板的上限保持一致。 */
    max?: number;
    onChange: (count: number) => void;
};

/*
 * 提示词面板底栏的张数控件，样式仿自即梦底栏的「4×」：
 * 收起时是一枚带底色的胶囊，点击向上弹出竖排的张数列表（从大到小），
 * 当前值是高亮胶囊、其余是纯文本行。只在图片模式显示——张数只对生图有意义。
 */
export function CanvasImageCountChip({ value, max = 15, onChange }: CanvasImageCountChipProps) {
    const { t } = useTranslation();
    const reduce = useReducedMotion();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const buttonRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [anchor, setAnchor] = useState<DOMRect | null>(null);
    const count = Math.max(1, Math.min(max, Math.floor(Math.abs(Number(value)) || 1)));

    useEffect(() => {
        if (!open) return;
        const sync = () => setAnchor(buttonRef.current?.getBoundingClientRect() ?? null);
        const closeOnOutsidePointer = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
            setOpen(false);
        };
        sync();
        window.addEventListener("resize", sync);
        window.addEventListener("scroll", sync, true);
        document.addEventListener("pointerdown", closeOnOutsidePointer, true);
        return () => {
            window.removeEventListener("resize", sync);
            window.removeEventListener("scroll", sync, true);
            document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
        };
    }, [open]);

    const width = 104;
    const gap = 8;
    const margin = 12;
    const left = anchor ? Math.max(margin, Math.min(window.innerWidth - width - margin, anchor.right - width)) : 0;
    const style = {
        position: "fixed",
        zIndex: 1200,
        width,
        left,
        bottom: anchor ? window.innerHeight - anchor.top + gap : undefined,
        maxHeight: anchor ? Math.min(320, Math.max(220, anchor.top - margin * 2)) : undefined,
        background: theme.toolbar.panel,
        borderRadius: 18,
        boxShadow: "0 18px 54px rgba(28, 25, 23, 0.16)",
        padding: 10,
        overflowY: "auto",
        color: theme.node.text,
    } as const;

    return (
        <>
            <button
                ref={buttonRef}
                type="button"
                className="h-10 shrink-0 cursor-pointer rounded-full px-3 text-sm font-medium tabular-nums transition hover:opacity-80"
                style={{ background: theme.node.fill, color: theme.node.text }}
                onClick={() => setOpen(!open)}
                aria-label={t("settingsPanels.image.count")}
                aria-expanded={open}
                title={t("settingsPanels.image.count")}
            >
                {count}×
            </button>
            {createPortal(
                <AnimatePresence>
                    {open && anchor ? (
                        <motion.div
                            ref={panelRef}
                            className="thin-scrollbar"
                            style={{ ...style, transformOrigin: "right bottom" }}
                            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.9, y: 8 }}
                            animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
                            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: 6 }}
                            transition={reduce ? { duration: 0.12 } : { type: "spring", stiffness: 420, damping: 30, mass: 0.7 }}
                            onPointerDown={(event) => event.stopPropagation()}
                            onMouseDown={(event) => event.stopPropagation()}
                            onClick={(event) => event.stopPropagation()}
                        >
                            <div className="grid gap-0.5">
                                {Array.from({ length: max }, (_, index) => max - index).map((n) => (
                                    <button
                                        key={n}
                                        type="button"
                                        className="flex h-9 cursor-pointer items-center justify-center rounded-full text-sm tabular-nums transition"
                                        style={count === n ? { background: theme.toolbar.itemHover, color: theme.toolbar.activeText } : { background: "transparent", color: theme.node.text }}
                                        onMouseEnter={(event) => {
                                            if (count !== n) event.currentTarget.style.background = theme.toolbar.itemHover;
                                        }}
                                        onMouseLeave={(event) => {
                                            if (count !== n) event.currentTarget.style.background = "transparent";
                                        }}
                                        onMouseDown={(event) => event.stopPropagation()}
                                        onClick={() => {
                                            onChange(n);
                                            setOpen(false);
                                        }}
                                    >
                                        {n}×
                                    </button>
                                ))}
                            </div>
                        </motion.div>
                    ) : null}
                </AnimatePresence>,
                document.body,
            )}
        </>
    );
}
