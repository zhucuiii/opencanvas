import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { animate, motion, useMotionTemplate, useMotionValue, useMotionValueEvent, useReducedMotion } from "motion/react";

import "./sling-button.css";

/*
 * 移植自 reactbits.dev/micro/sling-button（源码：DavidHDev/react-bits 的
 * src/content/Micro/SlingButton）。原版依赖 @hugeicons/react 出默认图标，
 * 这里改成必须由调用方传 children，少背一个图标包。
 *
 * 移植时唯一的改动是 CSS 变量改由调用方按主题注入（原版写死深色一套），
 * 以及把类型补全；动效数学、阈值、缓动全部按原版照抄，见 sling-button.css 的说明。
 */

const GAP = 4;
const SLOP = { fine: 4, coarse: 8 };
const FINGER_MAX = 3000;
const HAND_MAX = 6000;
/** 没上膛就松手时，回弹速度占发射速度的比例。 */
const CANCEL = 0.5;
const POWER_CAP = 1.5;
const DOT_MS = 300;
const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";

const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));
/** 把超出部分压回来，越拉越硬。 */
const rubberband = (offset: number, dim: number, c = 0.55) => (offset * dim * c) / (dim + c * Math.abs(offset));

export function SlingButton({
    children,
    onSend,
    padColor = "#f5f5f5",
    iconColor = "#18181b",
    accentColor = "#f5f5f5",
    wellColor = "#27272a",
    bandColor = "#52525b",
    size = 40,
    strokeWidth = 2,
    armAt = 34,
    maxPull = 120,
    launchSpeed = 2600,
    recoil = 0.2,
    flight = 120,
    particles = 14,
    spread = 60,
    axis = "any",
    tapSends = true,
    disabled = false,
    ariaLabel,
    hint,
    className = "",
}: {
    children: ReactNode;
    onSend?: () => void;
    padColor?: string;
    iconColor?: string;
    accentColor?: string;
    wellColor?: string;
    bandColor?: string;
    size?: number;
    strokeWidth?: number;
    /** 拉伸到多少像素算「上膛」。 */
    armAt?: number;
    maxPull?: number;
    launchSpeed?: number;
    recoil?: number;
    flight?: number;
    particles?: number;
    spread?: number;
    axis?: "any" | "horizontal" | "vertical";
    tapSends?: boolean;
    disabled?: boolean;
    ariaLabel: string;
    hint?: string;
    className?: string;
}) {
    const reduce = useReducedMotion();
    const R = maxPull;
    const ARM = Math.min(armAt, 0.8 * R);
    const wellR = size / 2 + GAP + strokeWidth;
    const padR = size / 2 - strokeWidth / 2;
    const arcR = wellR;
    const H = wellR + strokeWidth + 2;
    const DOT = Math.max(6, Math.round(size / 7));
    const count = Math.max(0, Math.round(particles));

    const [held, setHeld] = useState(false);
    const [armed, setArmed] = useState(false);
    const [sent, setSent] = useState(false);
    const rootRef = useRef<HTMLSpanElement>(null);
    const padRef = useRef<HTMLButtonElement>(null);
    const fxRef = useRef<SVGGElement>(null);
    const bandRef = useRef<SVGPathElement>(null);
    const hotRef = useRef<SVGPathElement>(null);
    const arcRef = useRef<SVGCircleElement>(null);
    const dotRefs = useRef<(HTMLSpanElement | null)[]>([]);
    const power = useRef(0);
    const iconRef = useRef<HTMLSpanElement>(null);
    const grip = useRef<{
        id: number;
        startX: number;
        startY: number;
        scale: number;
        moved: boolean;
        hist: { x: number; y: number; t: number }[];
        rawOrigin: { x: number; y: number };
        slop: number;
    } | null>(null);
    const dir = useRef({ ux: 0, uy: -1 });
    const animX = useRef<ReturnType<typeof animate> | null>(null);
    const animY = useRef<ReturnType<typeof animate> | null>(null);
    const armedRef = useRef(false);
    const dotPending = useRef(false);
    const dotTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const paintQueued = useRef(false);
    const skipClick = useRef(false);
    const hintId = useId();

    const px = useMotionValue(0);
    const py = useMotionValue(0);
    const padT = useMotionTemplate`translate(${px}px, ${py}px)`;

    const relaxIcon = () => {
        const icon = iconRef.current;
        if (!icon) return;
        icon.style.transition = reduce ? "none" : `transform 360ms ${EASE_OUT}`;
        icon.style.transform = "rotate(0deg)";
    };

    /** 松手后从圆孔中心沿拖动方向喷出一撮粒子。 */
    const launchDot = () => {
        dotPending.current = false;
        clearTimeout(dotTimer.current);
        const { ux, uy } = dir.current;
        relaxIcon();
        const base = Math.atan2(-uy, -ux);
        const cone = (spread * Math.PI) / 180;
        const push = 0.85 + 0.35 * power.current;
        dotRefs.current.forEach((dot, index) => {
            if (!dot) return;
            // 第 0 颗是领头的，笔直飞出去；其余的散开、大小随机。
            const lead = index === 0;
            const angle = base + (lead ? 0 : (Math.random() + Math.random() - 1) * (cone / 2));
            const cx = Math.cos(angle);
            const cy = Math.sin(angle);
            const reach = (lead ? flight : flight * (0.3 + Math.random())) * push;
            const drift = lead ? 0 : (Math.random() - 0.5) * flight * 0.4;
            const scale = lead ? 1 : 0.3 + Math.random() * 0.6;
            const shrink = lead ? 0.6 : scale * (0.2 + Math.random() * 0.4);
            const duration = lead ? DOT_MS : DOT_MS * (0.7 + Math.random());
            const delay = lead ? 0 : Math.random() * 70;
            const to = wellR + reach;
            dot.animate([{ transform: `translate(${cx * wellR}px, ${cy * wellR}px) scale(${scale})` }, { transform: `translate(${cx * to - cy * drift}px, ${cy * to + cx * drift}px) scale(${shrink})` }], { duration, delay, easing: EASE_OUT, fill: "none" });
            dot.animate([{ opacity: 1, offset: 0 }, { opacity: 1, offset: 0.55 }, { opacity: 0, offset: 1 }], { duration, delay, easing: "linear", fill: "none" });
        });
    };

    /** 图标转到「背对拖动方向」，让箭头一直指着拉出去的方向。 */
    const aimIcon = (ux: number, uy: number, dist: number) => {
        const icon = iconRef.current;
        if (!icon) return;
        const angle = (Math.atan2(-uy, -ux) * 180) / Math.PI + 90;
        icon.style.transition = "none";
        icon.style.transform = `rotate(${angle * clamp(dist / 12, 0, 1)}deg)`;
    };

    /**
     * 按当前拉伸量重画皮筋和进度弧。两处切点用余弦定理求：皮筋一端切在圆孔上、
     * 另一端切在圆钮上，所以是「圆孔半径 + 圆钮半径」的两条公切线。
     */
    const paint = () => {
        paintQueued.current = false;
        const band = bandRef.current;
        const hot = hotRef.current;
        const arc = arcRef.current;
        const fx = fxRef.current;
        if (!band || !hot || !arc || !fx) return;
        const x = px.get();
        const y = py.get();
        const { ux, uy } = dir.current;
        const proj = x * ux + y * uy;
        const p = clamp(proj / ARM, 0, 1);
        const dist = Math.hypot(x, y);
        let d = "";
        if (dist > 0.5) {
            const a = Math.atan2(y, x);
            const b = Math.acos(clamp((wellR - padR) / dist, -1, 1));
            d = [a + b, a - b]
                .map((theta) => {
                    const cx = Math.cos(theta);
                    const cy = Math.sin(theta);
                    return `M${(wellR * cx).toFixed(2)},${(wellR * cy).toFixed(2)}L${(x + padR * cx).toFixed(2)},${(y + padR * cy).toFixed(2)}`;
                })
                .join("");
        }
        band.setAttribute("d", d);
        hot.setAttribute("d", d);
        hot.style.opacity = String(p);
        fx.style.opacity = String(clamp(proj / 6, 0, 1));
        arc.setAttribute("stroke-dasharray", `${p} ${1 - p}`);
        arc.setAttribute("stroke-dashoffset", String(p / 2));
        arc.style.opacity = p > 0.01 ? "1" : "0";
        aimIcon(ux, uy, dist);
        arc.setAttribute("transform", `rotate(${(Math.atan2(-uy, -ux) * 180) / Math.PI})`);
        if (dotPending.current && proj <= size / 4) launchDot();
    };

    const schedulePaint = () => {
        if (paintQueued.current) return;
        paintQueued.current = true;
        requestAnimationFrame(paint);
    };
    useMotionValueEvent(px, "change", schedulePaint);
    useMotionValueEvent(py, "change", schedulePaint);

    useEffect(() => {
        animX.current?.stop();
        animY.current?.stop();
        px.jump(0);
        py.jump(0);
        paint();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [size, strokeWidth, armAt, maxPull, axis]);

    /** 把圆钮弹回原位，带上松手时的速度。 */
    const settle = (v0: { x: number; y: number }) => {
        if (reduce) {
            const fx = fxRef.current;
            if (fx) {
                fx.style.transition = "opacity 200ms ease";
                fx.style.opacity = "0";
            }
            setTimeout(() => {
                px.jump(0);
                py.jump(0);
                if (fx) fx.style.transition = "";
            }, 200);
            return;
        }
        animX.current = animate(px, 0, { type: "spring", duration: 0.4, bounce: recoil, velocity: v0.x });
        animY.current = animate(py, 0, { type: "spring", duration: 0.4, bounce: recoil, velocity: v0.y });
    };

    const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
        if (disabled || grip.current || event.button !== 0) return;
        const el = rootRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const scale = rect.width / (el.offsetWidth || rect.width) || 1;
        animX.current?.stop();
        animY.current?.stop();
        const x = px.get();
        const y = py.get();
        // 从「已经拉出去一段」的状态再按下去时，把当前位移反解成原始位移作为起点，
        // 否则接着拖会跳一下。
        const dNow = Math.hypot(x, y);
        const dClamped = Math.min(dNow, 0.95 * R);
        const rawNow = dNow > 0.5 ? (R * dClamped) / (R - dClamped) : 0;
        grip.current = {
            id: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            scale,
            moved: false,
            hist: [],
            rawOrigin: dNow > 0.5 ? { x: (rawNow * x) / dNow, y: (rawNow * y) / dNow } : { x: 0, y: 0 },
            slop: event.pointerType === "touch" ? SLOP.coarse : SLOP.fine,
        };
        try {
            event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
            // 指针捕获失败不影响拖动，忽略。
        }
        setHeld(true);
    };

    const onPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
        const g = grip.current;
        if (!g || g.id !== event.pointerId) return;
        const dx = (event.clientX - g.startX) / g.scale;
        const dy = (event.clientY - g.startY) / g.scale;
        let rx = g.rawOrigin.x + dx;
        let ry = g.rawOrigin.y + dy;
        if (axis === "horizontal") ry = rubberband(ry, size / 4);
        else if (axis === "vertical") rx = rubberband(rx, size / 4);
        if (!g.moved && Math.hypot(dx, dy) > g.slop) g.moved = true;
        const raw = Math.hypot(rx, ry);
        if (raw < 0.01) return;
        // 原始位移经这个式子压成实际位移：拉得越远越吃力，且永远够不到 maxPull。
        const d = (R * raw) / (R + raw);
        const ux = rx / raw;
        const uy = ry / raw;
        dir.current = { ux, uy };
        px.set(d * ux);
        py.set(d * uy);
        const now = performance.now();
        g.hist.push({ x: d * ux, y: d * uy, t: now });
        while (g.hist.length > 4 || now - g.hist[0].t > 80) g.hist.shift();
        const isArmed = d >= ARM;
        if (isArmed !== armedRef.current) {
            armedRef.current = isArmed;
            setArmed(isArmed);
        }
    };

    const release = (pointerId: number, cancelled: boolean) => {
        const g = grip.current;
        if (!g || g.id !== pointerId) return;
        grip.current = null;
        // 拖过就不算点击，压掉随后浏览器补发的 click。
        skipClick.current = true;
        try {
            padRef.current?.releasePointerCapture(pointerId);
        } catch {
            // 已经释放过了，忽略。
        }
        const d = Math.hypot(px.get(), py.get());
        const p = d / ARM;
        const { ux, uy } = dir.current;
        // 用最近 80ms 的位移估松手速度，超过 50ms 没动就不算「甩」。
        let vx = 0;
        let vy = 0;
        if (!cancelled && g.hist.length > 1) {
            const first = g.hist[0];
            const lastPoint = g.hist[g.hist.length - 1];
            const dt = lastPoint.t - first.t;
            if (dt > 0 && performance.now() - lastPoint.t < 50) {
                vx = ((lastPoint.x - first.x) / dt) * 1000;
                vy = ((lastPoint.y - first.y) / dt) * 1000;
            }
        }
        const finger = Math.hypot(vx, vy);
        if (finger > FINGER_MAX) {
            vx *= FINGER_MAX / finger;
            vy *= FINGER_MAX / finger;
        }

        if (!g.moved) {
            // 只是点了一下。
            relaxIcon();
            if (tapSends && !cancelled) onSend?.();
        } else {
            const fire = armedRef.current && !cancelled;
            // 发射速度沿反方向弹；没上膛就按 CANCEL 的比例轻轻弹回去。
            const launch = fire ? launchSpeed * Math.min(p, POWER_CAP) : CANCEL * launchSpeed * Math.min(p, 1);
            let v0x = vx - ux * launch;
            let v0y = vy - uy * launch;
            const hand = Math.hypot(v0x, v0y);
            if (hand > HAND_MAX) {
                v0x *= HAND_MAX / hand;
                v0y *= HAND_MAX / hand;
            }
            if (!fire) relaxIcon();
            if (fire) {
                onSend?.();
                if (reduce) {
                    setSent(true);
                    setTimeout(() => setSent(false), 200);
                } else {
                    power.current = clamp((Math.min(p, POWER_CAP) - 1) / (POWER_CAP - 1), 0, 1);
                    dotPending.current = true;
                    dotTimer.current = setTimeout(launchDot, 150);
                }
            }
            settle({ x: v0x, y: v0y });
        }
        armedRef.current = false;
        setHeld(false);
        setArmed(false);
    };

    useEffect(
        () => () => {
            animX.current?.stop();
            animY.current?.stop();
            clearTimeout(dotTimer.current);
        },
        [],
    );

    return (
        <span
            ref={rootRef}
            className={`sling-button${className ? ` ${className}` : ""}`}
            data-armed={armed ? "" : undefined}
            data-sent={sent ? "" : undefined}
            style={
                {
                    "--sl-size": `${size}px`,
                    "--sl-svg": `${2 * H}px`,
                    "--sl-pad": padColor,
                    "--sl-icon": iconColor,
                    "--sl-accent": accentColor,
                    "--sl-well": wellColor,
                    "--sl-band": bandColor,
                    "--sl-stroke": `${strokeWidth}px`,
                    "--sl-dot": `${DOT}px`,
                } as React.CSSProperties
            }
        >
            <svg className="sling-button__fx" viewBox={`${-H} ${-H} ${2 * H} ${2 * H}`} aria-hidden="true">
                <g ref={fxRef} className="sling-button__tension" style={{ opacity: 0 }}>
                    <path ref={bandRef} className="sling-button__band" />
                    <path ref={hotRef} className="sling-button__band sling-button__band--hot" />
                </g>
                <circle className="sling-button__well" r={wellR} />
                <circle ref={arcRef} className="sling-button__arc" r={arcR} pathLength="1" strokeDasharray="0 1" style={{ opacity: 0 }} />
            </svg>
            {Array.from({ length: count }, (_, index) => (
                <span
                    key={index}
                    ref={(el) => {
                        dotRefs.current[index] = el;
                    }}
                    className="sling-button__dot"
                    aria-hidden="true"
                />
            ))}
            <motion.span className="sling-button__move" style={{ transform: padT }}>
                <button
                    ref={padRef}
                    type="button"
                    className="sling-button__pad"
                    aria-label={ariaLabel}
                    aria-describedby={hintId}
                    aria-disabled={disabled || undefined}
                    data-held={held ? "" : undefined}
                    data-armed={armed ? "" : undefined}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={(event) => release(event.pointerId, false)}
                    onPointerCancel={(event) => release(event.pointerId, true)}
                    onLostPointerCapture={(event) => release(event.pointerId, true)}
                    onKeyDown={(event) => {
                        if (event.key === "Escape" && grip.current) release(grip.current.id, true);
                    }}
                    onClick={() => {
                        if (skipClick.current) {
                            skipClick.current = false;
                            return;
                        }
                        if (!disabled) onSend?.();
                    }}
                >
                    <span className="sling-button__face">
                        <span ref={iconRef} className="sling-button__icon">
                            {children}
                        </span>
                    </span>
                </button>
            </motion.span>
            <span id={hintId} className="sling-button__sr">
                {hint}
            </span>
        </span>
    );
}