export type CanvasColorTheme = "light" | "dark";
export type CanvasBackgroundMode = "dots" | "lines" | "blank";

export const DEFAULT_CANVAS_COLOR_THEME: CanvasColorTheme = "dark";

/** 连线基础描边宽（px，屏幕坐标：配合 vectorEffect="non-scaling-stroke" 不随画布缩放变粗）。 */
export const CANVAS_CONNECTION_STROKE_WIDTH = 1.4;

/**
 * 画布调色板（对齐上游 open-ai-canvas 的深浅配色）。
 * light / dark 两套完整语义色：画布底与网格、连线、节点、框选、工具条、浮层、强调色。
 */
export const canvasThemes = {
    light: {
        connection: {
            flow: "#2f7ff6",
            stroke: "#a3a3a3",
            beam: "#404040",
        },
        canvas: {
            background: "#f0f0f0",
            dot: "rgba(0,0,0,.80)",
            line: "rgba(0,0,0,.80)",
            selectionStroke: "#171717",
            selectionFill: "rgba(17,17,17,.10)",
        },
        node: {
            label: "#4b5563",
            fill: "#ffffff",
            panel: "#ffffff",
            stroke: "#e2e4e8",
            edge: "rgba(15,23,42,.16)",
            shadow: "0 6px 18px rgba(15,23,42,.08)",
            hoverShadow: "0 10px 24px rgba(15,23,42,.12)",
            activeStroke: "#111827",
            placeholder: "#9ca3af",
            text: "#111827",
            muted: "#6b7280",
            faint: "#9ca3af",
            shadowDark: "rgba(15,23,42,.16)",
            shadowLight: "rgba(255,255,255,.9)",
        },
        frame: {
            fill: "rgba(17,24,39,.025)",
            stroke: "rgba(17,24,39,.18)",
            activeFill: "rgba(17,17,17,.05)",
            activeStroke: "#171717",
            preview: "rgba(255,255,255,.82)",
        },
        toolbar: {
            panel: "rgba(255,255,255,.94)",
            border: "rgba(17,24,39,.10)",
            item: "#4b5563",
            itemHover: "rgba(17,24,39,.06)",
            activeBg: "rgba(17,24,39,.10)",
            activeText: "#111827",
        },
        spatial: {
            surface: "rgba(255,255,255,.72)",
            elevated: "rgba(255,255,255,.94)",
            dropzone: "rgba(248,250,252,.78)",
            glow: "rgba(17,17,17,.14)",
            glowStrong: "rgba(17,17,17,.42)",
            shadow: "rgba(15,23,42,.18)",
        },
        accent: {
            primary: "#171717",
            primarySoft: "rgba(17,17,17,.10)",
            onPrimary: "#ffffff",
            danger: "#f87171",
        },
    },
    dark: {
        connection: {
            flow: "#5aa2ff",
            stroke: "#737373",
            beam: "#e5e5e5",
        },
        canvas: {
            background: "#000000",
            dot: "rgba(255,255,255,.32)",
            line: "rgba(255,255,255,.32)",
            selectionStroke: "#f5f5f5",
            selectionFill: "rgba(255,255,255,.12)",
        },
        node: {
            label: "#a3a3a3",
            fill: "#181818",
            panel: "#141414",
            stroke: "rgba(255,255,255,.12)",
            edge: "rgba(255,255,255,.18)",
            shadow: "0 8px 24px rgba(0,0,0,.34)",
            hoverShadow: "0 12px 30px rgba(0,0,0,.46)",
            activeStroke: "#f1f1f1",
            placeholder: "#737373",
            text: "#ededed",
            muted: "#a3a3a3",
            faint: "#666666",
            shadowDark: "rgba(0,0,0,.5)",
            shadowLight: "rgba(255,255,255,.06)",
        },
        frame: {
            // 组框：只留一个非常淡的填充 + 低透明度描边，靠"包住"这件事本身表达归属，
            // 不靠粗边框抢注意力（参考 canvas-theme.ts 的 frame 段）。
            fill: "rgba(255,255,255,.025)",
            stroke: "rgba(190,198,210,.14)",
            activeFill: "rgba(255,255,255,.07)",
            activeStroke: "#f5f5f5",
            preview: "rgba(20,20,20,.94)",
        },
        toolbar: {
            // 影策的浮层更透气：面板不要接近不透明，留一点背景透上来才有"浮"的感觉。
            panel: "rgba(20,20,20,.82)",
            border: "rgba(255,255,255,.08)",
            item: "#d4d4d4",
            itemHover: "rgba(255,255,255,.07)",
            activeBg: "rgba(255,255,255,.10)",
            activeText: "#f5f6f8",
        },
        spatial: {
            surface: "rgba(22,22,22,.82)",
            elevated: "rgba(15,15,15,.97)",
            dropzone: "rgba(8,8,8,.9)",
            glow: "rgba(255,255,255,.12)",
            glowStrong: "rgba(255,255,255,.36)",
            shadow: "rgba(0,0,0,.6)",
        },
        accent: {
            primary: "#f5f5f5",
            primarySoft: "rgba(255,255,255,.11)",
            onPrimary: "#131313",
            danger: "#fb7185",
        },
    },
} as const;

export type CanvasTheme = (typeof canvasThemes)[CanvasColorTheme];
