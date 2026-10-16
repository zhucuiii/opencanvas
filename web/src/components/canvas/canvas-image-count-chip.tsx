import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";

import { canvasThemes } from "@/lib/canvas-theme";
import { onCanvasPopoverDismiss } from "@/lib/canvas/canvas-popover-dismiss";
import { useThemeStore } from "@/stores/use-theme-store";

type CanvasImageCountChipProps = {
    /** 当前张数（字符串数字都行，内部会归一）。 */
    value: number;
    /** 可选的最大张数，与图像设置面板的上限保持一致。 */
    max?: number;
    onChange: (count: number) => void;
};

/** 滚轮里每一项的高度（px），吸附步长就是它。 */
const ROW_HEIGHT = 36;
/** 滚轮可见高度 = ROW_HEIGHT * WINDOW_ROWS，中间那一行是选中项。 */
const WINDOW_ROWS = 3;
/*
 * 无限循环的副本数。滚轮把同一份选项拼 LOOP 份，打开时落在中间那份；
 * 滚到边缘份时悄悄跳回中间份的同值位置（同一帧内两次写入，外面看不出跳动）。
 * 15 项 × 5 份 = 75 行，滚到底要滑很久，跳回的时机几乎碰不到。
 */
const LOOP = 5;

/*
 * 提示词面板底栏的张数控件。收起时是一枚带底色的胶囊，点击向上弹出，
 * 展开的是一个仿 iOS 闹钟时间选择器的**无限循环滚轮**：宽度与下方发送圆钮
 * （直径 40px）对齐；选项纵向排布、中间一行是选中项，上下各有渐隐遮罩；
 * 滚动停下后自动吸附到最近的一项，中间项即当前张数。
 * 只在图片模式显示——张数只对生图有意义。
 */
