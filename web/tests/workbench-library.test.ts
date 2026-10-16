import { expect, test } from "bun:test";
import { normalizeFolderName, normalizeWorkbenchLibrary, removeLibraryFolder, toggleLibraryId } from "../src/lib/workbench-library";

test("folder names are trimmed, normalized and limited", () => {
    expect(normalizeFolderName("  My   folder \n ")).toBe("My folder");
    expect(normalizeFolderName("x".repeat(50))).toHaveLength(40);
    expect(normalizeFolderName("   ")).toBe("");
});

test("favorites and folder assignments toggle without duplicates", () => {
    expect(toggleLibraryId(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleLibraryId(["a"], "a")).toEqual([]);
    expect(toggleLibraryId(["a"], "a", true)).toEqual(["a"]);
});

test("library hydration rejects malformed folders and dangling assignments", () => {
    const data = normalizeWorkbenchLibrary({ favoriteIds: ["one", "one", null], folders: [null, { id: "a", name: " Trip " }, { id: "a", name: "Duplicate" }, { id: "b", name: " " }], imageFolders: { one: ["a", "missing", "a"], two: "invalid" } });
    expect(data.favoriteIds).toEqual(["one"]);
    expect(data.folders.map((folder) => folder.name)).toEqual(["Trip"]);
    expect(data.imageFolders).toEqual({ one: ["a"] });
    expect(normalizeWorkbenchLibrary(null)).toEqual({ favoriteIds: [], folders: [], imageFolders: {} });
});

test("removing a folder preserves favorites and other image assignments", () => {
    const data = normalizeWorkbenchLibrary({
        favoriteIds: ["one"],
        folders: [
            { id: "a", name: "A" },
            { id: "b", name: "B" },
        ],
        imageFolders: { one: ["a", "b"], two: ["a"] },
    });
    const next = removeLibraryFolder(data, "a");
    expect(next.favoriteIds).toEqual(["one"]);
    expect(next.folders.map((folder) => folder.id)).toEqual(["b"]);
    expect(next.imageFolders).toEqual({ one: ["b"], two: [] });
    expect(data.imageFolders.one).toEqual(["a", "b"]);
});
