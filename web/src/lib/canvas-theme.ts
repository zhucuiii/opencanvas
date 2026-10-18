export type CanvasColorTheme = "light" | "dark";
export type CanvasBackgroundMode = "dots" | "lines" | "blank";

export const canvasThemes = {
    light: {
        canvas: {
            background: "#f4f2ed",
            dot: "rgba(68,64,60,.28)",
            line: "rgba(68,64,60,.12)",
            selectionStroke: "#1c1917",
            selectionFill: "rgba(28,25,23,.06)",
        },
        connection: {
            flow: "#2f7ff6",
        },
        node: {
            label: "#57534e",
            fill: "#e7e5df",
            panel: "#fbfaf7",
            stroke: "#d6d3ca",
            activeStroke: "#1c1917",
            placeholder: "#8a8479",
            text: "#292524",
            muted: "#78716c",
            faint: "#a8a29e",
            shadowDark: "rgba(120,113,108,.42)",
            shadowLight: "rgba(255,255,255,.9)",
        },
        toolbar: {
            panel: "rgba(251,250,247,.96)",
            border: "#d6d3ca",
            item: "#57534e",
            itemHover: "#e7e5df",
            activeBg: "#e7e5df",
            activeText: "#292524",
        },
    },
    dark: {
        canvas: {
            background: "#000000",
            dot: "rgba(245,245,245,.42)",
            line: "rgba(245,245,245,.14)",
            selectionStroke: "#fafaf9",
            selectionFill: "rgba(250,250,249,.10)",
        },
        connection: {
            flow: "#5aa2ff",
        },
        node: {
            label: "#d4d4d8",
            fill: "#202020",
            panel: "#202020",
            stroke: "#818181",
            activeStroke: "#2f80ff",
            placeholder: "#6b6b73",
            text: "#f5f5f5",
            muted: "#d4d4d8",
            faint: "#77777b",
            shadowDark: "rgba(0,0,0,.5)",
            shadowLight: "rgba(255,255,255,.06)",
        },
        toolbar: {
            panel: "#202020",
            border: "#303034",
            item: "#d4d4d8",
            itemHover: "#27272a",
            activeBg: "#303034",
            activeText: "#f5f5f5",
        },
    },
} as const;

export type CanvasTheme = (typeof canvasThemes)[CanvasColorTheme];
