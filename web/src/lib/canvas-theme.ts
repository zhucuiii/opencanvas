export type CanvasColorTheme = "light" | "dark";
export type CanvasBackgroundMode = "dots" | "lines" | "blank";

export const canvasThemes = {
    light: {
        canvas: {
            background: "#f4f4f5",
            dot: "rgba(63,63,70,.28)",
            line: "rgba(63,63,70,.12)",
            selectionStroke: "#19191b",
            selectionFill: "rgba(25,25,27,.06)",
        },
        connection: {
            flow: "#2f7ff6",
        },
        node: {
            label: "#52525b",
            fill: "#e4e4e7",
            panel: "#fafafa",
            stroke: "#d4d4d8",
            activeStroke: "#19191b",
            placeholder: "#a1a1aa",
            text: "#2b2b2d",
            muted: "#71717a",
            faint: "#a1a1aa",
            shadowDark: "rgba(113,113,122,.42)",
            shadowLight: "rgba(255,255,255,.9)",
        },
        toolbar: {
            panel: "rgba(250,250,250,.96)",
            border: "#d4d4d8",
            item: "#52525b",
            itemHover: "#e4e4e7",
            activeBg: "#e4e4e7",
            activeText: "#2b2b2d",
        },
    },
    dark: {
        canvas: {
            background: "#000000",
            dot: "rgba(245,245,245,.42)",
            line: "rgba(245,245,245,.14)",
            selectionStroke: "#fafafa",
            selectionFill: "rgba(250,250,250,.10)",
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