import { useEffect, useId, useMemo } from "react";
import { Cpu } from "lucide-react";
import { useTranslation } from "react-i18next";

import i18n from "@/i18n";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { useExclusivePopover } from "@/components/ui/popover-group";
import { cn } from "@/lib/utils";
import { modelOptionLabel, modelOptionName, selectableModelsByCapability, type AiConfig, type ModelCapability } from "@/stores/use-config-store";

type ModelPickerProps = {
    config: AiConfig;
    value?: string;
    onChange: (model: string) => void;
    capability?: ModelCapability;
    className?: string;
    contentClassName?: string;
    fullWidth?: boolean;
    placeholder?: string;
    onMissingConfig?: () => void;
    side?: "top" | "bottom";
    /** 画布节点底栏的扁平样式：去掉胶囊的底色和描边，只留图标加文字。 */
    flat?: boolean;
    showIcon?: boolean;
};

export function ModelPicker({ config, value, onChange, capability, className, contentClassName, fullWidth = false, placeholder, onMissingConfig, flat = false, showIcon = true, side = "bottom" }: ModelPickerProps) {
    const { t } = useTranslation();
    const pickerId = useId();
    const [open, setOpen] = useExclusivePopover();
    const options = useMemo(
        () => Array.from(new Set([...(config.channelMode === "local" && !capability ? [value] : []), ...selectableModelsByCapability(config, capability)].filter((model): model is string => Boolean(model)))),
        [capability, config, value],
    );
    const current = value || "";
    const pickerPlaceholder = placeholder || t("settingsPanels.model.select");

    useEffect(() => {
        const closeOtherPicker = (event: Event) => {
            if ((event as CustomEvent<string>).detail !== pickerId) setOpen(false);
        };
        window.addEventListener("model-picker-open", closeOtherPicker);
        return () => window.removeEventListener("model-picker-open", closeOtherPicker);
    }, [pickerId, setOpen]);

    return (
        <Select
            open={open}
            value={current}
            onOpenChange={(nextOpen) => {
                if (nextOpen && !options.length && config.channelMode === "local") onMissingConfig?.();
                if (nextOpen) window.dispatchEvent(new CustomEvent("model-picker-open", { detail: pickerId }));
                setOpen(nextOpen);
            }}
            onValueChange={onChange}
        >
            <SelectTrigger
                className={cn(
                    "canvas-composer-model-picker w-fit max-w-full gap-2 text-sm font-normal",
                    flat
                        ? // SelectTrigger 的基础样式里 h-8 和浅底是带变体的（data-[size=default] / dark:），
                          // tailwind-merge 不会把它们和普通工具类合并掉，只好逐个把变体也覆盖一遍。
                          "h-10 data-[size=default]:h-10 min-w-0 justify-start rounded-none border-0 bg-transparent p-0 shadow-none dark:bg-transparent hover:bg-transparent dark:hover:bg-transparent transition-opacity data-[state=open]:opacity-80 hover:opacity-80"
                        : "h-8 rounded-full border border-input bg-transparent px-3 shadow-sm transition-colors data-[state=open]:border-ring data-[state=open]:ring-2 data-[state=open]:ring-ring/20",
                    fullWidth ? "w-full min-w-0 justify-start" : flat ? "" : "min-w-[9rem] justify-start",
                    className,
                )}
                hideChevron={flat}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
                title={current ? modelOptionLabel(config, current) : pickerPlaceholder}
            >
                {showIcon ? <ModelIcon model={current} /> : null}
                <span className="canvas-model-picker-text min-w-0 flex-1 truncate text-left">{current ? modelOptionLabel(config, current) : pickerPlaceholder}</span>
            </SelectTrigger>
            <SelectContent
                data-canvas-no-zoom
                className={cn("z-[1200] w-80 max-w-[calc(100vw-24px)] rounded-xl border border-border/70 bg-popover p-1 shadow-xl", contentClassName)}
                position="popper"
                align="start"
                side={side}
                sideOffset={12}
                onPointerDown={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
            >
                {options.length ? (
                    options.map((model) => (
                        <SelectItem key={model} value={model} textValue={modelOptionLabel(config, model)}>
                            <ModelLabel config={config} model={model} showIcon={showIcon} />
                        </SelectItem>
                    ))
                ) : (
                    <SelectItem value="__empty__" disabled>
                        {emptyModelLabel(config, capability)}
                    </SelectItem>
                )}
            </SelectContent>
        </Select>
    );
}

function emptyModelLabel(config: AiConfig, capability?: ModelCapability) {
    const label = capability ? i18n.t(`settingsPanels.model.capabilities.${capability}`) : "";
    if (capability && config.models.length) return i18n.t("settingsPanels.model.assign", { capability: label });
    return config.models.length ? i18n.t("settingsPanels.model.noMatch", { capability: label }) : i18n.t("settingsPanels.model.addFirst");
}

function ModelLabel({ config, model, showIcon }: { config: AiConfig; model: string; showIcon: boolean }) {
    return (
        <span className="flex min-w-0 items-center gap-2">
            {showIcon ? <ModelIcon model={model} /> : null}
            <span className="truncate">{modelOptionLabel(config, model)}</span>
        </span>
    );
}

function ModelIcon({ model }: { model: string }) {
    const icon = resolveModelIcon(modelOptionName(model));
    return icon ? <img src={icon} alt="" className="size-4 shrink-0 dark:invert" /> : <Cpu className="size-4 shrink-0 opacity-70" />;
}

function resolveModelIcon(model: string) {
    const name = model.toLowerCase();
    if (name.includes("claude") || name.includes("anthropic")) return "/icons/claude.svg";
    if (name.includes("gemini") || name.includes("google")) return "/icons/gemini.svg";
    if (name.includes("gpt") || name.includes("openai")) return "/icons/openai.svg";
    if (name.includes("grok") || name.includes("grok")) return "/icons/grok.svg";
    if (name.includes("deepseek") || name.includes("deepseek")) return "/icons/deepseek.svg";
    if (name.includes("glm") || name.includes("glm")) return "/icons/glm.svg";
    return "";
}
