import { useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from "react";

import { CANVAS_CONNECTION_STROKE_WIDTH, canvasThemes } from "@/lib/canvas-theme";
import { subscribeConnectionMorph } from "@/lib/canvas/connection-morph";
import { useThemeStore } from "@/stores/use-theme-store";
import type { CanvasConnection, CanvasNodeData, ConnectionHandle, Position } from "@/types/canvas";

/**
 * 连线的曲线路径。端点取「源节点右边缘中点 → 目标节点左边缘中点」。
 * 单独抽出来是因为节点尺寸有过渡动画：过渡期间连线要用节点**实际渲染**的尺寸重算，
 * 否则会跟节点边缘脱开（见 project.tsx 的 morph 重算）。
 */
export function connectionPathD(sx: number, sy: number, ex: number, ey: number) {
    const curvature = Math.max(Math.abs(ex - sx) * 0.5, 50);
    return `M ${sx} ${sy} C ${sx + curvature} ${sy}, ${ex - curvature} ${ey}, ${ex} ${ey}`;
}

/** 曲线一定落在控制点凸包内，所以端点外扩一个曲率就是安全的裁剪范围。 */
export function isConnectionInView(startX: number, startY: number, endX: number, endY: number, viewBounds: { left: number; top: number; right: number; bottom: number }) {
    const curvature = Math.max(Math.abs(endX - startX) * 0.5, 50);
    return Math.max(startX + curvature, endX) > viewBounds.left && Math.min(startX, endX - curvature) < viewBounds.right && Math.max(startY, endY) > viewBounds.top && Math.min(startY, endY) < viewBounds.bottom;
}

export function ConnectionPath({
    connection,
    from,
    to,
    active,
    morphKey,
    onSelect,
    onContextMenu,
}: {
    connection: CanvasConnection;
    from: CanvasNodeData;
    to: CanvasNodeData;
    active: boolean;
    /** 节点形变动画的进度记号：值一变就按节点的实际渲染尺寸重算路径（见 project.tsx 的 morph 重算）。 */
    morphKey?: string;
    onSelect: () => void;
    onContextMenu?: (event: ReactMouseEvent<SVGPathElement>) => void;
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const groupRef = useRef<SVGGElement>(null);
    const [hovered, setHovered] = useState(false);
    const startX = from.position.x + from.width;
    const startY = from.position.y + from.height / 2;
    const endX = to.position.x;
    const endY = to.position.y + to.height / 2;
    const pathD = connectionPathD(startX, startY, endX, endY);
    const emphasized = active || hovered;
    // 数据坐标下的路径直接写 DOM：形变动画期间每帧都要改，走 React state 会拖垮整页。
    // 这个 effect 故意不带依赖：每次渲染都要在**绘制前**重算一次。
    // 因为尺寸一变 React 就会把「按数据坐标算的」路径写进 d，而节点实际是动画过去的，
    // 不在这儿当场纠正的话，那一帧会先闪一下旧位置再被总线拉回来。
    const syncRef = useRef<() => void>(() => {});
    useLayoutEffect(() => {
        const group = groupRef.current;
        const svg = group?.ownerSVGElement;
        if (!group || !svg) return;
        // 节点的 getBoundingClientRect 是屏幕坐标，而 path 的 d 写在 SVG 的用户坐标里，
        // 画布又有缩放，所以必须反变换回去（直接写屏幕坐标会整体偏掉）。
        const toUser = (screenX: number, screenY: number) => {
            const point = svg.createSVGPoint();
            point.x = screenX;
            point.y = screenY;
            const inverse = svg.getScreenCTM()?.inverse();
            return inverse ? point.matrixTransform(inverse) : point;
        };
        const nodeRect = (id: string) => {
            const element = svg.parentElement?.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(id)}"] .atelier-node-frame`);
            return element ? element.getBoundingClientRect() : null;
        };
        const sync = () => {
            const a = nodeRect(connection.fromNodeId);
            const b = nodeRect(connection.toNodeId);
            if (!a || !b) return;
            const s = toUser(a.right, (a.top + a.bottom) / 2);
            const e = toUser(b.left, (b.top + b.bottom) / 2);
            const d = connectionPathD(s.x, s.y, e.x, e.y);
            for (const path of Array.from(group.querySelectorAll("path"))) path.setAttribute("d", d);
            // 端点圆点同样按节点实际渲染位置纠正，形变动画期间不与曲线脱开。
            const dotStart = group.querySelector<SVGCircleElement>('[data-role="connection-dot-start"]');
            const dotEnd = group.querySelector<SVGCircleElement>('[data-role="connection-dot-end"]');
            dotStart?.setAttribute("cx", String(s.x));
            dotStart?.setAttribute("cy", String(s.y));
            dotEnd?.setAttribute("cx", String(e.x));
            dotEnd?.setAttribute("cy", String(e.y));
        };
        syncRef.current = sync;
        sync();
    });
    // 形变期间由事件总线驱动逐帧重算（节点尺寸一变，页面就喊一声）。
    useLayoutEffect(() => subscribeConnectionMorph(() => syncRef.current()), [connection.fromNodeId, connection.toNodeId]);
    const setGroup = (element: SVGGElement | null) => {
        groupRef.current = element;
    };

    return (
        <g ref={setGroup}>
            <path
                data-connection-id={connection.id}
                d={pathD}
                stroke="transparent"
                strokeWidth="16"
                vectorEffect="non-scaling-stroke"
                fill="none"
                style={{ cursor: "pointer", pointerEvents: "stroke" }}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                onClick={(event) => {
                    event.stopPropagation();
                    onSelect();
                }}
                onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onContextMenu?.(event);
                }}
            />
            <path d={pathD} stroke={theme.connection.stroke ?? theme.node.faint} strokeWidth={CANVAS_CONNECTION_STROKE_WIDTH} vectorEffect="non-scaling-stroke" strokeOpacity={0.8} strokeLinecap="round" strokeLinejoin="round" fill="none" style={{ pointerEvents: "none" }} />
            <circle data-role="connection-dot-start" cx={startX} cy={startY} r={2.5} fill={emphasized ? theme.connection.beam ?? theme.node.text : theme.connection.stroke ?? theme.node.faint} fillOpacity={0.8} style={{ pointerEvents: "none" }} />
            <circle data-role="connection-dot-end" cx={endX} cy={endY} r={2.5} fill={emphasized ? theme.connection.beam ?? theme.node.text : theme.connection.stroke ?? theme.node.faint} fillOpacity={0.8} style={{ pointerEvents: "none" }} />
            {emphasized ? <CanvasConnectionBeam pathD={pathD} color={theme.connection.beam ?? theme.node.text} /> : null}
        </g>
    );
}

