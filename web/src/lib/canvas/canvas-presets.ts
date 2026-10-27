import rawPresets from "./canvas-presets.json";

/**
 * 画布内置预设。
 *
 * 数据来源：ddcat-ai/open-ai-canvas（影策，MIT License）
 *   backend/internal/tools/seed/tools.json → nine_grid.list
 * 原样保留其 label / desc / prompt / ratio，仅补充 category 字段用于分组展示。
 * 上游如有更新，重新从该文件导出即可，不要在这里手写改动 prompt 正文。
 */
export type BuiltinPromptPreset = {
    id: string;
    name: string;
    description: string;
    category: string;
    ratio: string;
    prompt: string;
};

export const BUILTIN_PROMPT_PRESETS = rawPresets as BuiltinPromptPreset[];

/** 展示顺序：和上游界面一致，分镜宫格在最前、画面推演在最后。 */
export const PRESET_CATEGORY_ORDER = ["分镜宫格", "设定图", "光影", "画面推演"];

/** 我自己的预设固定排在最后。 */
export const CUSTOM_PRESET_CATEGORY = "我的预设";
