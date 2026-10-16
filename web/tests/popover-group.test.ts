import { expect, test } from "bun:test";
import { nextPopoverId } from "../src/components/ui/popover-group";

test("opening another popup replaces the current one", () => {
    let active = nextPopoverId(null, "size", true);
    expect(active).toBe("size");
    active = nextPopoverId(active, "model", true);
    expect(active).toBe("model");
});

test("a late outside-close event cannot close the next popup", () => {
    expect(nextPopoverId("model", "size", false)).toBe("model");
    expect(nextPopoverId("quality", "model", false)).toBe("quality");
});

test("closing the active popup clears the group", () => {
    expect(nextPopoverId("size", "size", false)).toBeNull();
    expect(nextPopoverId(null, "size", false)).toBeNull();
});

test("opening the same popup twice is idempotent", () => {
    expect(nextPopoverId("size", "size", true)).toBe("size");
});
