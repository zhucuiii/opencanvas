import { ChevronDown } from "lucide-react";
import { Dropdown } from "antd";
import { useTranslation } from "react-i18next";

import { WORKBENCH_PILL_CLASS } from "./workbench-input-pills";
import type { AiConfig } from "@/stores/use-config-store";
import { useExclusivePopover } from "@/components/ui/popover-group";

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

function OutputPill({
    label,
    ariaLabel = label,
    value,
    options,
    disabled = false,
    hint,
    onChange,
}: {
    label: string;
    ariaLabel?: string;
    value: string;
    options: { value: string; label: string }[];
    disabled?: boolean;
    hint?: string;
    onChange: (value: string) => void;
}) {
    const [open, setOpen] = useExclusivePopover();
    const displayValue = options.find((option) => option.value === value)?.label || value;

    return (
        <Dropdown
            trigger={["click"]}
            placement="topLeft"
            open={open && !disabled}
            disabled={disabled}
            onOpenChange={setOpen}
            transitionName="workbench-output-motion"
            classNames={{ root: "workbench-output-popup" }}
            popupRender={() => (
                <div role="group" aria-label={ariaLabel} className="max-w-[calc(100vw-32px)] rounded-2xl border border-stone-200 bg-white p-2.5 shadow-xl dark:border-stone-700 dark:bg-stone-900">
                    <div className="mb-2 text-[11px] text-stone-400">{ariaLabel}</div>
                    <div className="flex gap-1">
                        {options.map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                aria-label={`${ariaLabel} ${option.label}`}
                                aria-pressed={value === option.value}
                                className={`min-w-14 cursor-pointer rounded-lg px-3 py-2 text-xs transition-colors ${value === option.value ? "bg-stone-900 !text-white dark:bg-stone-100 dark:!text-stone-900" : "!text-stone-600 hover:bg-stone-100 dark:!text-stone-300 dark:hover:bg-stone-800"}`}
                                onClick={() => {
                                    onChange(option.value);
                                    setOpen(false);
                                }}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        >
            <button type="button" className={`${WORKBENCH_PILL_CLASS} disabled:cursor-not-allowed disabled:opacity-40`} disabled={disabled} aria-label={ariaLabel} aria-expanded={open && !disabled} title={hint || ariaLabel}>
                <span className="text-stone-400">{label}</span>
                <span>{displayValue}</span>
                <ChevronDown className={`size-3 shrink-0 opacity-50 transition-transform duration-200 motion-reduce:transition-none ${open && !disabled ? "rotate-180" : ""}`} />
            </button>
        </Dropdown>
    );
}

export function WorkbenchOutputPills({ config, onChange }: { config: AiConfig; onChange: <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => void }) {
    const { t } = useTranslation();
    const format = config.imageOutputFormat || "png";
    const transparent = format !== "jpeg" && config.background === "transparent";

    return (
        <>
            <OutputPill
                label={t("imageWorkbench.outputFormat")}
                value={format}
                options={FORMAT_OPTIONS}
                onChange={(next) => {
                    onChange("imageOutputFormat", next as NonNullable<AiConfig["imageOutputFormat"]>);
                    if (next === "jpeg") onChange("background", "");
                }}
            />
            <OutputPill
                label={t("workbench.transparent")}
                ariaLabel={t("imageWorkbench.transparentBackground")}
                value={String(transparent)}
                options={TRANSPARENCY_OPTIONS}
                disabled={format === "jpeg"}
                hint={format === "jpeg" ? t("imageWorkbench.outputHint") : undefined}
                onChange={(next) => onChange("background", next === "true" ? "transparent" : "")}
            />
            <OutputPill label={t("workbench.review")} value={config.imageModeration || "auto"} options={MODERATION_OPTIONS} onChange={(next) => onChange("imageModeration", next as "auto" | "low")} />
        </>
    );
}
