/*
 * 移植自 reactbits.dev/components/gooey-nav（源码：DavidHDev/react-bits 的
 * src/content/Components/GooeyNav）。类名和变量保留原版的命名习惯（gooey-nav__x →
 * gooey-pills__x、--gn-* → --gp-*），方便跟原版对照。
 *
 * 机制：两层完全相同的选项列表叠在一起 —— 下面那层是常态文字色，上面那层是高亮文字色，
 * 用 clip-path 裁成「液体形状」。液体形状是每帧在 CPU 上扫描线描出来的：选中气泡和飞出去的
 * 小水珠都当成 SDF，做平滑并集（metaball），描出轮廓路径；同一套场再交给 WebGL 画一遍
 * 带高光和投影的气泡本体。所以切换时文字是「被液体吞进去」的，不是整块底色瞬移。
 *
 * 配色不硬编码：气泡色、高亮文字色、常态文字色、悬停色由调用方按主题传入。
 *
 * 和原版的差异只有三处：一是拿掉了原版自带的 nav 外框（调用方已经有底槽了）；
 * 二是尺寸参数换成我们这边的固定尺寸；三是 StrictMode 相关 —— 卸载时只删 buffer/program、
 * 不调 loseContext()（挂载→卸载→重挂载时第二次 getContext 会返回 null，整块会变空白）。
 */

import { useEffect, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";

import "./gooey-pills.css";

export type GooeyPillsItem = { label: ReactNode; ariaLabel?: string };

const MAX_DROPS = 32;
const MAX_PILLS = 4;
const MARGIN = 72;

const VERTEX = `#version 300 es
in vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const FRAGMENT = `#version 300 es
precision highp float;

uniform vec2 uSize;
uniform float uRatio;
uniform vec4 uPills[${MAX_PILLS}];
uniform vec4 uHover;
uniform vec4 uDrops[${MAX_DROPS}];
uniform vec2 uTails[${MAX_DROPS}];
uniform vec3 uTints[${MAX_DROPS}];
uniform int uCount;
uniform float uSmooth;
uniform vec3 uPill;
uniform vec4 uHoverColor;
uniform float uShadow;

out vec4 outColor;

float sdPill(vec2 p, vec4 box) {
  vec2 extent = max(box.zw, vec2(0.0));
  float r = min(extent.x, extent.y);
  vec2 q = abs(p - box.xy) - extent + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

float sdCapsule(vec2 p, vec2 a, vec2 b, float r) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 0.0001), 0.0, 1.0);
  return length(pa - ba * h) - r;
}

vec4 blend(vec4 a, vec4 b, float k) {
  float h = clamp(0.5 + 0.5 * (b.w - a.w) / k, 0.0, 1.0);
  return vec4(mix(b.rgb, a.rgb, h), mix(b.w, a.w, h) - k * h * (1.0 - h));
}

