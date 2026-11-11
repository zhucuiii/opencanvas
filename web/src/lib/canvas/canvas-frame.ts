import { CanvasNodeType, type CanvasNodeData, type Position } from "@/types/canvas";

/**
 * 组（frame）的几何与归属。
 *
 * 移植自 ddcat-ai/open-ai-canvas 的 lib/canvas/canvas-frame.ts，并改到本项目的数据结构上。
 *
 * 与原实现一致的三条要点：
 *
 * 1. **组是底层容器，不是普通节点**。它固定在最底层（z 0），子节点浮在它上面，
 *    所以「框住」这件事在视觉上自动成立，不需要给子节点算裁剪。
 * 2. **归属用显式 parent 字段**，不靠坐标包含判定。坐标判定只在拖拽落点时用一次。
 * 3. **尺寸只增不减，除非显式重算**。拖入时与现有框求并集，避免框突然缩回去把手上的
 *    节点甩在外面。
 */

/** 头部高度：标题、折叠按钮、成员数都在这一条里。 */
export const FRAME_HEADER_HEIGHT = 36;
/** 内容区四周留白。 */
export const FRAME_PADDING = 24;
/** 折叠后的尺寸。 */
export const FRAME_COLLAPSED_WIDTH = 240;
export const FRAME_COLLAPSED_HEIGHT = 144;

export function isFrameNode(node?: CanvasNodeData | null): boolean {
    return node?.type === CanvasNodeType.Group;
}

/**
 * 组的子节点。
 *
 * 优先读顶层 `parentId`（新数据）；回落到 `metadata.groupId`（旧数据）。
 * 两者都支持是为了让已有画布不用迁移就能继续打开 —— 重建索引时会把旧字段
 * 顺手写成新字段（见 normalizeFrameParents）。
 */
export function getFrameChildren(frameId: string, nodes: CanvasNodeData[]): CanvasNodeData[] {
    return nodes.filter((node) => node.type !== CanvasNodeType.Group && (node.parentId === frameId || node.metadata?.groupId === frameId));
}

export function getFrameChildIds(frameId: string, nodes: CanvasNodeData[]): Set<string> {
    return new Set(getFrameChildren(frameId, nodes).map((node) => node.id));
}

/** 组当前的折叠状态。 */
export function isFrameCollapsed(node: CanvasNodeData): boolean {
    return Boolean(node.metadata?.collapsed);
}

/**
 * 哪类节点能进组。
 *
 * 组不能进组（避免嵌套带来的坐标与层级歧义）；配置节点不产出内容，也不收。
 */
export function canFrameContain(node: CanvasNodeData): boolean {
    return node.type === CanvasNodeType.Image || node.type === CanvasNodeType.Video || node.type === CanvasNodeType.Audio || node.type === CanvasNodeType.Text;
}

/** 子树包含关系：node 的祖先里是否有 ancestorId。用于阻止把组拖进自己内部。 */
export function isDescendantOf(node: CanvasNodeData, ancestorId: string, nodes: CanvasNodeData[]): boolean {
    let current = node.parentId ? nodes.find((item) => item.id === node.parentId) : undefined;
    let guard = 0;
    while (current && guard < 64) {
        if (current.id === ancestorId) return true;
        current = current.parentId ? nodes.find((item) => item.id === current!.parentId) : undefined;
        guard += 1;
    }
    return false;
}

/** 组的边界：按成员算，而不是信组自己存的宽高（后者可能过期）。 */
export function frameContentBounds(members: CanvasNodeData[]) {
    if (!members.length) return null;
    return {
        left: Math.min(...members.map((node) => node.position.x)),
        top: Math.min(...members.map((node) => node.position.y)),
        right: Math.max(...members.map((node) => node.position.x + node.width)),
        bottom: Math.max(...members.map((node) => node.position.y + node.height)),
    };
}

/**
 * 包住成员的矩形（成员外扩 padding，顶部再让出 header）。
 * 成组那一刻用它定初始尺寸。
 */
export function getFrameWrapRect(members: CanvasNodeData[]) {
    const bounds = frameContentBounds(members);
    if (!bounds) return null;
    return {
        x: bounds.left - FRAME_PADDING,
        y: bounds.top - FRAME_HEADER_HEIGHT - FRAME_PADDING,
        width: bounds.right - bounds.left + FRAME_PADDING * 2,
        height: bounds.bottom - bounds.top + FRAME_HEADER_HEIGHT + FRAME_PADDING * 2,
    };
}

/**
 * 判断拖动中的节点是否该落进某个组。
 *
 * 判定用**中心点**（不是整个矩形相交）：只要节点中心进了组的可用区域就算进。
 * 顶部边界要加上 header 高度 —— 标题栏那一条不属于内容区，拖到标题上不该触发。
 */
