import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type ConnectionHandle, type ViewportTransform } from "@/types/canvas";

export function nodeBounds(nodes: CanvasNodeData[]) {
    return nodes.reduce(
        (acc, node) => ({
            left: Math.min(acc.left, node.position.x),
            top: Math.min(acc.top, node.position.y),
            right: Math.max(acc.right, node.position.x + node.width),
            bottom: Math.max(acc.bottom, node.position.y + node.height),
        }),
        { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },
    );
}

// Keep a node created from a handle outside its source, even when the menu is clicked in place.
export function connectedNodePosition(source: CanvasNodeData | undefined, node: Pick<CanvasNodeData, "width" | "height">, center: { x: number; y: number }, handleType: ConnectionHandle["handleType"]) {
    const position = { x: center.x - node.width / 2, y: center.y - node.height / 2 };
    if (!source) return position;
    const gap = 120;
    position.x = handleType === "source" ? Math.max(position.x, source.position.x + source.width + gap) : Math.min(position.x, source.position.x - node.width - gap);
    return position;
}

function containsCenter(group: CanvasNodeData, node: CanvasNodeData) {
    const centerX = node.position.x + node.width / 2;
    const centerY = node.position.y + node.height / 2;
    return centerX >= group.position.x && centerX <= group.position.x + group.width && centerY >= group.position.y && centerY <= group.position.y + group.height;
}

export function findGroupDropTarget(movedIds: Set<string>, nodes: CanvasNodeData[]) {
    if (nodes.some((node) => movedIds.has(node.id) && node.type === CanvasNodeType.Group)) return null;
    const movingNodes = nodes.filter((node) => movedIds.has(node.id) && node.type !== CanvasNodeType.Group);
    if (!movingNodes.length) return null;
    // Walk backwards instead of copying and reversing; this runs on every drag frame.
    for (let index = nodes.length - 1; index >= 0; index -= 1) {
        const group = nodes[index];
        if (group.type !== CanvasNodeType.Group || movedIds.has(group.id)) continue;
        if (movingNodes.some((node) => containsCenter(group, node))) return group;
    }
    return null;
}

export function snapNodesIntoGroup(movedIds: Set<string>, nodes: CanvasNodeData[], group: CanvasNodeData) {
    const movingNodes = nodes.filter((node) => movedIds.has(node.id) && node.type !== CanvasNodeType.Group);
    if (!movingNodes.length) return nodes;
    const pad = 24;
    const bounds = nodeBounds(movingNodes);
    const left = group.position.x + pad;
    const top = group.position.y + pad;
    const right = group.position.x + group.width - pad;
    const bottom = group.position.y + group.height - pad;
    const dx = bounds.right - bounds.left > right - left ? left - bounds.left : bounds.left < left ? left - bounds.left : bounds.right > right ? right - bounds.right : 0;
    const dy = bounds.bottom - bounds.top > bottom - top ? top - bounds.top : bounds.top < top ? top - bounds.top : bounds.bottom > bottom ? bottom - bounds.bottom : 0;
    return nodes.map((node) => {
        if (!movedIds.has(node.id) || node.type === CanvasNodeType.Group) return node;
        return { ...node, position: { x: node.position.x + dx, y: node.position.y + dy }, metadata: { ...node.metadata, groupId: group.id } };
    });
}

export const GROUP_WRAP_PADDING = 24;
export const GROUP_WRAP_TOP_PADDING = 52;

function selectedGroupIds(selectedIds: Set<string>, nodes: CanvasNodeData[]) {
    return new Set(nodes.filter((node) => selectedIds.has(node.id) && node.type === CanvasNodeType.Group).map((node) => node.id));
}

export function collectGroupMemberNodes(selectedIds: Set<string>, nodes: CanvasNodeData[]) {
    const groups = selectedGroupIds(selectedIds, nodes);
    return nodes.filter((node) => node.type !== CanvasNodeType.Group && (selectedIds.has(node.id) || (node.metadata?.groupId != null && groups.has(node.metadata.groupId))));
}

export function getGroupWrapRect(members: CanvasNodeData[]) {
    const bounds = nodeBounds(members);
    return {
        x: bounds.left - GROUP_WRAP_PADDING,
        y: bounds.top - GROUP_WRAP_TOP_PADDING,
        width: bounds.right - bounds.left + GROUP_WRAP_PADDING * 2,
        height: bounds.bottom - bounds.top + GROUP_WRAP_TOP_PADDING + GROUP_WRAP_PADDING,
    };
}

