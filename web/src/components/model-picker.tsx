import { useEffect, useId, useMemo, useState } from "react";
import { Check, ChevronDown, Cpu } from "lucide-react";
import { useTranslation } from "react-i18next";

import i18n from "@/i18n";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { useExclusivePopover } from "@/components/ui/popover-group";
import { cn } from "@/lib/utils";
import { decodeChannelModel, modelOptionLabel, modelOptionName, selectableModelsByCapability, type AiConfig, type ModelCapability } from "@/stores/use-config-store";

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
    const channelGroups = useMemo(() => {
        const groups = config.channels
            .map((channel) => ({
                id: channel.id,
                name: channel.name,
                options: options.filter((model) => decodeChannelModel(model)?.channelId === channel.id),
            }))
            .filter((group) => group.options.length);
        const unassigned = options.filter((model) => !decodeChannelModel(model));
        if (unassigned.length) groups.push({ id: "__local__", name: "API", options: unassigned });
        return groups;
    }, [config.channels, options]);
    const displayGroups = useMemo(() => {
        if (channelGroups.length !== 1) return channelGroups;
        const only = channelGroups[0];
        if (only.id === "__local__" || /^\d+$/.test(only.name || "")) return [{ ...only, name: "API", id: "__local__" }];
        return channelGroups;
    }, [channelGroups]);
    const [activeChannelId, setActiveChannelId] = useState("");
    const activeGroup = displayGroups.find((group) => group.id === activeChannelId) || displayGroups[0];
    const activeGroupId = activeGroup?.id || "";
    const currentLabel = current ? (displayGroups.length > 1 ? modelOptionName(current) : modelOptionLabel(config, current)) : pickerPlaceholder;

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
                if (nextOpen) setActiveChannelId((currentId) => (displayGroups.some((group) => group.id === currentId) ? currentId : displayGroups[0]?.id || ""));
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
                hideChevron={false}
                data-canvas-model-trigger
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
                title={currentLabel}
            >
                {showIcon ? <ModelIcon model={current} /> : null}
                <span className="canvas-model-picker-text min-w-0 flex-1 truncate text-left">{currentLabel}</span>
                {flat ? <ChevronDown className="canvas-model-picker-chevron size-3 shrink-0 opacity-65" /> : null}
            </SelectTrigger>
            <SelectContent
                data-canvas-no-zoom
                className={cn(
                    "canvas-model-menu z-[1200] max-w-[calc(100vw-24px)] !bg-[#252525] !p-2",
                    flat ? "w-[382px] !rounded-[18px] !border-[#474747] !shadow-[0_18px_42px_rgba(0,0,0,0.55)]" : "w-80 rounded-xl border border-border/70 bg-popover shadow-xl",
                    contentClassName,
                )}
                position="popper"
                align="start"
                alignOffset={flat ? 12 : 0}
                side={side}
                sideOffset={flat ? 8 : 12}
                onPointerDown={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
            >
                {options.length ? (
                    <div className={cn("overflow-hidden rounded-[14px]", flat ? "bg-[#303030] p-1" : "bg-white p-1 dark:bg-[#1f1f20]")}>
                        {displayGroups.length ? (
                            <div className={cn("mb-2 grid grid-flow-col auto-cols-fr gap-1 rounded-[11px] p-1", flat ? "bg-[#262626]" : "bg-stone-100 dark:bg-[#29292b]")}>
                                {displayGroups.map((group) => (
                                    <button
                                        key={group.id}
                                        type="button"
                                        className={cn(
                                            "h-9 min-w-0 truncate rounded-[9px] px-2 text-[12px] transition-colors",
                                            flat
                                                ? activeGroupId === group.id
                                                    ? "bg-[#414141] font-medium text-white"
                                                    : "text-[#a6a6a8] hover:text-white"
                                                : activeGroupId === group.id
                                                  ? "bg-white font-medium text-stone-900 shadow-sm dark:bg-[#3a3a3d] dark:text-white"
                                                  : "text-stone-500 hover:text-stone-900 dark:text-[#b7b7ba] dark:hover:text-white",
                                        )}
                                        onPointerDown={(event) => event.preventDefault()}
                                        onClick={() => setActiveChannelId(group.id)}
                                    >
                                        {group.id === "__local__" ? "API" : group.name || "API"}
                                    </button>
                                ))}
                            </div>
                        ) : null}
                        <div className={cn("overflow-y-auto px-1 pb-1", flat ? "max-h-[334px] [scrollbar-width:thin] [scrollbar-color:#555_transparent]" : "max-h-[260px] px-0.5 [scrollbar-width:thin] [scrollbar-color:#b8b8b8_transparent] dark:[scrollbar-color:#454549_transparent]")}>
                            {(activeGroup?.options || options).map((model) => (
                                <SelectItem
                                    key={model}
                                    value={model}
                                    textValue={displayGroups.length > 1 ? modelOptionName(model) : modelOptionLabel(config, model)}
                                    className={cn(
                                        "group/model my-0.5 min-h-10 rounded-[10px] px-3 pr-4 text-[13px] transition-colors",
                                        flat
                                            ? "text-[#e7e7e8] data-[highlighted]:bg-[#414141] data-[highlighted]:text-white data-[state=checked]:bg-[#3c3c3e]"
                                            : "text-stone-700 data-[highlighted]:bg-stone-100 data-[highlighted]:text-stone-950 dark:text-[#d8d8da] data-[state=checked]:!bg-transparent dark:data-[highlighted]:bg-[#303034] dark:data-[highlighted]:text-white",
                                    )}
                                >
                                    <span className="flex min-w-0 items-center gap-2.5">
                                        <span className="truncate">{displayGroups.length > 1 ? modelOptionName(model) : modelOptionLabel(config, model)}</span>
                                    </span>
                                    {model === current ? <Check className="pointer-events-none absolute right-3 size-4 text-[#a7a7aa]" /> : null}
                                </SelectItem>
                            ))}
                        </div>
                    </div>
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

function ModelLabel({ config, model, showIcon, hideChannel = false }: { config: AiConfig; model: string; showIcon: boolean; hideChannel?: boolean }) {
    return (
        <span className="flex min-w-0 items-center gap-2">
            {showIcon ? <ModelIcon model={model} /> : null}
            <span className="truncate">{hideChannel ? modelOptionName(model) : modelOptionLabel(config, model)}</span>
        </span>
    );
}

function ModelIcon({ model }: { model: string }) {
    const icon = resolveModelIcon(modelOptionName(model));
    return icon ? <img src={icon} alt="" className="size-4 shrink-0 dark:invert" /> : <Cpu className="size-4 shrink-0 opacity-70" />;
}

function resolveModelIcon(model: string) {
    const name = model.toLowerCase();
    if (name.includes("nano banana")) return "/icons/gemini.svg";
    if (name.includes("claude") || name.includes("anthropic")) return "/icons/claude.svg";
    if (name.includes("gemini") || name.includes("google")) return "/icons/gemini.svg";
    if (name.includes("gpt") || name.includes("openai")) return "/icons/openai.svg";
    if (name.includes("grok") || name.includes("grok")) return "/icons/grok.svg";
    if (name.includes("deepseek") || name.includes("deepseek")) return "/icons/deepseek.svg";
    if (name.includes("glm") || name.includes("glm")) return "/icons/glm.svg";
    return "";
}