export function findFrameDropTarget(movedNodes: CanvasNodeData[], nodes: CanvasNodeData[], draggingIds: Set<string>): CanvasNodeData | null {
    if (!movedNodes.length) return null;
    // 从后往前找：后渲染的组在视觉上更靠上，优先作为目标。
    for (let index = nodes.length - 1; index >= 0; index -= 1) {
        const frame = nodes[index];
        if (!isFrameNode(frame) || draggingIds.has(frame.id)) continue;
        if (isFrameCollapsed(frame)) continue;
        // 拖的是组的后代时不能落进它自己
        if (movedNodes.some((node) => node.id === frame.id || isDescendantOf(node, frame.id, nodes))) continue;
        const left = frame.position.x;
        const top = frame.position.y + FRAME_HEADER_HEIGHT;
        const right = frame.position.x + frame.width;
        const bottom = frame.position.y + frame.height;
        const allInside = movedNodes.every((node) => {
            const cx = node.position.x + node.width / 2;
            const cy = node.position.y + node.height / 2;
            return cx >= left && cx <= right && cy >= top && cy <= bottom;
        });
        if (allInside) return frame;
    }
    return null;
}

/**
 * 把拖动结束的节点归到目标组下，并把组框扩到能包住所有成员。
 *
 * 尺寸取**并集**（现有框 ∪ 成员范围），不是重新包裹：这样拖动过程中框只会长大，
 * 不会因为某个成员被挪近而突然收缩，把别的成员甩到框外。
 */
export function applyFrameDrop(nodes: CanvasNodeData[], draggingIds: Set<string>, frameId: string | null): CanvasNodeData[] {
    const next = nodes.map((node) => {
        if (!draggingIds.has(node.id)) return node;
        if (!canFrameContain(node)) return node;
        if (!frameId) {
            // 拖到空白处：脱离原来的组
            return node.parentId ? { ...node, parentId: undefined, metadata: { ...node.metadata, groupId: undefined } } : node;
        }
        return { ...node, parentId: frameId, metadata: { ...node.metadata, groupId: frameId } };
    });
    if (!frameId) return next;
    return expandFrameToFit(next, frameId);
}

/** 把组框扩到能包住当前所有成员（只扩不缩，除非传入 shrink）。 */
export function expandFrameToFit(nodes: CanvasNodeData[], frameId: string, shrink = false): CanvasNodeData[] {
    const frame = nodes.find((node) => node.id === frameId);
    const children = getFrameChildren(frameId, nodes);
    if (!frame || !isFrameNode(frame) || !children.length) return nodes;

    const bounds = frameContentBounds(children)!;
    const wantLeft = bounds.left - FRAME_PADDING;
    const wantTop = bounds.top - FRAME_HEADER_HEIGHT - FRAME_PADDING;
    const wantRight = bounds.right + FRAME_PADDING;
    const wantBottom = bounds.bottom + FRAME_PADDING;

    const left = shrink ? wantLeft : Math.min(frame.position.x, wantLeft);
    const top = shrink ? wantTop : Math.min(frame.position.y, wantTop);
    const right = shrink ? wantRight : Math.max(frame.position.x + frame.width, wantRight);
    const bottom = shrink ? wantBottom : Math.max(frame.position.y + frame.height, wantBottom);

    // 尺寸变化不到 2px 就不动，避免每次拖动都产生新对象把整排节点推去重渲染。
    if (Math.abs(left - frame.position.x) < 2 && Math.abs(top - frame.position.y) < 2 && Math.abs(right - left - frame.width) < 2 && Math.abs(bottom - top - frame.height) < 2) {
        return nodes;
    }

    return nodes.map((node) => (node.id === frameId ? { ...node, position: { x: left, y: top }, width: right - left, height: bottom - top } : node));
}

/** 组内成员整体平移（拖动组时用）。 */
export function moveFrameWithChildren(nodes: CanvasNodeData[], frameId: string, dx: number, dy: number): CanvasNodeData[] {
    const childIds = getFrameChildIds(frameId, nodes);
    return nodes.map((node) => {
        if (node.id === frameId || childIds.has(node.id)) {
            return { ...node, position: { x: node.position.x + dx, y: node.position.y + dy } };
        }
        return node;
    });
}

/**
 * 归一化父字段：把旧的 metadata.groupId 提升成顶层 parentId。
 *
 * 打开老画布时跑一次。这样后续所有逻辑只认 parentId，不用到处判两套字段。
 */
export function normalizeFrameParents(nodes: CanvasNodeData[]): CanvasNodeData[] {
    let changed = false;
    const next = nodes.map((node) => {
        if (node.type === CanvasNodeType.Group) return node;
        const legacy = node.metadata?.groupId;
        if (legacy && node.parentId !== legacy) {
            changed = true;
            return { ...node, parentId: legacy };
        }
        return node;
    });
    return changed ? next : nodes;
}

/**
 * 新建组的初始位置与尺寸。members 至少两个（单个节点不需要成组）。
 */
export function frameRectForMembers(members: CanvasNodeData[]): { position: Position; width: number; height: number } | null {
    const rect = getFrameWrapRect(members);
    if (!rect) return null;
    return { position: { x: rect.x, y: rect.y }, width: rect.width, height: rect.height };
}
