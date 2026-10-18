import { ChevronDown } from "lucide-react";
import { Dropdown } from "antd";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";

import { useExclusivePopover } from "@/components/ui/popover-group";
import type { AiConfig } from "@/stores/use-config-store";
import { WORKBENCH_PILL_CLASS, WORKBENCH_POPOVER_ALIGN, WORKBENCH_POPOVER_HEIGHT_CLASS } from "./workbench-input-pills";

const FORMAT_OPTIONS = [
    { value: "png", label: "PNG" },
    { value: "jpeg", label: "JPEG" },
    { value: "webp", label: "WebP" },
];
const TRANSPARENCY_OPTIONS = [
    { value: "false", label: "false" },
    { value: "true", label: "true" },
];
const MODERATION_OPTIONS = [
    { value: "auto", label: "auto" },
    { value: "low", label: "low" },
];

export function WorkbenchOutputOptions({ config, onChange }: { config: AiConfig; onChange: <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => void }) {
    const { t } = useTranslation();
    const format = config.imageOutputFormat || "png";
    return (
        <div className="space-y-2.5">
            <OutputOptionRow label={t("imageWorkbench.outputFormat")} value={format} options={FORMAT_OPTIONS} onChange={(next) => {
                onChange("imageOutputFormat", next as NonNullable<AiConfig["imageOutputFormat"]>);
                if (next === "jpeg") onChange("background", "");
            }} />
            <OutputOptionRow label={t("imageWorkbench.transparentBackground")} value={String(format !== "jpeg" && config.background === "transparent")} options={TRANSPARENCY_OPTIONS} disabled={format === "jpeg"} onChange={(next) => onChange("background", next === "true" ? "transparent" : "")} />
            <OutputOptionRow label={t("workbench.review")} value={config.imageModeration || "auto"} options={MODERATION_OPTIONS} onChange={(next) => onChange("imageModeration", next as "auto" | "low")} />
        </div>
    );
}

function OutputOptionRow({ label, value, options, disabled = false, onChange }: { label: string; value: string; options: { value: string; label: string }[]; disabled?: boolean; onChange: (value: string) => void }) {
    return (
        <div className="flex items-center justify-between gap-4">
            <span className={`shrink-0 text-xs ${disabled ? "text-stone-400" : "text-stone-600 dark:text-stone-300"}`}>{label}</span>
            <div className="flex gap-1 rounded-full bg-stone-100 p-1 dark:bg-white/[0.06]">
                {options.map((option) => (
                    <button
                        key={option.value}
                        type="button"
                        aria-label={`${label} ${option.label}`}
                        aria-pressed={value === option.value}
                        disabled={disabled}
                        className={`relative min-w-12 overflow-hidden rounded-full px-2.5 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${value === option.value ? "text-stone-900 dark:text-white" : "text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-white"}`}
                        onClick={() => onChange(option.value)}
                    >
                        {value === option.value ? <motion.span layoutId={`output-option-${label}`} transition={{ type: "spring", stiffness: 500, damping: 38 }} className="absolute inset-0 rounded-full bg-white shadow-sm dark:bg-[#343438]" /> : null}
                        <span className="relative z-10">{option.label}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}

export function WorkbenchOutputPills({ config, onChange }: { config: AiConfig; onChange: <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => void }) {
    const { t } = useTranslation();
    const [open, setOpen] = useExclusivePopover();
    const format = config.imageOutputFormat || "png";
    const transparent = format !== "jpeg" && config.background === "transparent";
    const moderation = config.imageModeration || "auto";

    return (
        <Dropdown
            trigger={["click"]}
            placement="topLeft"
            align={WORKBENCH_POPOVER_ALIGN}
            open={open}
            onOpenChange={setOpen}
            popupRender={() => (
                <motion.div className={`${WORKBENCH_POPOVER_HEIGHT_CLASS} w-[280px] rounded-2xl border border-stone-200 bg-white p-3 shadow-[0_18px_54px_rgba(28,25,23,0.18)] dark:border-[#303034] dark:bg-[#19191b] dark:shadow-[0_18px_54px_rgba(0,0,0,0.56)]`}>
                    <div className="mb-3 text-[11px] font-medium text-stone-400 dark:text-stone-500">{t("workbench.more")}</div>
                    <div className="space-y-2.5">
                        <OutputOptionRow
                            label={t("imageWorkbench.outputFormat")}
                            value={format}
                            options={FORMAT_OPTIONS}
                            onChange={(next) => {
                                onChange("imageOutputFormat", next as NonNullable<AiConfig["imageOutputFormat"]>);
                                if (next === "jpeg") onChange("background", "");
                            }}
                        />
                        <OutputOptionRow
                            label={t("imageWorkbench.transparentBackground")}
                            value={String(transparent)}
                            options={TRANSPARENCY_OPTIONS}
                            disabled={format === "jpeg"}
                            onChange={(next) => onChange("background", next === "true" ? "transparent" : "")}
                        />
                        <OutputOptionRow label={t("workbench.review")} value={moderation} options={MODERATION_OPTIONS} onChange={(next) => onChange("imageModeration", next as "auto" | "low")} />
                    </div>
                </motion.div>
            )}
        >
            <motion.button
                type="button"
                layout
                transition={{ layout: { type: "spring", stiffness: 420, damping: 38, mass: 0.7 } }}
                className={`${WORKBENCH_PILL_CLASS} max-w-[310px]`}
                aria-expanded={open}
                aria-label={t("workbench.more")}
                title={t("workbench.more")}
            >
                <span>{t("workbench.more")}</span>
                <span className="truncate text-stone-400">
                    · {format.toUpperCase()} · {t("workbench.transparent")} {String(transparent)} · {t("workbench.review")} {moderation}
                </span>
                <ChevronDown className={`size-3 shrink-0 opacity-50 transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-180" : ""}`} />
            </motion.button>
        </Dropdown>
    );
}
