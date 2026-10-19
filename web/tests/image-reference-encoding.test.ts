import { expect, test } from "bun:test";
import { canSendReferenceUrl } from "../src/lib/image-reference-encoding";

test("B64 forces public image references to be inlined", () => {
    expect(canSendReferenceUrl("https://example.com/reference.png", true)).toBe(false);
    expect(canSendReferenceUrl("https://example.com/reference.png", false)).toBe(true);
});

test("local and inline references never become remote URLs", () => {
    for (const source of ["blob:http://localhost/reference", "data:image/png;base64,abc", "javascript:alert(1)", ""]) {
        expect(canSendReferenceUrl(source, false)).toBe(false);
    }
});
