import { expect, test } from "bun:test";
import { connectedNodePosition } from "../src/lib/canvas/canvas-node-geometry";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

const source: CanvasNodeData = { id: "source", type: CanvasNodeType.Image, title: "Image", position: { x: 100, y: 200 }, width: 420, height: 236 };
const size = { width: 420, height: 236 };

test("clicking the output handle creates a downstream node without overlap", () => {
    const next = connectedNodePosition(source, size, { x: 550, y: 318 }, "source");
    expect(next.x).toBe(640);
    expect(next.y).toBe(200);
});

test("clicking the input handle creates an upstream node without overlap", () => {
    const next = connectedNodePosition(source, size, { x: 60, y: 318 }, "target");
    expect(next.x + size.width).toBe(-20);
});

test("a distant drag keeps the requested drop position", () => {
    expect(connectedNodePosition(source, size, { x: 1500, y: 900 }, "source")).toEqual({ x: 1290, y: 782 });
    expect(connectedNodePosition(undefined, size, { x: 50, y: 50 }, "source")).toEqual({ x: -160, y: -68 });
});