/** 组框比成员范围多留的余量，用来判断「要不要重算」——小于这个值不值得动。 */
const GROUP_REFIT_EPSILON = 6;

/**
 * 让每个组框重新包住它当前的成员。
 *
 * 成组那一刻的尺寸是算准的，但之后成员会被拖动、缩放、删除、或者从外面拖进组里，
 * 组框就慢慢对不上了 —— 要么成员露到框外，要么框里空出一大块。
 * 这里在节点列表变化时统一收口：谁有成员就按成员重新算，没有成员的组保持原样
 * （空组仍可当占位框用）。尺寸变化小于 EPSILON 时不改，避免每帧都产生新对象
 * 把这些节点推去重渲染。
 *
 * 返回原数组引用（没有组需要调整时），调用方据此判断要不要 setState。
 */
export function refitGroupWraps(nodes: CanvasNodeData[]): CanvasNodeData[] {
    const membersByGroup = new Map<string, CanvasNodeData[]>();
    for (const node of nodes) {
        if (node.type === CanvasNodeType.Group) continue;
        const groupId = node.metadata?.groupId;
        if (!groupId) continue;
        const list = membersByGroup.get(groupId);
        if (list) list.push(node);
        else membersByGroup.set(groupId, [node]);
    }
    if (membersByGroup.size === 0) return nodes;

    let changed = false;
    const next = nodes.map((node) => {
        if (node.type !== CanvasNodeType.Group) return node;
        const members = membersByGroup.get(node.id);
        if (!members?.length) return node;
        const rect = getGroupWrapRect(members);
        if (
            Math.abs(rect.x - node.position.x) < GROUP_REFIT_EPSILON &&
            Math.abs(rect.y - node.position.y) < GROUP_REFIT_EPSILON &&
            Math.abs(rect.width - node.width) < GROUP_REFIT_EPSILON &&
            Math.abs(rect.height - node.height) < GROUP_REFIT_EPSILON
        ) {
            return node;
        }
        changed = true;
        return { ...node, position: { x: rect.x, y: rect.y }, width: rect.width, height: rect.height };
    });
    return changed ? next : nodes;
}

export function canGroupSelectedNodes(selectedIds: Set<string>, nodes: CanvasNodeData[]) {
    const members = collectGroupMemberNodes(selectedIds, nodes);
    if (members.length < 2) return false;
    const groupId = members[0].metadata?.groupId;
    return !groupId || members.some((node) => node.metadata?.groupId !== groupId);
}

export function canUngroupSelectedNodes(selectedIds: Set<string>, nodes: CanvasNodeData[]) {
    return nodes.some((node) => selectedIds.has(node.id) && (node.type === CanvasNodeType.Group || Boolean(node.metadata?.groupId)));
}

function emptyGroupIds(nodes: CanvasNodeData[], keepId?: string) {
    const used = new Set(nodes.flatMap((node) => (node.type !== CanvasNodeType.Group && node.metadata?.groupId ? [node.metadata.groupId] : [])));
    return new Set(nodes.filter((node) => node.type === CanvasNodeType.Group && node.id !== keepId && !used.has(node.id)).map((node) => node.id));
}

function withoutRemoved(nodes: CanvasNodeData[], connections: CanvasConnection[], removedIds: Set<string>) {
    return {
        nodes: nodes.filter((node) => !removedIds.has(node.id)),
        connections: connections.filter((connection) => !removedIds.has(connection.fromNodeId) && !removedIds.has(connection.toNodeId)),
    };
}

export function applyGroupSelection(selectedIds: Set<string>, nodes: CanvasNodeData[], connections: CanvasConnection[], group: CanvasNodeData) {
    const members = collectGroupMemberNodes(selectedIds, nodes);
    if (members.length < 2) return null;
    const memberIds = new Set(members.map((node) => node.id));
    const flattenedGroupIds = selectedGroupIds(selectedIds, nodes);
    // 归属写在顶层 parentId（结构关系），metadata.groupId 仅作为老数据的兼容副本一起写。
    const updated = nodes
        .filter((node) => !flattenedGroupIds.has(node.id))
        .map((node) => (memberIds.has(node.id) ? { ...node, parentId: group.id, metadata: { ...node.metadata, groupId: group.id } } : node));
    const insertAt = updated.findIndex((node) => memberIds.has(node.id));
    const withGroup = insertAt < 0 ? [...updated, group] : [...updated.slice(0, insertAt), group, ...updated.slice(insertAt)];
    const next = withoutRemoved(withGroup, connections, new Set([...flattenedGroupIds, ...emptyGroupIds(withGroup, group.id)]));
    return { ...next, selectedIds: [group.id] };
}

