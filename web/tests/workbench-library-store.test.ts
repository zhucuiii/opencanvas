import { afterAll, expect, test } from "bun:test";

const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
const values = new Map<string, string>([["infinite-canvas:image_favorites", JSON.stringify(["legacy-image"])]]);
Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
    },
});
const { useWorkbenchLibraryStore: store } = await import("../src/stores/use-workbench-library-store");
afterAll(() => {
    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
    else Reflect.deleteProperty(globalThis, "localStorage");
});
const reset = () => store.setState({ favoriteIds: [], folders: [], imageFolders: {} });

test("previously saved favorites are available before any library edits", () => {
    expect(store.getState().favoriteIds).toEqual(["legacy-image"]);
});

test("creating a folder can assign an image and reuses an existing name", () => {
    reset();
    const first = store.getState().createFolder(" Travel ", "one")!;
    const duplicate = store.getState().createFolder("travel", "two");
    expect(duplicate).toBe(first);
    expect(store.getState().folders).toHaveLength(1);
    expect(store.getState().imageFolders).toEqual({ one: [first], two: [first] });
    expect(store.getState().createFolder("   ")).toBeUndefined();
});

test("rename validates names and leaves assignments intact", () => {
    reset();
    const first = store.getState().createFolder("A", "one")!;
    store.getState().createFolder("B");
    expect(store.getState().renameFolder(first, "b")).toBe(false);
    expect(store.getState().renameFolder(first, " ")).toBe(false);
    expect(store.getState().renameFolder(first, "New name")).toBe(true);
    expect(store.getState().imageFolders.one).toEqual([first]);
});

test("folder removal preserves image favorites and unrelated folders", () => {
    reset();
    const first = store.getState().createFolder("A", "one")!;
    const second = store.getState().createFolder("B", "one")!;
    store.getState().toggleFavorite("one");
    store.getState().setImageFolder("one", "missing", true);
    store.getState().removeFolder(first);
    expect(store.getState().favoriteIds).toEqual(["one"]);
    expect(store.getState().imageFolders.one).toEqual([second]);
    expect(store.getState().folders.map((folder) => folder.id)).toEqual([second]);
});

test("folder metadata, assignments and favorites survive rehydration", async () => {
    reset();
    const folder = store.getState().createFolder("Saved", "one")!;
    store.getState().toggleFavorite("one");
    const persisted = values.get("infinite-canvas:image_library")!;
    reset();
    values.set("infinite-canvas:image_library", persisted);
    await store.persist.rehydrate();
    expect(store.getState().favoriteIds).toEqual(["one"]);
    expect(store.getState().folders[0].name).toBe("Saved");
    expect(store.getState().imageFolders.one).toEqual([folder]);
    expect(typeof store.getState().renameFolder).toBe("function");
});
