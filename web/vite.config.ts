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
    build: {
        /**
         * 代码分割只靠路由懒加载（见 src/router.tsx），不配 manualChunks。
         *
         * 试过两种手动分组，都会把第三方库切成互相引用的循环块
         * （`vendor -> antd -> vendor`、`vendor -> react-vendor -> vendor`）：
         * antd 内部依赖 dayjs/@emotion，图标包依赖 react，硬拆只会让 rollup
         * 在块之间来回引用。按包名精确匹配能修掉一部分，但 radix 那批包
         * （@radix-ui/react-dom 等）又会把 react 拖回 vendor，治不干净。
         *
         * 交给 rollup 自动分包的结果反而更好：首屏只加载一个入口块，
         * 每个页面各自成块、进页面时才拉。实测入口 gzip 940KB → 623KB。
         */
        // 单个 chunk 超过 500kB 时 vite 默认告警。入口块含 antd + React + 外壳，
        // 天然会超；阈值调到 900 只是让真正异常的膨胀还能冒出来。
        chunkSizeWarningLimit: 900,
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