vec4 field(vec2 p) {
  vec4 shape = vec4(uPill, 1e5);
  for (int i = 0; i < ${MAX_PILLS}; i++) {
    vec4 pill = uPills[i];
    if (pill.z <= 0.0) continue;
    shape = blend(shape, vec4(uPill, sdPill(p, pill)), uSmooth);
  }
  for (int i = 0; i < ${MAX_DROPS}; i++) {
    if (i >= uCount) break;
    vec4 drop = uDrops[i];
    if (drop.z <= 0.0) continue;
    float d = sdCapsule(p, drop.xy, drop.xy - uTails[i], drop.z);
    if (d > shape.w + uSmooth) continue;
    shape = blend(shape, vec4(uTints[i], d), uSmooth);
  }
  return shape;
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uSize.y * uRatio - gl_FragCoord.y) / uRatio;
  vec4 shape = field(p);
  float d = shape.w;
  float aa = max(fwidth(d), 0.35);
  float body = clamp(0.5 - d / aa, 0.0, 1.0);

  vec2 grad = vec2(dFdx(d), -dFdy(d));
  vec2 n = length(grad) > 0.0001 ? normalize(grad) : vec2(0.0, 1.0);
  float rim = (1.0 - smoothstep(0.0, 1.6, -d)) * max(0.0, -n.y) * 0.3;
  vec3 fill = mix(shape.rgb, vec3(1.0), rim) * (1.0 - 0.06 * max(0.0, n.y) * (1.0 - smoothstep(0.0, 6.0, -d)));

  float lifted = field(p - vec2(0.0, 3.0)).w;
  float shadow = (1.0 - smoothstep(-3.0, 9.0, lifted)) * uShadow * (1.0 - body);

  float hover = clamp(0.5 - sdPill(p, uHover) / aa, 0.0, 1.0) * uHoverColor.a;

  vec4 color = vec4(0.0, 0.0, 0.0, shadow);
  color = vec4(uHoverColor.rgb * hover, hover) + color * (1.0 - hover);
  color = vec4(fill * body, body) + color * (1.0 - body);
  outColor = color;
}
`;

const parse = (value: string): [number, number, number, number] => {
    const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(value).trim());
    if (match) {
        const hex = match[1].length === 3 ? match[1].replace(/./g, (digit) => digit + digit) : match[1];
        return [0, 2, 4].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255).concat(1) as [number, number, number, number];
    }
    const rgba = /rgba?\(([^)]+)\)/i.exec(String(value));
    if (rgba) {
        const parts = rgba[1].split(",").map((part) => parseFloat(part));
        return [parts[0] / 255, parts[1] / 255, parts[2] / 255, parts[3] ?? 1];
    }
    return [1, 1, 1, 1];
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const travelEase = (t: number) => {
    const x = clamp01(t);
    return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
};

const bezier = (a: number, b: number, c: number, d: number, t: number) => {
    const u = 1 - t;
    return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
};

const pillPath = (x: number, y: number, w: number, h: number) => {
    if (w <= 0.5 || h <= 0.5) return "";
    const r = Math.min(w, h) / 2;
    return `M${x + r},${y}H${x + w - r}A${r},${r} 0 0 1 ${x + w},${y + r}V${y + h - r}A${r},${r} 0 0 1 ${x + w - r},${y + h}H${x + r}A${r},${r} 0 0 1 ${x},${y + h - r}V${y + r}A${r},${r} 0 0 1 ${x + r},${y}Z`;
};

const compile = (gl: WebGL2RenderingContext, type: number, source: string) => {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return shader;
};

const UNIFORMS = ["uSize", "uRatio", "uPills", "uHover", "uDrops", "uTails", "uTints", "uCount", "uSmooth", "uPill", "uHoverColor", "uShadow"] as const;

type Pipeline = {
    program: WebGLProgram;
    uniforms: Record<string, WebGLUniformLocation | null>;
    buffer: WebGLBuffer;
    position: number;
};

const build = (gl: WebGL2RenderingContext): Pipeline | null => {
    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
    if (!vertex || !fragment) return null;
    const program = gl.createProgram();
    if (!program) return null;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        gl.deleteProgram(program);
        return null;
    }
    const uniforms = Object.fromEntries(UNIFORMS.map((name) => [name, gl.getUniformLocation(program, name)]));
    const buffer = gl.createBuffer();
    if (!buffer) return null;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    return { program, uniforms, buffer, position: gl.getAttribLocation(program, "aPosition") };
};

type Rect = { x: number; y: number; w: number; h: number };
type Box = { x: number; y: number; w: number; h: number };
type PillState = { mass: number; scale: number; velocity: number; outgoing: number };
type Drop = {
    x: number;
    y: number;
    vx: number;
    vy: number;
    mass: number;
    size: number;
    given: number;
    source: number;
    index: number;
    leave: number;
    emerged: number;
    absorbed: number;
    state: "waiting" | "flying" | "absorbing";
    start: number;
    duration: number;
    path: number[];
};

export function GooeyPills({
    items,
    activeIndex,
    onChange,
    pillColor = "#3f3f46",
    activeInk = "#fafafa",
    mutedInk = "rgba(250, 250, 250, 0.62)",
    hoverColor = "#fafafa",
    hoverAlpha = 0.07,
    shadow = 0.35,
    animationTime = 600,
    particleCount = 10,
    timeVariance = 300,
    spread = 30,
    gooeyness = 0.5,
    wobble = 0.5,
    hoverEffect = true,
    columns,
    gap = 0,
    ariaLabel,
    className = "",
}: {
    items: GooeyPillsItem[];
    activeIndex: number;
    onChange?: (index: number) => void;
    /** 传了就换成宫格布局：等宽换行，每行 columns 个。 */
    columns?: number;
    /** 选项之间的间距（px）。 */
    gap?: number;
    /** 气泡（选中块）的填充色。 */
    pillColor?: string;
    /** 被液体盖住时文字的颜色。 */
    activeInk?: string;
    /** 常态文字色。 */
    mutedInk?: string;
    /** 悬停时那层淡淡的底色，alpha 由 hoverAlpha 给。 */
    hoverColor?: string;
    hoverAlpha?: number;
    /** 气泡投影强度。 */
    shadow?: number;
    /** 移动一趟的基准时长（毫秒）。 */
    animationTime?: number;
    /** 切换时喷出的小水珠数量上限，按转移的质量缩放。 */
    particleCount?: number;
    /** 每颗水珠在基准时长上的随机浮动（毫秒）。 */
    timeVariance?: number;
    /** 水珠飞出去的最大距离。 */
    spread?: number;
    /** 液体感：并集的平滑半径系数，越大越黏。 */
    wobble?: number;
    gooeyness?: number;
    hoverEffect?: boolean;
    ariaLabel?: string;
    className?: string;
}) {
    const current = Math.min(Math.max(0, activeIndex), Math.max(0, items.length - 1));
    const stageRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const listRef = useRef<HTMLUListElement>(null);
    const overlayRef = useRef<HTMLUListElement>(null);
    const fallbackRef = useRef<HTMLSpanElement>(null);
    const engineRef = useRef<{ go: (index: number) => void; refresh: () => void } | null>(null);
    const indexRef = useRef(current);
    indexRef.current = current;

    // 参数每帧都要读，但改参数不该重建引擎，所以放在 ref 里由渲染期同步。
    const settingsRef = useRef({ animationTime, particleCount, timeVariance, spread, gooeyness, wobble, hoverEffect, pillRgb: parse(pillColor), hoverRgb: parse(hoverColor), hoverAlpha, shadow });
    settingsRef.current = { animationTime, particleCount, timeVariance, spread, gooeyness, wobble, hoverEffect, pillRgb: parse(pillColor), hoverRgb: parse(hoverColor), hoverAlpha, shadow };

    useLayoutEffect(() => {
        const stage = stageRef.current;
        const canvas = canvasRef.current;
        const list = listRef.current;
        const overlay = overlayRef.current;
        const fallback = fallbackRef.current;
        if (!stage || !canvas || !list || !overlay || !fallback) return;

        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        // StrictMode 下会挂载→卸载→重挂载：这里绝不能调 loseContext()，第二次就再也拿不到上下文了。
        const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false });
        const pipeline = gl ? build(gl) : null;
        fallback.style.display = pipeline ? "none" : "block";
        canvas.style.display = pipeline ? "block" : "none";

        const view = { width: 0, height: 0 };
        let rects: Rect[] = [];
        let target = -1;
        const pills = new Map<number, PillState>();
        const drops: Drop[] = [];
        const hover = { x: 0, y: 0, w: 0, h: 0, alpha: 0, index: -1 };
        const pillData = new Float32Array(MAX_PILLS * 4);
        const dropData = new Float32Array(MAX_DROPS * 4);
        const tailData = new Float32Array(MAX_DROPS * 2);
        const tintData = new Float32Array(MAX_DROPS * 3);
        let raf = 0;
        let last = 0;
        let disposed = false;

        const measure = () => {
            const box = stage.getBoundingClientRect();
            const ratio = Math.min(window.devicePixelRatio || 1, 2);
            view.width = box.width;
            view.height = box.height;
            const outerWidth = box.width + MARGIN * 2;
            const outerHeight = box.height + MARGIN * 2;
            Object.assign(canvas.style, { left: `${-MARGIN}px`, top: `${-MARGIN}px`, width: `${outerWidth}px`, height: `${outerHeight}px` });
            const width = Math.max(1, Math.round(outerWidth * ratio));
            const height = Math.max(1, Math.round(outerHeight * ratio));
            if (canvas.width !== width || canvas.height !== height) {
                canvas.width = width;
                canvas.height = height;
            }
            rects = Array.from(list.children).map((item) => {
                const rect = item.getBoundingClientRect();
                return { x: rect.left - box.left, y: rect.top - box.top, w: rect.width, h: rect.height };
            });
        };

        /* 扫描线描轮廓：把气泡和水珠都当 SDF，平滑并集后逐行找零交点，拼出 SVG 路径。 */
        const trace = (boxes: { cx: number; cy: number; hw: number; hh: number }[], blobs: { x: number; y: number; r: number; tx: number; ty: number }[], smooth: number) => {
            const field = (x: number, y: number) => {
                let d = 1e5;
                const merge = (value: number) => {
                    const h = clamp01(0.5 + (0.5 * (value - d)) / smooth);
                    d = value + (d - value) * h - smooth * h * (1 - h);
                };
                for (const box of boxes) {
                    const r = Math.min(box.hw, box.hh);
                    const qx = Math.abs(x - box.cx) - box.hw + r;
                    const qy = Math.abs(y - box.cy) - box.hh + r;
                    merge(Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r);
                }
                for (const blob of blobs) {
                    const px = x - blob.x;
                    const py = y - blob.y;
                    const bx = -blob.tx;
                    const by = -blob.ty;
                    const span = bx * bx + by * by;
                    const h = span > 0.0001 ? clamp01((px * bx + py * by) / span) : 0;
                    const value = Math.hypot(px - bx * h, py - by * h) - blob.r;
                    if (value > d + smooth) continue;
                    merge(value);
                }
                return d;
            };
            const step = 2;
            const parts: string[] = [];
            for (let y = 0; y < view.height; y += 1) {
                const cy = y + 0.5;
                let previous = field(0, cy);
                let start: number | null = previous < 0 ? 0 : null;
                for (let x = step; x <= view.width + step; x += step) {
                    const value = field(Math.min(x, view.width), cy);
                    if (previous < 0 !== value < 0) {
                        const cross = x - step + (step * previous) / (previous - value);
                        if (value < 0) start = cross;
                        else if (start !== null) {
                            parts.push(`M${start.toFixed(1)},${y}H${cross.toFixed(1)}V${y + 1}H${start.toFixed(1)}Z`);
                            start = null;
                        }
                    }
                    previous = value;
                }
                if (start !== null) parts.push(`M${start.toFixed(1)},${y}H${view.width}V${y + 1}H${start.toFixed(1)}Z`);
            }
            return parts.join("");
        };

        const pill = (index: number) => {
            if (!pills.has(index)) pills.set(index, { mass: 0, scale: 0, velocity: 0, outgoing: 0 });
            return pills.get(index) as PillState;
        };

        /* 质量 amount 从 0 到 1 时，气泡从「没有」长成整格大小。 */
        const shape = (index: number, amount: number): Box | null => {
            const rect = rects[index];
            if (!rect || amount <= 0.002) return null;
            const h = rect.h * Math.min(1.08, 0.42 + 0.58 * Math.sqrt(Math.max(0, amount)));
            const w = Math.max(h, rect.w * Math.max(0, amount) ** 0.75);
            return { x: rect.x + rect.w / 2 - w / 2, y: rect.y + rect.h / 2 - h / 2, w, h };
        };

        const plan = (drop: Drop, index: number, now: number, fresh: boolean) => {
            const s = settingsRef.current;
            const rect = rects[index];
            if (!rect) return;
            const reach = Math.max(0, s.spread);
            const ex = rect.x + rect.w / 2 + (Math.random() - 0.5) * rect.w * 0.45;
            const ey = rect.y + rect.h / 2 + (Math.random() - 0.5) * rect.h * 0.2;
            const base = Math.max(0.15, s.animationTime / 1000);
            const variance = (Math.random() - 0.5) * (Math.max(0, s.timeVariance) / 1000);
            const duration = Math.max(0.15, base * (0.62 + Math.random() * 0.32) + variance * 0.6);
            const out = Math.random() * Math.PI * 2;
            const into = Math.random() * Math.PI * 2;
            const burst = reach * (0.7 + Math.random() * 0.6);
            const swing = reach * (0.55 + Math.random() * 0.55);
            const carry = Math.min(duration / 3, 0.12);
            drop.index = index;
            drop.start = now;
            drop.duration = duration;
            drop.path = [
                drop.x,
                drop.y,
                fresh ? drop.x + Math.cos(out) * burst * 1.6 : drop.x + drop.vx * carry,
                fresh ? drop.y + Math.sin(out) * burst * 1.6 : drop.y + drop.vy * carry,
                ex + Math.cos(into) * swing * 1.5,
                ey + Math.sin(into) * swing * 1.5,
                ex,
                ey,
            ];
        };

        /* 老气泡把质量拆成若干水珠，交给新位置去吸收 —— 液体就是这样「流」过去的。 */
        const emit = (from: number, to: number, now: number) => {
            const s = settingsRef.current;
            const source = pills.get(from);
            const rect = rects[from];
            if (!source || !rect || !rects[to]) return;
            const available = source.mass - source.outgoing;
            if (available <= 0.002) return;
            const room = MAX_DROPS - drops.length;
            const count = Math.min(room, Math.max(1, Math.round(Math.max(1, s.particleCount) * available)));
            if (count <= 0) return;
            const window = Math.max(0.15, s.animationTime / 1000) * 0.16;
            for (let i = 0; i < count; i++) {
                const mass = available / count;
                source.outgoing += mass;
                drops.push({
                    x: rect.x + rect.w / 2 + (Math.random() - 0.5) * rect.w * 0.6,
                    y: rect.y + rect.h / 2 + (Math.random() - 0.5) * rect.h * 0.3,
                    vx: 0,
                    vy: 0,
                    mass,
                    size: 0.8 + Math.random() * 0.4,
                    given: 0,
                    source: from,
                    index: to,
                    leave: now + Math.random() * window * 1000,
                    emerged: 0,
                    absorbed: 0,
                    state: "waiting",
                    start: 0,
                    duration: 0,
                    path: [],
                });
            }
        };

        const render = () => {
            const s = settingsRef.current;
            const height = rects[target]?.h ?? rects[0]?.h ?? 36;
            const smooth = height * (0.18 + 0.5 * clamp01(s.gooeyness));
            const boxes: { cx: number; cy: number; hw: number; hh: number }[] = [];
            const blobs: { x: number; y: number; r: number; tx: number; ty: number }[] = [];
            for (const [index, state] of pills) {
                const box = shape(index, state.scale);
                if (box) boxes.push({ cx: box.x + box.w / 2, cy: box.y + box.h / 2, hw: box.w / 2, hh: box.h / 2 });
            }
            for (const drop of drops) {
                if (drop.state === "waiting") continue;
                const radius = 0.26 * height * drop.size * Math.min(drop.emerged, 1 - drop.absorbed);
                if (radius <= 0.05) continue;
                const speed = Math.hypot(drop.vx, drop.vy);
                const length = Math.min(radius * 1.1, speed * 0.018);
                blobs.push({
                    x: drop.x,
                    y: drop.y,
                    r: radius,
                    tx: speed > 0.01 ? (drop.vx / speed) * length : 0,
                    ty: speed > 0.01 ? (drop.vy / speed) * length : 0,
                });
            }

            const settledPill = boxes.length === 1 && !blobs.length;
            if (settledPill) {
                const box = boxes[0];
                overlay.style.clipPath = `path('${pillPath(box.cx - box.hw, box.cy - box.hh, box.hw * 2, box.hh * 2)}')`;
            } else {
                overlay.style.clipPath = `path('${trace(boxes, blobs, smooth) || "M0,0Z"}')`;
            }
            overlay.style.visibility = "visible";

            if (!pipeline || !gl) {
                const box = shape(target, 1);
                if (box) {
                    fallback.style.transform = `translate(${box.x.toFixed(2)}px, ${box.y.toFixed(2)}px)`;
                    fallback.style.width = `${box.w}px`;
                    fallback.style.height = `${box.h}px`;
                }
                fallback.style.opacity = box ? "1" : "0";
                return;
            }

            let slot = 0;
            for (const box of boxes) {
                if (slot >= MAX_PILLS) break;
                pillData[slot * 4] = box.cx + MARGIN;
                pillData[slot * 4 + 1] = box.cy + MARGIN;
                pillData[slot * 4 + 2] = box.hw;
                pillData[slot * 4 + 3] = box.hh;
                slot += 1;
            }
            pillData.fill(0, slot * 4);
            let count = 0;
            for (const blob of blobs) {
                if (count >= MAX_DROPS) break;
                dropData[count * 4] = blob.x + MARGIN;
                dropData[count * 4 + 1] = blob.y + MARGIN;
                dropData[count * 4 + 2] = blob.r;
                dropData[count * 4 + 3] = 0;
                tailData[count * 2] = blob.tx;
                tailData[count * 2 + 1] = blob.ty;
                const tint = s.pillRgb;
                tintData[count * 3] = tint[0];
                tintData[count * 3 + 1] = tint[1];
                tintData[count * 3 + 2] = tint[2];
                count += 1;
            }

            const { program, uniforms, buffer, position } = pipeline;
            gl.viewport(0, 0, canvas.width, canvas.height);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.useProgram(program);
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.enableVertexAttribArray(position);
            gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
            gl.uniform2f(uniforms.uSize, view.width + MARGIN * 2, view.height + MARGIN * 2);
            gl.uniform1f(uniforms.uRatio, canvas.width / Math.max(1, view.width + MARGIN * 2));
            gl.uniform4fv(uniforms.uPills, pillData);
            gl.uniform4f(uniforms.uHover, hover.x + MARGIN, hover.y + MARGIN, hover.w / 2, hover.h / 2);
            gl.uniform4fv(uniforms.uDrops, dropData);
            gl.uniform2fv(uniforms.uTails, tailData);
            gl.uniform3fv(uniforms.uTints, tintData);
            gl.uniform1i(uniforms.uCount, count);
            gl.uniform1f(uniforms.uSmooth, smooth);
            gl.uniform3f(uniforms.uPill, s.pillRgb[0], s.pillRgb[1], s.pillRgb[2]);
            gl.uniform4f(uniforms.uHoverColor, s.hoverRgb[0], s.hoverRgb[1], s.hoverRgb[2], s.hoverAlpha);
            gl.uniform1f(uniforms.uShadow, s.shadow);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        };

        const frame = (now: number) => {
            raf = 0;
            const s = settingsRef.current;
            const dt = Math.min(0.05, (now - last) / 1000 || 0);
            last = now;
            const emergeTime = 0.09;
            const absorbTime = 0.12;

            for (let i = drops.length - 1; i >= 0; i--) {
                const drop = drops[i];
                if (drop.state === "waiting") {
                    if (now < drop.leave) continue;
                    drop.state = "flying";
                    plan(drop, drop.index, now, true);
                }
                if (drop.state === "flying") {
                    drop.emerged = Math.min(1, drop.emerged + dt / emergeTime);
                    const source = pills.get(drop.source);
                    if (source && drop.given < drop.mass) {
                        const step = Math.min(drop.mass * (dt / emergeTime), drop.mass - drop.given);
                        source.mass = Math.max(0, source.mass - step);
                        source.outgoing = Math.max(0, source.outgoing - step);
                        drop.given += step;
                    }
                    const t = clamp01((now - drop.start) / 1000 / drop.duration);
                    const eased = travelEase(t);
                    const [x0, y0, x1, y1, x2, y2, x3, y3] = drop.path;
                    const x = bezier(x0, x1, x2, x3, eased);
                    const y = bezier(y0, y1, y2, y3, eased);
                    if (dt > 0) {
                        drop.vx = (x - drop.x) / dt;
                        drop.vy = (y - drop.y) / dt;
                    }
                    drop.x = x;
                    drop.y = y;
                    if (t >= 1) drop.state = "absorbing";
                }
                if (drop.state === "absorbing") {
                    const step = Math.min(1 - drop.absorbed, dt / absorbTime);
                    drop.absorbed += step;
                    drop.vx *= 0.8;
                    drop.vy *= 0.8;
                    const host = pill(drop.index);
                    host.mass = Math.min(1, host.mass + drop.mass * step);
                    if (drop.absorbed >= 1) drops.splice(i, 1);
                }
            }

            // 阻尼弹簧：wobble 越大越晃；减弱动态效果时直接把阻尼拉满。
            const zeta = reduced ? 1 : 1 - 0.72 * clamp01(s.wobble);
            const omega = 26;
            const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
            const h = dt / steps;
            for (const [index, state] of pills) {
                for (let n = 0; n < steps; n++) {
                    state.velocity += (omega * omega * (state.mass - state.scale) - 2 * zeta * omega * state.velocity) * h;
                    state.scale += state.velocity * h;
                }
                if (index !== target && state.mass <= 0.002 && state.outgoing <= 0.002 && Math.abs(state.scale) < 0.004) {
                    pills.delete(index);
                }
            }

            if (hover.index >= 0 && rects[hover.index]) {
                const rect = rects[hover.index];
                const k = 1 - Math.exp(-dt / 0.06);
                hover.x += (rect.x + rect.w / 2 - hover.x) * k;
                hover.y += (rect.y + rect.h / 2 - hover.y) * k;
                hover.w += (rect.w - hover.w) * k;
                hover.h += (rect.h - hover.h) * k;
            }
            const hoverGoal = s.hoverEffect && hover.index >= 0 && hover.index !== target ? 1 : 0;
            hover.alpha += (hoverGoal - hover.alpha) * (1 - Math.exp(-dt / 0.08));

            render();

            const host = pills.get(target);
            const resting = drops.length === 0 && pills.size === 1 && host && Math.abs(host.mass - host.scale) < 0.0008 && Math.abs(host.velocity) < 0.004;
            const hoverRect = rects[hover.index];
            const hovering = Math.abs(hoverGoal - hover.alpha) > 0.003 || (hoverRect && Math.abs(hoverRect.x + hoverRect.w / 2 - hover.x) + Math.abs(hoverRect.w - hover.w) > 0.1);
            // 静止后停表，不用一直占着 RAF。
            if (!resting || hovering) raf = requestAnimationFrame(frame);
            else if (host) {
                host.mass = 1;
                host.scale = 1;
                host.velocity = 0;
                hover.alpha = hoverGoal;
                render();
            }
        };

        const wake = () => {
            if (raf || disposed) return;
            last = performance.now();
            raf = requestAnimationFrame(frame);
        };

        const settle = (index: number) => {
            pills.clear();
            drops.length = 0;
            target = index;
            const state = pill(index);
            state.mass = 1;
            state.scale = 1;
            state.velocity = 0;
            render();
        };

        const go = (index: number, animate: boolean) => {
            if (index === target) return;
            if (!rects[index] || !animate || reduced || target < 0) {
                settle(index);
                return;
            }
            const now = performance.now();
            target = index;
            pill(index);
            for (const drop of drops) {
                drop.index = index;
                if (drop.state === "flying") plan(drop, index, now, false);
                if (drop.state === "absorbing") {
                    drop.state = "flying";
                    drop.mass *= 1 - drop.absorbed;
                    drop.absorbed = 0;
                    plan(drop, index, now, false);
                }
            }
            for (const from of [...pills.keys()]) {
                if (from !== index) emit(from, index, now);
            }
            wake();
        };

        const onOver = (event: Event) => {
            const item = (event.target as Element | null)?.closest("[data-gooey-index]");
            if (!item || !list.contains(item)) return;
            const index = Number((item as HTMLElement).dataset.gooeyIndex);
            const rect = rects[index];
            if (!rect) return;
            if (hover.alpha < 0.01) {
                hover.x = rect.x + rect.w / 2;
                hover.y = rect.y + rect.h / 2;
                hover.w = rect.w;
                hover.h = rect.h;
            }
            hover.index = index;
            wake();
        };

        const onLeave = () => {
            hover.index = -1;
            wake();
        };

        const resizeObserver = new ResizeObserver(() => {
            measure();
            if (!drops.length) settle(target < 0 ? indexRef.current : target);
            else render();
        });
        resizeObserver.observe(stage);
        resizeObserver.observe(list);

        list.addEventListener("pointerover", onOver);
        list.addEventListener("pointerleave", onLeave);

        measure();
        settle(indexRef.current);
        document.fonts?.ready.then(() => {
            if (disposed) return;
            measure();
            if (!drops.length) settle(target);
        });

        engineRef.current = {
            go: (index: number) => go(index, true),
            refresh: () => {
                render();
                wake();
            },
        };

        return () => {
            disposed = true;
            cancelAnimationFrame(raf);
            resizeObserver.disconnect();
            list.removeEventListener("pointerover", onOver);
            list.removeEventListener("pointerleave", onLeave);
            if (gl && pipeline) {
                gl.deleteBuffer(pipeline.buffer);
                gl.deleteProgram(pipeline.program);
            }
            engineRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [items.length]);

    useEffect(() => {
        engineRef.current?.go(current);
    }, [current]);

    useEffect(() => {
        engineRef.current?.refresh();
    }, [pillColor, animationTime, gooeyness, hoverEffect]);

    const labels = (interactive: boolean) =>
        items.map((item, index) => {
            const content = <span className="gooey-pills__label">{item.label}</span>;
            // 宫格模式下每项等宽：flex-basis 由列数和间距算出来，让它们自己换行。
            const itemStyle = columns ? { flex: `1 1 calc((100% - ${(columns - 1) * gap}px) / ${columns})` } : undefined;
            if (!interactive) {
                return (
                    <li key={index} className="gooey-pills__item" style={itemStyle}>
                        <span className="gooey-pills__link">{content}</span>
                    </li>
                );
            }
            return (
                <li key={index} className="gooey-pills__item" style={itemStyle} data-gooey-index={index} data-active={index === current ? "" : undefined}>
                    <button type="button" className="gooey-pills__link" aria-current={index === current ? "true" : undefined} aria-label={item.ariaLabel} onClick={() => { if (index !== current) onChange?.(index); }}>
                        {content}
                    </button>
                </li>
            );
        });

    return (
        <div
            className={`gooey-pills ${columns ? "gooey-pills--grid" : ""} ${className}`.trim()}
            style={{ "--gp-pill": pillColor, "--gp-active-ink": activeInk, "--gp-ink": activeInk, "--gp-muted": mutedInk, "--gp-gap": `${gap}px` } as CSSProperties}
            role="group"
            aria-label={ariaLabel}
        >
            <div ref={stageRef} className="gooey-pills__stage">
                <canvas ref={canvasRef} className="gooey-pills__canvas" aria-hidden="true" />
                <span ref={fallbackRef} className="gooey-pills__fallback" aria-hidden="true" />
                <ul ref={listRef} className="gooey-pills__list">
                    {labels(true)}
                </ul>
                <ul ref={overlayRef} className="gooey-pills__list gooey-pills__list--active" aria-hidden="true">
                    {labels(false)}
                </ul>
            </div>
        </div>
    );
}
