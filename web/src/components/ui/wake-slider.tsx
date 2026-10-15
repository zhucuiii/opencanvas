import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { frame, useMotionValue, useMotionValueEvent, useReducedMotion, useSpring, useVelocity } from "motion/react";

import "./wake-slider.css";

/*
 * 移植自 reactbits.dev/micro/wake-slider（源码：DavidHDev/react-bits 的
 * src/content/Micro/WakeSlider）。动效数学、阈值、弹簧参数全部照抄，只补了类型；
 * 配色改成由调用方按主题注入。机制见 wake-slider.css 顶部的说明。
 */

/** 头部弹簧的基准角频率。 */
const SETTLE = 9.23;
/** 速度到这个值就算「甩满」，隆起幅度封顶。 */
const FULL_SPEED = 320;
const MIN_REACH = 1.5;
/** 振幅低于它且上一帧也低于它，就跳过这一帧的写入。 */
const FLAT = 0.002;

const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));
const smoothstep = (s: number) => s * s * (3 - 2 * s);
const toPct = (value: number, min: number, max: number) => (max > min ? ((value - min) / (max - min)) * 100 : 0);
/** 吸附到 step 网格；贴到上界时优先取 max 而不是往回退一格。 */
const snap = (value: number, min: number, max: number, step: number) => {
    if (!(max > min)) return min;
    if (!(step > 0)) return clamp(value, min, max);
    const lastWhole = min + Math.floor(+((max - min) / step).toFixed(6)) * step;
    const grid = clamp(Math.round((value - min) / step) * step + min, min, lastWhole);
    return +(lastWhole < max && Math.abs(value - max) <= Math.abs(value - grid) ? max : grid).toFixed(6);
};