export function CanvasImageCountChip({ value, max = 15, onChange }: CanvasImageCountChipProps) {
    const { t } = useTranslation();
    const reduce = useReducedMotion();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const buttonRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const wheelRef = useRef<HTMLDivElement>(null);
    const settleRef = useRef<number | null>(null);
    const [open, setOpen] = useState(false);
    const [anchor, setAnchor] = useState<DOMRect | null>(null);
    const count = Math.max(1, Math.min(max, Math.floor(Math.abs(Number(value)) || 1)));
    const items = Array.from({ length: max }, (_, index) => index + 1);
    const midLoop = Math.floor(LOOP / 2);
    /** 全列表里的下标 → 实际张数。 */
    const valueAt = (row: number) => items[((row % items.length) + items.length) % items.length];
    /** 实际张数 → 中间那份的下标（所有写入位置的基准）。 */
    const midRowOf = (n: number) => midLoop * items.length + (n - 1);
    const windowHeight = ROW_HEIGHT * WINDOW_ROWS;
    // 上下各留 (窗口高 - 一项高) / 2 的空白，这样首尾项也能滚到正中间。
    const pad = (windowHeight - ROW_HEIGHT) / 2;

    // 点击选项后的 smooth 滚动会触发一连串 scroll 事件，不能让吸附逻辑中途抢跑。
    const programmaticRef = useRef(false);

    // 打开的同时就把位置量好（点击处理里同步读 rect），面板首帧就能落在对的位置。
    // 如果等 open 渲染完再在 effect 里量，首帧会先用旧 anchor 闪一下。
    const toggle = () => {
        if (!open) setAnchor(buttonRef.current?.getBoundingClientRect() ?? null);
        setOpen(!open);
    };

    useEffect(() => {
        if (!open) return;
        const sync = () => setAnchor(buttonRef.current?.getBoundingClientRect() ?? null);
        const closeOnOutsidePointer = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
            setOpen(false);
        };
        // 滚轮平移/缩放不派发 pointerdown，收起得靠画布那边喊一声（见 canvas-popover-dismiss.ts）。
        const stopDismissing = onCanvasPopoverDismiss(() => setOpen(false));
        window.addEventListener("resize", sync);
        window.addEventListener("scroll", sync, true);
        document.addEventListener("pointerdown", closeOnOutsidePointer, true);
        return () => {
            stopDismissing();
            window.removeEventListener("resize", sync);
            window.removeEventListener("scroll", sync, true);
            document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
        };
    }, [open]);

    // 滚轮挂进来后摆到当前张数（中间那份）。面板挂在 portal 里、AnimatePresence 入场，
    // 第一帧布局未必就绪，所以用 MutationObserver 盯着。不用 rAF 轮询，
    // 页面不可见时 rAF 会被浏览器暂停、永远等不到。
    useEffect(() => {
        if (!open) return;
        const target = midRowOf(count);
        const place = () => {
            const wheel = wheelRef.current;
            if (!wheel || wheel.scrollHeight < target * ROW_HEIGHT + wheel.clientHeight) return false;
            wheel.scrollTop = target * ROW_HEIGHT;
            return true;
        };
        if (place()) return;
        const observer = new MutationObserver(() => {
            if (place()) observer.disconnect();
        });
        observer.observe(document.body, { childList: true, subtree: true });
        return () => observer.disconnect();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    /*
     * 无缝无限循环：滚轮内容每 items.length 行重复一次，所以滚动中途把
     * scrollTop 平移一整份的高度，画面看起来完全没动。这样滚轮永远到不了
     * 真正的顶和底，之前「停下后跳回中间份」的那一下可见跳动就没有了。
     */
    const rebase = (wheel: HTMLDivElement) => {
        const copyH = items.length * ROW_HEIGHT;
        if (wheel.scrollTop < copyH) wheel.scrollTop += copyH;
        else if (wheel.scrollTop > copyH * (LOOP - 1)) wheel.scrollTop -= copyH;
    };

    // 滚动停下后吸附到最近的一项，并把中间项写回张数（只做半行内的微调）。
    const settle = useCallback(() => {
        if (programmaticRef.current) return;
        const wheel = wheelRef.current;
        if (!wheel) return;
        const row = Math.max(0, Math.min(LOOP * items.length - 1, Math.round(wheel.scrollTop / ROW_HEIGHT)));
        wheel.scrollTop = row * ROW_HEIGHT;
        const next = valueAt(row);
        if (next !== count) onChange(next);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [count, items, onChange]);

    const handleScroll = () => {
        const wheel = wheelRef.current;
        if (!wheel || programmaticRef.current) return;
        rebase(wheel);
        if (settleRef.current !== null) window.clearTimeout(settleRef.current);
        settleRef.current = window.setTimeout(settle, 120);
    };

    /** 点选项：先写值，再平滑滚过去，滚动到位前吸附逻辑保持沉默。 */
    const selectIndex = (index: number) => {
        const next = items[index];
        onChange(next);
        programmaticRef.current = true;
        const wheel = wheelRef.current;
        if (wheel) wheel.scrollTo({ top: midRowOf(next) * ROW_HEIGHT, behavior: reduce ? "auto" : "smooth" });
        window.setTimeout(() => {
            programmaticRef.current = false;
        }, 600);
    };

    useEffect(
        () => () => {
            if (settleRef.current !== null) window.clearTimeout(settleRef.current);
        },
        [],
    );

    const width = 40;
    const gap = 8;
    const margin = 12;
    // 右边缘与芯片右边缘对齐（芯片就在发送圆钮左边，40px 宽对齐成一条线）。
    // 视口退化成 0 宽时 window.innerWidth 不可信，直接用 anchor 的位置。
    const viewport = window.innerWidth > width + margin * 2 ? window.innerWidth : 0;
    const left = anchor ? (viewport ? Math.max(margin, Math.min(viewport - width - margin, anchor.right - width)) : anchor.right - width) : 0;
    const style = {
        position: "fixed",
        zIndex: 1200,
        width,
        left,
        bottom: anchor ? window.innerHeight - anchor.top + gap : undefined,
        background: theme.toolbar.panel,
        borderRadius: 18,
        boxShadow: "0 18px 54px rgba(28, 25, 23, 0.16)",
        padding: "8px 4px",
        color: theme.node.text,
    } as const;
    // 渐隐遮罩：上下各盖住一条，让边缘的项淡出。
    const fade = `linear-gradient(to bottom, ${theme.toolbar.panel} 0%, transparent 100%)`;
    // 中间项在全列表里的下标（用来高亮）。
    const midRow = midRowOf(count);

    return (
        <>
            <button
                ref={buttonRef}
                type="button"
                className="h-10 w-10 shrink-0 cursor-pointer rounded-full text-sm font-medium tabular-nums transition hover:opacity-80"
                style={{ background: theme.node.fill, color: theme.node.text }}
                onClick={toggle}
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
                            style={{ ...style, transformOrigin: "right bottom" }}
                            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.9, y: 8 }}
                            animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
                            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: 6 }}
                            transition={reduce ? { duration: 0.12 } : { type: "spring", stiffness: 420, damping: 30, mass: 0.7 }}
                            onPointerDown={(event) => event.stopPropagation()}
                            onMouseDown={(event) => event.stopPropagation()}
                            onClick={(event) => event.stopPropagation()}
                        >
                            <div className="relative" style={{ height: windowHeight }}>
                                {/*
                                 * 中间的选中框必须在滚轮文字底下：它是 absolute 定位，
                                 * 按层叠规则会盖住普通流里的文字。把它放前面、滚轮加
                                 * relative，两者 z-auto 按 DOM 先后层叠，文字就浮上来了。
                                 * 上下渐隐留在最后，它们是半透明的，本来就要罩住文字边缘。
                                 */}
                                <div className="pointer-events-none absolute left-0 right-0 rounded-xl" style={{ top: pad, height: ROW_HEIGHT, background: theme.toolbar.activeBg }} />
                                <div ref={wheelRef} className="relative hide-scrollbar h-full snap-y snap-mandatory overflow-y-auto overscroll-contain" style={{ paddingTop: pad, paddingBottom: pad }} onScroll={handleScroll}>
                                    {Array.from({ length: LOOP }, (_, loop) =>
                                        items.map((n, index) => {
                                            const row = loop * items.length + index;
                                            return (
                                                <button
                                                    key={`${loop}-${n}`}
                                                    type="button"
                                                    className="flex w-full snap-center items-center justify-center text-sm tabular-nums transition-colors"
                                                    style={{ height: ROW_HEIGHT, color: row === midRow ? theme.node.text : theme.node.muted }}
                                                    onClick={() => selectIndex(n - 1)}
                                                >
                                                    {n}×
                                                </button>
                                            );
                                        }),
                                    )}
                                </div>
                                {/*
                                 * 上下渐隐：两条都是「外缘不透明、往中间淡出」。
                                 * fade 本身是「上不透明 → 下透明」，所以上面那块直接用、下面那块翻转。
                                 * （之前 scaleY(-1) 加错了对象，两块都盖在靠中间那一侧，方向正好反了。）
                                 */}
                                <div className="pointer-events-none absolute inset-x-0 top-0" style={{ height: pad, background: fade }} />
                                <div className="pointer-events-none absolute inset-x-0 bottom-0" style={{ height: pad, background: fade, transform: "scaleY(-1)" }} />
                            </div>
                        </motion.div>
                    ) : null}
                </AnimatePresence>,
                document.body,
            )}
        </>
    );
}
