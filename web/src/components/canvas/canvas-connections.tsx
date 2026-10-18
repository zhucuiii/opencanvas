import { useLayoutEffect, useRef, type MouseEvent as ReactMouseEvent } from "react";

import { canvasThemes } from "@/lib/canvas-theme";
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
    const pathD = connectionPathD(from.position.x + from.width, from.position.y + from.height / 2, to.position.x, to.position.y + to.height / 2);
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
            for (const path of Array.from(group.children)) path.setAttribute("d", d);
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
                fill="none"
                style={{ cursor: "pointer", pointerEvents: "stroke" }}
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
            <path d={pathD} stroke={active ? "#2f80ff" : theme.node.faint} strokeWidth={active ? 2 : 1.5} strokeOpacity={active ? 1 : 0.82} fill="none" style={{ pointerEvents: "none" }} />
        </g>
    );
}

export function ActiveConnectionPath({ node, handle, mouseWorld, target }: { node?: CanvasNodeData; handle: ConnectionHandle; mouseWorld: Position; target?: CanvasNodeData }) {
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

    return <path d={pathD} stroke="#b1b1b7" strokeWidth="1" strokeLinecap="butt" strokeLinejoin="round" fill="none" />;
}