export function ActiveConnectionPath({ node, handle, mouseWorld, target }: { node?: CanvasNodeData; handle: ConnectionHandle; mouseWorld: Position; target?: CanvasNodeData }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    if (!node) return null;

    const startX = handle.handleType === "source" ? node.position.x + node.width : mouseWorld.x;
    const startY = handle.handleType === "source" ? node.position.y + node.height / 2 : mouseWorld.y;
    const endX = handle.handleType === "source" ? mouseWorld.x : node.position.x;
    const endY = handle.handleType === "source" ? mouseWorld.y : node.position.y + node.height / 2;
    const snappedStartX = handle.handleType === "target" && target ? target.position.x + target.width : startX;
    const snappedStartY = handle.handleType === "target" && target ? target.position.y + target.height / 2 : startY;
    const snappedEndX = handle.handleType === "source" && target ? target.position.x : endX;
    const snappedEndY = handle.handleType === "source" && target ? target.position.y + target.height / 2 : endY;
    const pathD = connectionPathD(snappedStartX, snappedStartY, snappedEndX, snappedEndY);

    // 拖拽草稿：底线 + 常驻流光，视觉与已落定的连线一致。
    return (
        <g>
            <path d={pathD} stroke={theme.connection.stroke ?? theme.node.faint} strokeWidth={CANVAS_CONNECTION_STROKE_WIDTH} vectorEffect="non-scaling-stroke" strokeOpacity={0.72} strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <CanvasConnectionBeam pathD={pathD} color={theme.connection.beam ?? theme.node.text} />
        </g>
    );
}

const BEAM_LAYERS = [0.35, 0.6, 0.9, 1.2, CANVAS_CONNECTION_STROKE_WIDTH, 1.65, 1.9, 2.1].map((width, index) => ({
    length: 36 - index * 4,
    offset: -index * 4,
    width,
    opacity: 0.14 + index * 0.07,
}));

/** 连线流光（彗星）：多层短划沿曲线同速行进，圆头细尾的水滴轮廓。 */
export function CanvasConnectionBeam({ pathD, color }: { pathD: string; color: string }) {
    // 前缘对齐，靠近头部的短层逐渐加宽、加深，形成圆头细尾的水滴轮廓。
    // 各层都沿原曲线行进，转弯时尾部自然贴线，底线宽度不受影响。
    // 统一周期为路径的三分之一（pathLength=300，每周期走 100），循环无跳帧；
    // 动画由 CSS 驱动，不逐帧更新 React。描边宽按画布缩放补偿，屏幕上恒定。
    return <g data-connection-beam aria-hidden="true" style={{ pointerEvents: "none" }}>
        {BEAM_LAYERS.map(({ length, offset, width, opacity }) => <path
            key={length}
            className="canvas-connection-comet"
            d={pathD}
            pathLength={300}
            stroke={color}
            strokeWidth={width}
            strokeOpacity={opacity}
            strokeDasharray={`${length} ${100 - length}`}
            strokeDashoffset={offset}
            strokeLinecap="round"
            fill="none"
            style={{ "--canvas-beam-offset": `${offset}px`, strokeWidth: `calc(${width}px / var(--canvas-committed-scale, 1))` } as CSSProperties}
        />)}
    </g>;
}