export function applyUngroupSelection(selectedIds: Set<string>, nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    const flattenedGroupIds = selectedGroupIds(selectedIds, nodes);
    if (!flattenedGroupIds.size && !nodes.some((node) => selectedIds.has(node.id) && node.metadata?.groupId)) return null;
    const releasedIds = new Set<string>();
    const updated = nodes
        .filter((node) => !flattenedGroupIds.has(node.id))
        .map((node) => {
            const groupId = node.metadata?.groupId;
            if (!groupId) return node;
            if (!flattenedGroupIds.has(groupId) && !selectedIds.has(node.id)) return node;
            releasedIds.add(node.id);
            return { ...node, metadata: { ...node.metadata, groupId: undefined } };
        });
    const next = withoutRemoved(updated, connections, new Set([...flattenedGroupIds, ...emptyGroupIds(updated)]));
    return { ...next, selectedIds: next.nodes.filter((node) => selectedIds.has(node.id) || releasedIds.has(node.id)).map((node) => node.id) };
}

export function findContainingGroupId(node: CanvasNodeData, nodes: CanvasNodeData[]) {
    // Called once per moved node when a drag ends, so avoid copying the node list each time.
    for (let index = nodes.length - 1; index >= 0; index -= 1) {
        const group = nodes[index];
        if (group.type === CanvasNodeType.Group && group.id !== node.id && containsCenter(group, node)) return group.id;
    }
    return undefined;
}

export function getConnectionTargetAnchor(node: CanvasNodeData, current: ConnectionHandle) {
    return {
        x: current.handleType === "source" ? node.position.x : node.position.x + node.width,
        y: node.position.y + node.height / 2,
    };
}

export function normalizeConnection(firstNodeId: string, secondNodeId: string, nodes: CanvasNodeData[], firstHandleType: "source" | "target") {
    const first = nodes.find((node) => node.id === firstNodeId);
    const second = nodes.find((node) => node.id === secondNodeId);
    if (!first || !second || first.id === second.id) return null;
    if (second.type === CanvasNodeType.Group) return null;
    if (first.type === CanvasNodeType.Config && second.type === CanvasNodeType.Config) return null;
    if (second.type === CanvasNodeType.Config) return { fromNodeId: first.id, toNodeId: second.id };
    if (first.type === CanvasNodeType.Config && firstHandleType === "target") return { fromNodeId: second.id, toNodeId: first.id };
    if (first.type === CanvasNodeType.Config) return { fromNodeId: first.id, toNodeId: second.id };
    return { fromNodeId: first.id, toNodeId: second.id };
}

export type FocusFrame = {
    // Screen-space room taken above/below the node by open overlays (hover toolbar, prompt panel), gaps included.
    above?: number;
    below?: number;
    // Fixed chrome covering the bottom edge of the canvas (dock), excluded from the usable area.
    bottomInset?: number;
};

// Viewport that centers the node (plus any open overlay above/below) in the usable canvas area, zoomed so the
// whole thing fits (the node itself is kept within 60% of the viewport). When an overlay is open below the node,
// the remaining space is split 3:1 so the panel sits closer to the bottom dock (half the usual bottom gap).
export function focusViewportForNode(node: Pick<CanvasNodeData, "position" | "width" | "height">, size: { width: number; height: number }, frame: FocusFrame = {}): ViewportTransform {
    const above = frame.above ?? 0;
    const below = frame.below ?? 0;
    const usableBottom = Math.max(0, size.height - (frame.bottomInset ?? 0));
    const nodeCenterX = node.position.x + node.width / 2;
    const nodeCenterY = node.position.y + node.height / 2;
    const verticalRoom = usableBottom * 0.92 - above - below;
    const k = Math.min(Math.max(Math.min((size.width * 0.6) / node.width, (size.height * 0.6) / node.height, verticalRoom / node.height), 0.05), 1);
    const groupHeight = above + node.height * k + below;
    const slack = usableBottom - groupHeight;
    const groupTop = slack * (below > 0 && slack > 0 ? 0.75 : 0.5);
    return { x: size.width / 2 - nodeCenterX * k, y: groupTop + groupHeight / 2 - nodeCenterY * k - (below - above) / 2, k };
}
