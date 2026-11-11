import type { StorageValue } from "zustand/middleware";

/**
 * 读取 zustand persist 存档时的安全解析。
 *
 * 存档来自 localforage / localStorage，属于「用户机器上随时可能被改坏或写坏」的数据：
 * 换版本、手动清缓存、写入时断电、多个标签页同时写，都可能留下半截 JSON。
 * 原先 getItem 里直接 `JSON.parse`，一旦抛错：
 *   1. 错误冒泡到 zustand 的 rehydrate，
 *   2. `onRehydrateStorage` 的完成回调不执行，
 *   3. store 的 `hydrated` 永远是 false，
 *   4. 画布页 `if (!hydrated) return` 一直拦住，界面永久停在「打开中」。
 * 用户看到的现象就是「画布打不开」，而且刷新也没用 —— 坏数据还在。
 *
 * 这里把损坏的存档当作「没有存档」处理：返回 null，让 store 用初始状态起来，
 * 至少界面能进去、用户能重新建画布。同时把坏数据留一份到
 * `localStorage` 的备份键里，方便事后排查（localforage 那边不再覆盖它）。
 */
export function parsePersistedState<T>(raw: string, backupKey: string): StorageValue<T> | null {
    try {
        const parsed = JSON.parse(raw) as unknown;
        // 结构校验：persist 的存档必须是 { state: ... }，否则下游解构会炸。
        if (!parsed || typeof parsed !== "object" || !("state" in parsed)) {
            throw new Error("persist payload is missing the state field");
        }
        return parsed as StorageValue<T>;
    } catch (error) {
        try {
            // 备份坏数据（覆盖上一次备份即可，不做无限堆积）。
            window.localStorage.setItem(backupKey, raw);
        } catch {
            // 备份失败（比如配额满）不该影响恢复流程。
        }
        console.error(`[persist] 存档损坏，已按空状态恢复：${backupKey}`, error);
        return null;
    }
}
