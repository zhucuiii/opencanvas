import { type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Dropdown } from "antd";
import { useTranslation } from "react-i18next";

import { AspectIcon, imageQualityOptions, imageSizeLabel } from "@/components/image-settings-panel";
import { computeMediaSize, inferMediaRatio, inferMediaScale, mediaRatioOptions, mediaScaleOptions } from "@/lib/media-size";
import { cn } from "@/lib/utils";
import type { AiConfig } from "@/stores/use-config-store";
import { useExclusivePopover } from "@/components/ui/popover-group";

/*
 * 底部悬浮条上的一排小胶囊。
 *
 * 尺寸、质量、张数各自点开一个小弹层，与模型、格式、透明背景和审核并列展示。
 *
 * 三个弹层都用 popupRender 换成自己的网格，而不是 antd 默认的纵向菜单：
 * 默认菜单是一列，18 项要 450px 高，从底部往上弹时会被视口切掉一截，
 * 「分辨率」那一组正好落在看不见的地方（点不到，得先在弹层里滚一道）。
 *
 * 自定义网格使用受控 open：尺寸允许连续调整比例和分辨率，点外部才关闭；
 * 质量和张数仍然在单次选择后关闭。
 */

/** Floating control pills use neutral hairline edges that follow the current theme. */
export const WORKBENCH_PILL_CLASS =
    "inline-flex h-8 min-w-0 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-stone-200/80 bg-white/75 px-3 text-xs font-medium text-stone-600 shadow-sm transition-[color,background-color,border-color] hover:border-stone-300 hover:bg-stone-50 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-stone-300 dark:hover:border-white/15 dark:hover:bg-white/[0.08] dark:hover:text-white";
export const WORKBENCH_POPOVER_HEIGHT_CLASS = "h-[240px]";
export const WORKBENCH_POPOVER_ALIGN = { offset: [0, -12] };
/** 弹层外壳：和工作台卡片同一套 stone 配色。 */
const POPUP_CLASS = "rounded-2xl border border-stone-200 bg-white p-2.5 shadow-[0_18px_54px_rgba(28,25,23,0.18)] dark:border-stone-700 dark:bg-stone-900";
const SECTION_TITLE_CLASS = "px-0.5 pb-1.5 text-[11px] font-medium text-stone-400 dark:text-stone-500";
const OPTION_CLASS = "flex cursor-pointer items-center justify-center rounded-lg px-2 py-1.5 text-xs tabular-nums transition-colors";
const OPTION_OFF_CLASS = "!text-stone-600 hover:bg-stone-900/[0.06] dark:!text-stone-300 dark:hover:bg-stone-100/10";
// Ant Design's unlayered button reset otherwise overrides Tailwind's text color.
const OPTION_ON_CLASS = "bg-stone-900 !text-white dark:bg-stone-100 dark:!text-stone-900";

function Pill({ children, className, ...rest }: { children: ReactNode; className?: string } & React.ComponentPropsWithoutRef<"button">) {
    return (
        <button type="button" className={cn(WORKBENCH_PILL_CLASS, className)} {...rest}>
            {children}
        </button>
    );
}

function PillChevron() {
    return <ChevronDown className="size-3 shrink-0 opacity-60" aria-hidden />;
}

function OptionButton({ selected, className, children, ...rest }: { selected: boolean; className?: string; children: ReactNode } & React.ComponentPropsWithoutRef<"button">) {
    return (
        <button type="button" aria-pressed={selected} className={cn(OPTION_CLASS, selected ? OPTION_ON_CLASS : OPTION_OFF_CLASS, className)} {...rest}>
            {children}
        </button>
    );
}

/** 尺寸胶囊：允许连续调整两组选项，点击弹层外部再收起。 */
export function WorkbenchSizePill({ config, onChange }: { config: AiConfig; onChange: (key: "size" | "imageScale", value: string) => void }) {
    const { t } = useTranslation();
    const [open, setOpen] = useExclusivePopover();
    const activeSize = config.size || "auto";
    const selectedScale = inferMediaScale(activeSize, config.imageScale);
    const selectedRatio = inferMediaRatio(activeSize);

    const applySize = (scale: string, ratio: string) => {
        // 先写分辨率再算尺寸：computeMediaSize 要用新 scale，而这一轮 config 还是旧的
        // （两个 onChange 会合并进同一次写入，读 config.imageScale 判断会漏写）。
        if (config.imageScale !== scale) onChange("imageScale", scale);
        const next = computeMediaSize(scale, ratio);
        if (next !== activeSize) onChange("size", next);
    };

    return (
        <Dropdown
            trigger={["click"]}
            placement="topLeft"
            align={WORKBENCH_POPOVER_ALIGN}
            open={open}
            onOpenChange={setOpen}
            popupRender={() => (
                <div className={cn(POPUP_CLASS, "h-[240px] w-[236px]")}>
                    <div className={SECTION_TITLE_CLASS}>{t("settingsPanels.image.aspectRatio")}</div>
                    <div className="grid grid-cols-5 gap-1">
                        {mediaRatioOptions.map((item) => (
                            <OptionButton
                                key={item.value}
                                selected={selectedRatio === item.value}
                                className="flex-col gap-0.5 py-1.5"
                                onClick={() => applySize(selectedScale, item.value)}
                                aria-label={`${t("settingsPanels.image.aspectRatio")} ${item.value}`}
                            >
                                <AspectIcon width={item.width || 1} height={item.height || 1} color="currentColor" box={16} thickness={selectedRatio === item.value ? 2 : 1.5} />
                                <span className="text-[10px] leading-none">{item.value === "auto" ? t("settingsPanels.common.auto") : item.value}</span>
                            </OptionButton>
                        ))}
                    </div>
                    <div className={cn(SECTION_TITLE_CLASS, "pt-3")}>{t("settingsPanels.image.resolution")}</div>
                    <div className="grid grid-cols-4 gap-1">
                        {mediaScaleOptions.map((value) => (
                            // 两组里各有一个「自动」，标签必须带上组名才区分得开（读屏和自动化都靠它）。
                            <OptionButton key={value} selected={selectedScale === value} onClick={() => applySize(value, selectedRatio)} aria-label={`${t("settingsPanels.image.resolution")} ${value}`}>
                                {value === "auto" ? t("settingsPanels.common.auto") : value.toUpperCase()}
                            </OptionButton>
                        ))}
                    </div>
                </div>
            )}
        >
            <Pill aria-expanded={open} aria-label={t("settingsPanels.image.size")} title={t("settingsPanels.image.size")}>
                <span className="text-stone-400">{t("imageWorkbench.sizeLabel")}</span>
                <span className="truncate">{imageSizeLabel(activeSize, config.imageScale)}</span>
                <PillChevron />
            </Pill>
        </Dropdown>
    );
}

