import { expect, test } from "bun:test";

import { generationRecoveryCounts, markGenerationRequestCanceled, markGenerationRequestUnknown, resetInterruptedGeneration, startGenerationMetadata } from "../src/lib/canvas/canvas-generation-helpers";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

const baseNode: CanvasNodeData = {
    id: "node-1",
    type: CanvasNodeType.Image,
    title: "Image",
    position: { x: 0, y: 0 },
    width: 320,
    height: 220,
};

test("an unknown request retries with the same id; a terminal request starts fresh", () => {
    const previous = { id: "old", mode: "image" as const, status: "unknown" as const, startedAt: "2026-01-01T00:00:00.000Z", attempts: 2 };
    const next = startGenerationMetadata({ generationRequest: previous }, "image", previous);
    expect(next.generationRequest?.id).toBe("old");
    expect(next.generationRequest?.attempts).toBe(3);
    const fresh = startGenerationMetadata({ generationRequest: { ...previous, status: "canceled" } }, "image", { ...previous, status: "canceled" });
    expect(fresh.generationRequest?.id).not.toBe("old");
    expect(fresh.generationRequest?.attempts).toBe(1);
});

test("interrupted non-video work becomes unknown and can be canceled cleanly", () => {
    const running = startGenerationMetadata(baseNode.metadata, "image");
    const node: CanvasNodeData = { ...baseNode, metadata: { ...running, status: "loading" } };
    const interrupted = resetInterruptedGeneration([node])[0];
    expect(interrupted.metadata?.generationRequest?.status).toBe("unknown");
    expect(interrupted.metadata?.recovery).toBe("unknown");
    const canceled = markGenerationRequestCanceled(interrupted.metadata);
    expect(canceled.generationRequest?.status).toBe("canceled");
    expect(canceled.recovery).toBe("canceled");
});

test("unknown recovery counts ignore completed media and group roots", () => {
    const unknown = markGenerationRequestUnknown({ generationRequest: { id: "r", mode: "image", status: "running", startedAt: "2026-01-01T00:00:00.000Z", attempts: 1 } }, "lost");
    const nodes: CanvasNodeData[] = [
        { ...baseNode, metadata: unknown },
        { ...baseNode, id: "done", metadata: { ...unknown, content: "blob:done" } },
        { ...baseNode, id: "config", type: CanvasNodeType.Config, metadata: unknown },
    ];
    expect(generationRecoveryCounts(nodes)).toEqual({ resumable: 0, unknown: 1, canceled: 0 });
});
