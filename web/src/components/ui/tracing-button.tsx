import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import "./tracing-button.css";

/** 按钮外圈圆角，同时用于按钮的 border-radius 和描边路径，两边永远一致。 */
const RADIUS = 12;
/** 描边线宽。 */
const THICKNESS = 2;
const K = Math.SQRT1_2;

type TracingButtonProps = {
    children: string;
    /** Label that rolls in on hover. Defaults to `children`, which reads as the text scrolling over itself. */
    hoverLabel?: string;
    icon?: ReactNode;
    /** Button face colour. */
    surface?: string;
    /** Ink colour for the label. */
    ink?: string;
    /** Colour of the tracing border. Defaults to the reference's mint. */
    accent?: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type" | "children">;

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * 把圆角矩形轮廓切成四段，每段 = 一条直边 + 两端各半个圆角，
 * 四条线在四个圆角的 45° 中点首尾相接，正好铺满外圈，不留缝也不重叠。
 * 每段按自己的生长方向书写，所以 stroke-dashoffset 一动就是"从这头长到那头"。
 */
function outlineSegments(width: number, height: number) {
    const half = THICKNESS / 2;
    // 描边整体内缩半个线宽，整条 2px 线都落在按钮内部，不会被 overflow 裁掉半条。
    const x0 = half;
    const y0 = half;
    const x1 = Math.max(x0 + 1, width - half);
    const y1 = Math.max(y0 + 1, height - half);
    const r = Math.max(0, Math.min(RADIUS - half, (x1 - x0) / 2, (y1 - y0) / 2));

    const tlx = x0 + r;
    const tly = y0 + r;
    const trx = x1 - r;
    const bry = y1 - r;
    const blx = x0 + r;
    const bly = y1 - r;

    // 四个圆角的 45° 中点
    const tlMidX = tlx - r * K;
    const tlMidY = tly - r * K;
    const trMidX = trx + r * K;
    const trMidY = tly - r * K;
    const brMidX = trx + r * K;
    const brMidY = bry + r * K;
    const blMidX = blx - r * K;
    const blMidY = bly + r * K;

    const at = (x: number, y: number) => `${round(x)} ${round(y)}`;
    const arc = (toX: number, toY: number, sweep: 0 | 1) => `A ${round(r)} ${round(r)} 0 0 ${sweep} ${at(toX, toY)}`;

    return {
        // 上边：右上圆角中点 → 顶边 → 左上圆角中点，从右往左长。
        top: `M ${at(trMidX, trMidY)} ${arc(trx, y0, 0)} L ${at(tlx, y0)} ${arc(tlMidX, tlMidY, 0)}`,
        // 左边：左下圆角中点 → 左边 → 左上圆角中点，从下往上长。
        left: `M ${at(blMidX, blMidY)} ${arc(x0, bly, 1)} L ${at(x0, tly)} ${arc(tlMidX, tlMidY, 1)}`,
        // 下边：左下圆角中点 → 底边 → 右下圆角中点，从左往右长。
        bottom: `M ${at(blMidX, blMidY)} ${arc(blx, y1, 0)} L ${at(trx, y1)} ${arc(brMidX, brMidY, 0)}`,
        // 右边：右上圆角中点 → 右边 → 右下圆角中点，从上往下长。
        right: `M ${at(trMidX, trMidY)} ${arc(x1, tly, 1)} L ${at(x1, bry)} ${arc(brMidX, brMidY, 1)}`,
    };
}

/**
 * Ported from uiverse.io/Nawsome/tiny-chipmunk-51: the border draws itself
 * around the button on hover, staggered so it appears to travel, while the
 * label rolls up and out and a second copy rises in.
 *
 * The reference draws the four edges as plain 2px bars pinned to the sides,
 * which only works because its button is a square with no rounding. Our button
 * is rounded, so bars get sliced off at the corners and the border visibly
 * falls apart there. Instead the outline is walked along the real rounded
 * rectangle and split into four segments at the corner midpoints, so each edge
 * hands over to the next one mid-curve and the corners stay perfectly round.
 *
 * The reference fixes the size at 150x50 because every text layer is absolutely
 * positioned; here a visually hidden sizer carries the real text so the button
 * grows with the label. The visible layers are decorative, so the accessible
 * name lives on the button itself.
 */
export function TracingButton({ children, hoverLabel, icon, surface, ink, accent, className, style, ...rest }: TracingButtonProps) {
    const buttonRef = useRef<HTMLButtonElement>(null);
    const [size, setSize] = useState<{ width: number; height: number } | null>(null);

    useEffect(() => {
        const element = buttonRef.current;
        if (!element) return undefined;
        const measure = () => {
            const { offsetWidth, offsetHeight } = element;
            setSize(offsetWidth > 0 && offsetHeight > 0 ? { width: offsetWidth, height: offsetHeight } : null);
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    const segments = size ? outlineSegments(size.width, size.height) : null;

    return (
        <button
            ref={buttonRef}
            type="button"
            aria-label={children}
            className={cn("tracing-button", className)}
            // Only spread the accent when given: an undefined custom property would
            // be written as an invalid value and take the border down with it.
            style={
                {
                    "--tracing-surface": surface,
                    "--tracing-ink": ink,
                    "--tracing-radius": `${RADIUS}px`,
                    "--tracing-icon-slot": icon ? "22px" : "0px",
                    ...(accent ? { "--tracing-accent": accent } : {}),
                    ...style,
                } as CSSProperties
            }
            {...rest}
        >
            {segments ? (
                <svg
                    className="tracing-button__outline"
                    width={size!.width}
                    height={size!.height}
                    viewBox={`0 0 ${size!.width} ${size!.height}`}
                    aria-hidden="true"
                    focusable="false"
                >
                    <path d={segments.top} pathLength={1} />
                    <path d={segments.left} pathLength={1} />
                    <path d={segments.bottom} pathLength={1} />
                    <path d={segments.right} pathLength={1} />
                </svg>
            ) : null}
            <span className="tracing-button__sizer" aria-hidden="true">
                {icon}
                {children}
            </span>
            {icon ? (
                <span className="tracing-button__icon" aria-hidden="true">
                    {icon}
                </span>
            ) : null}
            <span className="tracing-button__label" aria-hidden="true">
                <span className="tracing-button__title">{children}</span>
                <span className="tracing-button__text">{hoverLabel ?? children}</span>
            </span>
        </button>
    );
}
