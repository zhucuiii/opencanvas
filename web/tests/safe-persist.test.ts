import { beforeEach, describe, expect, test } from "bun:test";
import { parsePersistedState } from "../src/lib/safe-persist";

/** 最小的 localStorage 替身：safe-persist 只用 setItem 存坏数据备份。 */
function installFakeLocalStorage() {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, "window", {
        value: {
            localStorage: {
                setItem: (key: string, value: string) => store.set(key, value),
                getItem: (key: string) => store.get(key) ?? null,
            },
        },
        configurable: true,
        writable: true,
    });
    return store;
}

describe("parsePersistedState", () => {
    let backupStore: Map<string, string>;

    beforeEach(() => {
        backupStore = installFakeLocalStorage();
    });

    test("正常的 persist 存档原样返回", () => {
        const raw = JSON.stringify({ state: { projects: [] }, version: 1 });
        const parsed = parsePersistedState(raw, "test:corrupt");
        expect(parsed).not.toBeNull();
        expect(parsed?.state).toEqual({ projects: [] });
    });

    test("半截 JSON 不会抛错，按空存档处理", () => {
        // 写入时断电 / 多标签页并发写留下的截断存档
        const raw = '{"state":{"projects":[{"id":"a"';
        expect(() => parsePersistedState(raw, "test:corrupt")).not.toThrow();
        expect(parsePersistedState(raw, "test:corrupt")).toBeNull();
    });

    test("结构不对（没有 state 字段）同样按空存档处理", () => {
        expect(parsePersistedState(JSON.stringify({ projects: [] }), "test:corrupt")).toBeNull();
        expect(parsePersistedState(JSON.stringify(null), "test:corrupt")).toBeNull();
        expect(parsePersistedState(JSON.stringify([1, 2, 3]), "test:corrupt")).toBeNull();
    });

    test("坏数据被备份到 localStorage，便于事后排查", () => {
        const raw = "{oops";
        parsePersistedState(raw, "test:corrupt");
        expect(backupStore.get("test:corrupt")).toBe(raw);
    });

    test("备份失败不影响恢复（配额满等）", () => {
        Object.defineProperty(globalThis, "window", {
            value: {
                localStorage: {
                    setItem: () => {
                        throw new Error("QuotaExceededError");
                    },
                },
            },
            configurable: true,
            writable: true,
        });
        expect(() => parsePersistedState("{bad", "test:corrupt")).not.toThrow();
        expect(parsePersistedState("{bad", "test:corrupt")).toBeNull();
    });
});
