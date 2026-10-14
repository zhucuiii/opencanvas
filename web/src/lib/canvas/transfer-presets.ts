import i18n from "@/i18n";

export type TransferPreset = {
    id: string;
    /** Built-in presets cannot be deleted, but their text can be overridden and reset. */
    builtIn?: boolean;
    name: string;
    prompt: string;
};

/**
 * Built-in redraw prompts. Users may edit any of these and add their own; edits
 * live in the config store and never mutate these defaults.
 */
export const builtInTransferPresets: TransferPreset[] = [
    {
        id: "transfer-keep-composition",
        builtIn: true,
        get name() {
            return i18n.t("transferPresets.keepComposition.name");
        },
        get prompt() {
            return i18n.t("transferPresets.keepComposition.prompt");
        },
    },
    {
        id: "transfer-anime",
        builtIn: true,
        get name() {
            return i18n.t("transferPresets.anime.name");
        },
        get prompt() {
            return i18n.t("transferPresets.anime.prompt");
        },
    },
    {
        id: "transfer-illustration",
        builtIn: true,
        get name() {
            return i18n.t("transferPresets.illustration.name");
        },
        get prompt() {
            return i18n.t("transferPresets.illustration.prompt");
        },
    },
    {
        id: "transfer-sketch",
        builtIn: true,
        get name() {
            return i18n.t("transferPresets.sketch.name");
        },
        get prompt() {
            return i18n.t("transferPresets.sketch.prompt");
        },
    },
];

export type TransferPresetOverride = {
    /** Renamed presets keep their id and only store the changed fields. */
    name?: string;
    prompt?: string;
};

export type CustomTransferPreset = {
    id: string;
    name: string;
    prompt: string;
};

/** Merge built-in presets with user overrides and append user-created ones. */
export function resolveTransferPresets(overrides: Record<string, TransferPresetOverride> = {}, custom: CustomTransferPreset[] = []): TransferPreset[] {
    const builtIns = builtInTransferPresets.map((preset) => {
        const override = overrides[preset.id];
        return {
            id: preset.id,
            builtIn: true,
            name: override?.name || preset.name,
            prompt: override?.prompt ?? preset.prompt,
        };
    });
    return [...builtIns, ...custom];
}
