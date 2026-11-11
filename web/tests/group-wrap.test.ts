import { expect, test } from "bun:test";
import { GROUP_WRAP_PADDING, GROUP_WRAP_TOP_PADDING, getGroupWrapRect, refitGroupWraps } from "../src/lib/canvas/canvas-node-geometry";
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

const group = (id: string, x: number, y: number, w: number, h: number): CanvasNodeData => ({
    id,
    type: CanvasNodeType.Group,
    title: id,
    position: { x, y },
    width: w,
    height: h,
    metadata: { status: "idle" },
});

const member = (node: CanvasNodeData, groupId: string): CanvasNodeData => ({
    ...node,
    metadata: { ...node.metadata, groupId },
});

test("组框按成员范围加内边距包住全部成员", () => {
    const members = [img("a", 100, 100), img("b", 100, 500)];
    const rect = getGroupWrapRect(members);

    expect(rect.x).toBe(100 - GROUP_WRAP_PADDING);
    expect(rect.y).toBe(100 - GROUP_WRAP_TOP_PADDING);
    // 两个 260 宽、左对齐的成员 → 宽 = 260 + 两侧 padding
    expect(rect.width).toBe(260 + GROUP_WRAP_PADDING * 2);
    // 纵向跨度 = 从 100 到 760 → 660，再加顶部与底部 padding
    expect(rect.height).toBe(660 + GROUP_WRAP_TOP_PADDING + GROUP_WRAP_PADDING);
});

test("成员被拖远后，组框跟着长大", () => {
    const nodes = [
        member(img("a", 100, 100), "g"),
        member(img("b", 100, 500), "g"),
        group("g", 76, 48, 308, 736),
    ];
    // 把 b 挪到 1500，组框本该包不住
    const moved = nodes.map((n) => (n.id === "b" ? { ...n, position: { x: 100, y: 1500 } } : n));
    const refit = refitGroupWraps(moved);
    const g = refit.find((n) => n.id === "g")!;
    const members = refit.filter((n) => n.metadata?.groupId === "g");

    expect(refit).not.toBe(moved); // 真的改了
    expect(g.height).toBeGreaterThan(736);
    // 底部仍要盖住最下面的成员
    expect(g.position.y + g.height).toBeGreaterThanOrEqual(1500 + 260 + GROUP_WRAP_PADDING - 1);
});

test("已经包好的组不会被改动（返回同一个数组引用）", () => {
    const members = [member(img("a", 100, 100), "g"), member(img("b", 100, 500), "g")];
    const rect = getGroupWrapRect(members);
    const nodes = [...members, group("g", rect.x, rect.y, rect.width, rect.height)];

    expect(refitGroupWraps(nodes)).toBe(nodes);
});

test("空组保持原样，不会塌成 0 尺寸", () => {
    const nodes = [group("empty", 100, 100, 400, 300)];
    expect(refitGroupWraps(nodes)).toBe(nodes);
    const g = refitGroupWraps(nodes)[0];
    expect(g.width).toBe(400);
    expect(g.height).toBe(300);
});

test("删除成员后组框收缩", () => {
    const nodes = [
        member(img("a", 100, 100), "g"),
        member(img("b", 100, 1500), "g"),
        group("g", 76, 48, 308, 1736),
    ];
    // 删掉下面那个
    const afterDelete = nodes.filter((n) => n.id !== "b");
    const refit = refitGroupWraps(afterDelete);
    const g = refit.find((n) => n.id === "g")!;
    expect(g.height).toBeLessThan(1736);
    expect(g.height).toBe(260 + GROUP_WRAP_TOP_PADDING + GROUP_WRAP_PADDING);
});

test("多个组各自独立重算，互不影响", () => {
    const nodes = [
        member(img("a", 100, 100), "g1"),
        member(img("b", 100, 900), "g1"),
        member(img("c", 900, 100), "g2"),
        member(img("d", 900, 500), "g2"),
        group("g1", 76, 48, 308, 1136),
        group("g2", 876, 48, 308, 736),
    ];
    const refit = refitGroupWraps(nodes);
    const g1 = refit.find((n) => n.id === "g1")!;
    const g2 = refit.find((n) => n.id === "g2")!;

    // g1 现在刚好包住 a(100..360) 与 b(100..1160)，不需要动
    expect(g1.height).toBe(1136);
    // g2 已经包住 c/d，也不需要动
    expect(g2.height).toBe(736);
    expect(refit).toBe(nodes);
});

test("没有归属的节点不参与任何组框计算", () => {
    const nodes = [img("loose", 2000, 2000), group("g", 100, 100, 400, 300)];
    expect(refitGroupWraps(nodes)).toBe(nodes);
});
