import { expect, test } from "bun:test";

import {
    FRAME_HEADER_HEIGHT,
    FRAME_PADDING,
    applyFrameDrop,
    canFrameContain,
    expandFrameToFit,
    findFrameDropTarget,
    frameContentBounds,
    getFrameChildren,
    getFrameWrapRect,
    isFrameCollapsed,
    normalizeFrameParents,
} from "../src/lib/canvas/canvas-frame";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

const img = (id: string, x: number, y: number, w = 260, h = 260): CanvasNodeData => ({
    id,
    type: CanvasNodeType.Image,
    title: id,
    position: { x, y },
    width: w,
    height: h,
    metadata: { content: "", status: "idle" },
});

const frame = (id: string, x: number, y: number, w: number, h: number, extra: Partial<CanvasNodeData> = {}): CanvasNodeData => ({
    id,
    type: CanvasNodeType.Group,
    title: id,
    position: { x, y },
    width: w,
    height: h,
    metadata: { status: "idle" },
    ...extra,
});

const withParent = (node: CanvasNodeData, parentId: string): CanvasNodeData => ({ ...node, parentId });

test("组的成员通过顶层 parentId 归属", () => {
    const nodes = [frame("g", 0, 0, 600, 600), withParent(img("a", 40, 80), "g"), img("b", 900, 900)];
    expect(getFrameChildren("g", nodes).map((n) => n.id)).toEqual(["a"]);
});

test("旧数据的 metadata.groupId 仍然能读到成员", () => {
    const legacy: CanvasNodeData = { ...img("a", 40, 80), metadata: { content: "", status: "idle", groupId: "g" } };
    const nodes = [frame("g", 0, 0, 600, 600), legacy];
    expect(getFrameChildren("g", nodes).map((n) => n.id)).toEqual(["a"]);
});

test("normalizeFrameParents 把旧字段提升为 parentId", () => {
    const legacy: CanvasNodeData = { ...img("a", 40, 80), metadata: { content: "", status: "idle", groupId: "g" } };
    const [normalized] = normalizeFrameParents([legacy]);
    expect(normalized.parentId).toBe("g");
    // 已经是新字段时不产生新对象
    const fresh = withParent(img("b", 0, 0), "g");
    expect(normalizeFrameParents([fresh])[0]).toBe(fresh);
});

test("组框尺寸 = 成员范围 + 顶部 header + 四周 padding", () => {
    const members = [img("a", 100, 100), img("b", 100, 500)];
    const rect = getFrameWrapRect(members)!;
    expect(rect.x).toBe(100 - FRAME_PADDING);
    expect(rect.y).toBe(100 - FRAME_HEADER_HEIGHT - FRAME_PADDING);
    expect(rect.width).toBe(260 + FRAME_PADDING * 2);
    expect(rect.height).toBe(660 + FRAME_HEADER_HEIGHT + FRAME_PADDING * 2);
});

test("拖入判定用中心点，且顶部要让开 header 高度", () => {
    const g = frame("g", 0, 0, 600, 600);
    // 中心落在 header 区域（y < 36）→ 不算进
    const onHeader = img("a", 100, -200); // 中心 y = -70
    expect(findFrameDropTarget([onHeader], [g], new Set(["a"]))).toBeNull();

    // 中心落在内容区 → 算进
    const inside = img("b", 100, 100); // 中心 y = 230
    expect(findFrameDropTarget([inside], [g], new Set(["b"]))?.id).toBe("g");
});

test("已经折叠的组不接受拖入", () => {
    const g = frame("g", 0, 0, 600, 600, { metadata: { status: "idle", collapsed: true } });
    expect(isFrameCollapsed(g)).toBe(true);
    expect(findFrameDropTarget([img("a", 100, 100)], [g], new Set(["a"]))).toBeNull();
});

test("拖进组后 parentId 被写入，组框扩到包住成员", () => {
    const g = frame("g", 0, 0, 300, 300);
    const a = img("a", 40, 80);
    const next = applyFrameDrop([g, a], new Set(["a"]), "g");
    const dropped = next.find((n) => n.id === "a")!;
    const expanded = next.find((n) => n.id === "g")!;

    expect(dropped.parentId).toBe("g");
    // 组框至少要包住 a 的右边缘 + padding
    expect(expanded.position.x + expanded.width).toBeGreaterThanOrEqual(40 + 260 + FRAME_PADDING - 1);
});

test("拖到空白处会脱离原组", () => {
    const g = frame("g", 0, 0, 600, 600);
    const a = withParent(img("a", 100, 100), "g");
    const next = applyFrameDrop([g, a], new Set(["a"]), null);
    expect(next.find((n) => n.id === "a")!.parentId).toBeUndefined();
});

test("组框只扩不缩（除非显式 shrink）", () => {
    const g = frame("g", 0, 0, 2000, 2000);
    const a = withParent(img("a", 100, 100), "g");
    // 默认不缩：2000 的大框保持
    expect(expandFrameToFit([g, a], "g").find((n) => n.id === "g")!.width).toBe(2000);
    // 显式 shrink 才收到刚好包住
    const shrunk = expandFrameToFit([g, a], "g", true).find((n) => n.id === "g")!;
    expect(shrunk.width).toBe(260 + FRAME_PADDING * 2);
});

test("只有内容节点能进组，组和配置节点不行", () => {
    expect(canFrameContain(img("a", 0, 0))).toBe(true);
    expect(canFrameContain({ ...img("a", 0, 0), type: CanvasNodeType.Text })).toBe(true);
    expect(canFrameContain(frame("g", 0, 0, 100, 100))).toBe(false);
    expect(canFrameContain({ ...img("a", 0, 0), type: CanvasNodeType.Config })).toBe(false);
});

test("空组的边界是 null，不会算出 0 尺寸的框", () => {
    expect(frameContentBounds([])).toBeNull();
    expect(getFrameWrapRect([])).toBeNull();
});

test("尺寸变化很小的时候不产生新对象（避免多余重渲染）", () => {
    // 按成员算出来的目标框正好是 (0,0,308,568)，和现有值一致 → 应当返回原数组
    const a = withParent(img("a", 24, 36 + FRAME_PADDING), "g");
    const members = [a];
    const wanted = getFrameWrapRect(members)!;
    const g = frame("g", wanted.x, wanted.y, wanted.width, wanted.height);
    const nodes = [g, a];

    expect(expandFrameToFit(nodes, "g")).toBe(nodes);
});
