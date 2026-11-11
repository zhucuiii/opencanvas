import { useLayoutEffect, useRef } from "react";

import { CANVAS_CONNECTION_STROKE_WIDTH, canvasThemes } from "@/lib/canvas-theme";
import { subscribeConnectionMorph } from "@/lib/canvas/connection-morph";
import { useThemeStore } from "@/stores/use-theme-store";
import type { CanvasNodeData } from "@/types/canvas";

/**
 * 组内「汇聚线」：从每个成员右缘中点引一条曲线，收到组的输出锚点上。
 *
 * 为什么要画这个：组对外只暴露一个输出点，如果连接线直接从组框右缘拉出去，
 * 视觉上就看不出「组里那几张图一起供给了下游」—— 即梦 / LibTV 的做法是让每个
 * 成员各伸一条线汇聚到同一个出口，形成漏斗状。这里是同一件事的实现。
 *
 * 用 DOM 直接写 path 的 d，不走 React state：节点拖动 / 形变期间每帧都要重算，
 * 走 state 会把整页拖去重渲染（和 canvas-connections.tsx 的处理一致）。
 */
export function CanvasGroupHarness({
    group,
    members,
}: {
    group: CanvasNodeData;
    members: CanvasNodeData[];
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const groupRef = useRef<SVGGElement>(null);
    const syncRef = useRef<() => void>(() => {});

    // 锚点：组框右缘中点（与 ConnectionHandleDot 的位置一致）。
    const anchorX = group.position.x + group.width;
    const anchorY = group.position.y + group.height / 2;

    useLayoutEffect(() => {
        const svgGroup = groupRef.current;
        const svg = svgGroup?.ownerSVGElement;
        if (!svgGroup || !svg) return;

        const toUser = (screenX: number, screenY: number) => {
            const point = svg.createSVGPoint();
            point.x = screenX;
            point.y = screenY;
            const inverse = svg.getScreenCTM()?.inverse();
            return inverse ? point.matrixTransform(inverse) : point;
        };
        const frameRect = (id: string) =>
            svg.parentElement?.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(id)}"] .atelier-node-frame`)?.getBoundingClientRect() ?? null;

        const sync = () => {
            const anchorEl = svg.parentElement?.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(group.id)}"] .atelier-node-frame`);
            const anchorRect = anchorEl?.getBoundingClientRect();
            const anchor = anchorRect ? toUser(anchorRect.right, (anchorRect.top + anchorRect.bottom) / 2) : null;

            const paths = Array.from(svgGroup.querySelectorAll<SVGPathElement>("path[data-group-harness]"));
            members.forEach((member, index) => {
                const path = paths[index];
                if (!path || !anchor) return;
                const rect = frameRect(member.id);
                if (!rect) return;
                const start = toUser(rect.right, (rect.top + rect.bottom) / 2);
                path.setAttribute("d", harnessPathD(start.x, start.y, anchor.x, anchor.y));
            });
        };

        syncRef.current = sync;
        sync();
    });
    useLayoutEffect(() => subscribeConnectionMorph(() => syncRef.current()), [group.id]);

    if (!members.length) return null;

    return (
        <g ref={groupRef} aria-hidden="true" style={{ pointerEvents: "none" }}>
            {members.map((member, index) => {
                const startX = member.position.x + member.width;
                const startY = member.position.y + member.height / 2;
                return (
                    <path
                        key={member.id}
                        data-group-harness
                        d={harnessPathD(startX, startY, anchorX, anchorY)}
                        stroke={theme.connection.stroke ?? theme.node.faint}
                        strokeWidth={CANVAS_CONNECTION_STROKE_WIDTH}
                        vectorEffect="non-scaling-stroke"
                        strokeOpacity={0.55}
                        strokeLinecap="round"
                        fill="none"
                        // 内联样式兜住初始渲染那一帧：路径在 layout effect 里才校准到真实位置。
                        style={{ pointerEvents: "none" }}
                    />
                );
            })}
            <circle cx={anchorX} cy={anchorY} r={2.5} fill={theme.connection.stroke ?? theme.node.faint} fillOpacity={0.7} />
        </g>
    );
}

/**
 * 汇聚线的曲线：起点向右先走一小段，再收向锚点。
 * 曲率取水平距离的一半（下限 40），和普通连线用同一套手感，
 * 这样组内的线跟组外的线看起来是一套语言。
 */
function harnessPathD(sx: number, sy: number, ex: number, ey: number) {
    const curvature = Math.max(Math.abs(ex - sx) * 0.5, 40);
    return `M ${sx} ${sy} C ${sx + curvature} ${sy}, ${ex - curvature} ${ey}, ${ex} ${ey}`;
}