/** 质量胶囊：六档质量，3 列排开。 */
export function WorkbenchQualityPill({ quality, onChange }: { quality: string; onChange: (quality: string) => void }) {
    const { t } = useTranslation();
    const [open, setOpen] = useExclusivePopover();
    const current = quality || "auto";
    return (
        <Dropdown
            trigger={["click"]}
            placement="topLeft"
            align={WORKBENCH_POPOVER_ALIGN}
            open={open}
            onOpenChange={setOpen}
            popupRender={() => (
                <div className="h-[240px] w-[92px] rounded-xl border border-stone-200 bg-white p-1 shadow-[0_18px_54px_rgba(28,25,23,0.18)] dark:border-stone-700 dark:bg-stone-900">
                    <div className="space-y-0.5">
                        {imageQualityOptions.map((item) => (
                            <button
                                key={item.value}
                                type="button"
                                aria-pressed={current === item.value}
                                aria-label={`${t("settingsPanels.image.quality")} ${item.label}`}
                                className={`flex w-full items-center rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${current === item.value ? "bg-stone-100 font-medium text-sky-600 dark:bg-white/[0.08] dark:text-sky-400" : "text-stone-600 hover:bg-stone-900/[0.05] hover:text-stone-900 dark:text-stone-300 dark:hover:bg-white/[0.06] dark:hover:text-white"}`}
                                onClick={() => {
                                    onChange(item.value);
                                    setOpen(false);
                                }}
                            >
                                {item.value}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        >
            <Pill aria-expanded={open} aria-label={t("settingsPanels.image.quality")} title={t("settingsPanels.image.quality")}>
                <span className="text-stone-400">{t("imageWorkbench.qualityLabel")}</span>
                <span className={`truncate transition-opacity duration-150 motion-reduce:transition-none ${open ? "opacity-0" : "opacity-100"}`}>{current}</span>
                <PillChevron />
            </Pill>
        </Dropdown>
    );
}

/** 张数胶囊：只露当前张数，点开是 1..max，5 列排开。 */
export function WorkbenchCountPill({ value, max = 8, onChange }: { value: number; max?: number; onChange: (count: number) => void }) {
    const { t } = useTranslation();
    const [open, setOpen] = useExclusivePopover();
    return (
        <Dropdown
            trigger={["click"]}
            placement="topLeft"
            align={WORKBENCH_POPOVER_ALIGN}
            open={open}
            onOpenChange={setOpen}
            popupRender={() => (
                <div className="h-[240px] w-[64px] rounded-xl border border-stone-200 bg-white p-1 shadow-[0_18px_54px_rgba(28,25,23,0.18)] dark:border-stone-700 dark:bg-stone-900">
                    <div className="flex h-full flex-col justify-between">
                        {Array.from({ length: max }, (_, index) => max - index).map((count) => (
                            <button
                                key={count}
                                type="button"
                                aria-pressed={value === count}
                                aria-label={t("settingsPanels.image.images", { count })}
                                className={`flex h-6 w-full items-center justify-center rounded-lg text-center text-xs transition-colors ${value === count ? "bg-stone-100 font-medium text-sky-600 dark:bg-white/[0.08] dark:text-sky-400" : "text-stone-600 hover:bg-stone-900/[0.05] hover:text-stone-900 dark:text-stone-300 dark:hover:bg-white/[0.06] dark:hover:text-white"}`}
                                onClick={() => {
                                    onChange(count);
                                    setOpen(false);
                                }}
                            >
                                {count}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        >
            <Pill aria-expanded={open} aria-label={t("settingsPanels.image.count")} title={t("settingsPanels.image.count")}>
                <span className="text-stone-400">{t("imageWorkbench.countLabel")}</span>
                <span className={`tabular-nums transition-opacity duration-150 motion-reduce:transition-none ${open ? "opacity-0" : "opacity-100"}`}>{value}</span>
            </Pill>
        </Dropdown>
    );
}