export function WakeSlider({
    value: valueProp,
    defaultValue = 50,
    onChange,
    min = 0,
    max = 100,
    step = 1,
    bars = 32,
    height = 40,
    restHeight = 9,
    gap = 4,
    fillColor = "#f5f5f5",
    trackColor = "#27272a",
    crestColor = "",
    sensitivity = 1,
    reach = 6,
    skew = 0.6,
    glide = 0.3,
    smoothing = 100,
    showValue = false,
    formatValue,
    disabled = false,
    ariaLabel = "Value",
    className = "",
}: {
    /** 受控值；不传则自己管。 */
    value?: number;
    defaultValue?: number;
    onChange?: (value: number) => void;
    min?: number;
    max?: number;
    step?: number;
    /** 竖条数量。 */
    bars?: number;
    /** 轨道高度，也就是竖条隆起后的最大高度。 */
    height?: number;
    /** 静止时竖条的高度。 */
    restHeight?: number;
    gap?: number;
    fillColor?: string;
    trackColor?: string;
    /** 留空则不渲染波峰高亮层（跟原版默认一致）。 */
    crestColor?: string;
    sensitivity?: number;
    /** 甩满时隆起的半径，单位是「几根条」。 */
    reach?: number;
    /** 前后不对称的程度：尾迹比前方长多少。 */
    skew?: number;
    glide?: number;
    smoothing?: number;
    showValue?: boolean;
    formatValue?: (value: number) => string;
    disabled?: boolean;
    ariaLabel?: string;
    className?: string;
}) {
    const [inner, setInner] = useState(defaultValue);
    const value = clamp(valueProp ?? inner, min, max);
    const pct = toPct(value, min, max);
    const reduce = useReducedMotion();
    const format = formatValue ?? String;
    const rest = Math.min(restHeight, height - 1) / height;

    const rootRef = useRef<HTMLDivElement>(null);
    const trackRef = useRef<HTMLDivElement>(null);
    const handleRef = useRef<HTMLButtonElement>(null);
    const barEls = useRef<(HTMLSpanElement | null)[]>([]);
    const crestEls = useRef<(HTMLSpanElement | null)[]>([]);
    const pointerId = useRef<number | null>(null);
    const lastAmp = useRef(0);
    const latest = useRef(value);
    latest.current = value;

    const target = useMotionValue(pct);
    // 头部位置走一条欠阻尼弹簧（阻尼比固定 1：w0 由 glide 决定）。
    const w0 = SETTLE / glide;
    const head = useSpring(target, { stiffness: w0 * w0, damping: 2 * w0, mass: 1 });
    const rawSpeed = useVelocity(head);
    // 速度再走一条弹簧，免得抖。压平一下手抖带来的毛刺。
    const wv = 2000 / smoothing;
    const speed = useSpring(rawSpeed, { stiffness: wv * wv, damping: 2.5 * wv, mass: 1 });

    useEffect(() => {
        target.set(pct);
    }, [pct, target]);

    const paint = (force = false) => {
        const h = ((reduce ? target.get() : head.get()) / 100) * (bars - 1);
        const v = reduce ? 0 : speed.get();
        const amp = smoothstep(clamp((Math.abs(v) * sensitivity) / FULL_SPEED, 0, 1));
        const dir = Math.sign(v) || 1;
        const r = MIN_REACH + (reach - MIN_REACH) * amp;
        const behind = r * (1 + skew);
        const ahead = r * (1 - 0.5 * skew);
        const lit = Math.round(h);
        const flat = !force && amp < FLAT && lastAmp.current < FLAT;
        for (let i = 0; i < bars; i++) {
            const el = barEls.current[i];
            if (!el) continue;
            const on = i <= lit ? "true" : "false";
            if (el.dataset.on !== on) el.dataset.on = on;
            if (flat) continue;
            const d = i - h;
            // 后方（尾迹）用更大的半径，前方更短，波形就朝后拖。
            const R = d * dir < 0 ? behind : ahead;
            const lift = Math.abs(d) < R ? amp * Math.cos((Math.PI * d) / (2 * R)) ** 2 : 0;
            el.style.transform = `scaleY(${rest + lift * (1 - rest)})`;
            const crest = crestEls.current[i];
            if (crest) crest.style.opacity = String(lift);
        }
        lastAmp.current = amp;
    };
    const paintRef = useRef(paint);
    paintRef.current = paint;
    const run = useCallback(() => paintRef.current(), []);
    const schedule = useCallback(() => frame.render(run, false, true), [run]);
    useMotionValueEvent(head, "change", schedule);
    useMotionValueEvent(speed, "change", schedule);
    useLayoutEffect(() => {
        paintRef.current(true);
    });

    const commit = (next: number) => {
        const clean = snap(next, min, max, step);
        if (clean === latest.current) return;
        latest.current = clean;
        if (valueProp === undefined) setInner(clean);
        onChange?.(clean);
    };
    const commitFromX = (x: number) => {
        const track = trackRef.current;
        if (!track) return;
        const rect = track.getBoundingClientRect();
        if (!rect.width) return;
        let ratio = clamp((x - rect.left) / rect.width, 0, 1);
        if (getComputedStyle(track).direction === "rtl") ratio = 1 - ratio;
        commit(min + ratio * (max - min));
    };
    const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        if (disabled || pointerId.current !== null) return;
        pointerId.current = event.pointerId;
        try {
            event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
            // 捕获失败不影响拖动，忽略。
        }
        rootRef.current?.removeAttribute("data-instant");
        handleRef.current?.focus({ preventScroll: true });
        commitFromX(event.clientX);
    };
    const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
        if (event.pointerId === pointerId.current) commitFromX(event.clientX);
    };
    const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
        if (event.pointerId !== pointerId.current) return;
        try {
            event.currentTarget.releasePointerCapture(event.pointerId);
        } catch {
            // 已经释放过了，忽略。
        }
        pointerId.current = null;
    };
    const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
        if (disabled) return;
        const jumps: Record<string, number> = {
            ArrowRight: value + step,
            ArrowUp: value + step,
            ArrowLeft: value - step,
            ArrowDown: value - step,
            PageUp: value + step * 10,
            PageDown: value - step * 10,
            Home: min,
            End: max,
        };
        if (!(event.key in jumps)) return;
        event.preventDefault();
        const clean = snap(jumps[event.key], min, max, step);
        const p = toPct(clean, min, max);
        // 键盘跳变不该鼓出尾迹，所以直接跳到目标并关掉颜色过渡。
        rootRef.current?.setAttribute("data-instant", "true");
        head.jump(p);
        speed.jump(0);
        target.jump(p);
        commit(clean);
    };

    const barNodes = useMemo(() => {
        barEls.current.length = bars;
        crestEls.current.length = bars;
        return Array.from({ length: bars }, (_, index) => (
            <span
                key={index}
                ref={(el) => {
                    barEls.current[index] = el;
                }}
                className="wake-slider__bar"
            >
                {crestColor ? (
                    <span
                        ref={(el) => {
                            crestEls.current[index] = el;
                        }}
                        className="wake-slider__crest"
                    />
                ) : null}
            </span>
        ));
    }, [bars, crestColor]);

    return (
        <div
            ref={rootRef}
            className={`wake-slider${className ? ` ${className}` : ""}`}
            aria-disabled={disabled || undefined}
            style={
                {
                    "--ws-fill": fillColor,
                    "--ws-track": trackColor,
                    "--ws-crest": crestColor || fillColor,
                    "--ws-height": `${height}px`,
                    "--ws-gap": `${gap}px`,
                    "--ws-rest": rest,
                } as CSSProperties
            }
        >
            <div ref={trackRef} className="wake-slider__track" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag}>
                {barNodes}
                <button
                    ref={handleRef}
                    type="button"
                    role="slider"
                    className="wake-slider__handle"
                    tabIndex={disabled ? -1 : 0}
                    aria-label={ariaLabel}
                    aria-valuemin={min}
                    aria-valuemax={max}
                    aria-valuenow={value}
                    aria-valuetext={format(value)}
                    aria-disabled={disabled || undefined}
                    onKeyDown={onKeyDown}
                />
            </div>
            {showValue ? (
                <span className="wake-slider__value" aria-hidden="true">
                    {format(value)}
                </span>
            ) : null}
        </div>
    );
}