import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const webDir = dirname(fileURLToPath(import.meta.url));
const localVersion = readFileSync(resolve(webDir, "../VERSION"), "utf8").trim() || "dev";

export default defineConfig({
    base: process.env.VITE_BASE || "/",
    plugins: [react()],
    resolve: {
        alias: {
            "@": resolve(webDir, "src"),
        },
    },
    define: {
        __APP_VERSION__: JSON.stringify(localVersion),
    },
    // Windows + 中文路径下 fs.watch 会漏事件，导致 dev server 端起旧模块（改了代码页面不更新）。
    // 轮询监听牺牲一点 CPU，换来改一个字符也能稳定热更新。
    server: {
        watch: {
            usePolling: true,
            interval: 300,
        },
    },
});
