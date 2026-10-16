import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Dropdown } from "antd";
import { useTranslation } from "react-i18next";

import { AspectIcon, imageQualityLabel, imageQualityOptions, imageSizeLabel } from "@/components/image-settings-panel";
import { computeMediaSize, inferMediaRatio, inferMediaScale, mediaRatioOptions, mediaScaleOptions } from "@/lib/media-size";
import { cn } from "@/lib/utils";
import type { AiConfig } from "@/stores/use-config-store";

/*
 * 底部悬浮条上的一排小胶囊。
 *
 * 这一排只放「每次生成都要看一眼」的参数：模型 / 尺寸 / 质量 / 张数 / 更多。
 * 尺寸、质量、张数各自点开一个小弹层；参数面板里还有透明底、像素输入这些低频项，
 * 它们在「更多」和参数弹窗里。
 *
 * 三个弹层都用 popupRender 换成自己的网格，而不是 antd 默认的纵向菜单：
 * 默认菜单是一列，18 项要 450px 高，从底部往上弹时会被视口切掉一截，
 * 「分辨率」那一组正好落在看不见的地方（点不到，得先在弹层里滚一道）。
 *
 * 换成 popupRender 之后必须自己受控 open：选项换成普通 button 后 antd 不再知道
 * 「选了一项」，默认菜单那套「点完自动收起」的行为没有了，得自己 setOpen(false)。
 */

/** 胶囊外观：浅底、无描边、悬停加深一档。深浅色各一份。 */
export const WORKBENCH_PILL_CLASS = "inline-flex h-8 min-w-0 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl px-3 text-xs font-medium text-stone-600 transition-colors hover:bg-stone-900/[0.06] dark:text-stone-300 dark:hover:bg-stone-100/10";
/** 弹层外壳：和工作台卡片同一套 stone 配色。 */
const POPUP_CLASS = "rounded-2xl border border-stone-200 bg-white p-2.5 shadow-[0_18px_54px_rgba(28,25,23,0.18)] dark:border-stone-700 dark:bg-stone-900";
const SECTION_TITLE_CLASS = "px-0.5 pb-1.5 text-[11px] font-medium text-stone-400 dark:text-stone-500";
const OPTION_CLASS = "flex cursor-pointer items-center justify-center rounded-lg px-2 py-1.5 text-xs tabular-nums transition-colors";
const OPTION_OFF_CLASS = "text-stone-600 hover:bg-stone-900/[0.06] dark:text-stone-300 dark:hover:bg-stone-100/10";
const OPTION_ON_CLASS = "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900";

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
        <button type="button" className={cn(OPTION_CLASS, selected ? OPTION_ON_CLASS : OPTION_OFF_CLASS, className)} {...rest}>
            {children}
        </button>
    );
}

/** 尺寸胶囊：一个弹层里分「宽高比」「分辨率」两组，选完即收起。 */
export function WorkbenchSizePill({ config, onChange }: { config: AiConfig; onChange: (key: "size" | "imageScale", value: string) => void }) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const activeSize = config.size || "auto";
    const selectedScale = inferMediaScale(activeSize, config.imageScale);
    const selectedRatio = inferMediaRatio(activeSize);

    const applySize = (scale: string, ratio: string) => {
        // 先写分辨率再算尺寸：computeMediaSize 要用新 scale，而这一轮 config 还是旧的
        // （两个 onChange 会合并进同一次写入，读 config.imageScale 判断会漏写）。
        if (config.imageScale !== scale) onChange("imageScale", scale);
        const next = computeMediaSize(scale, ratio);
        if (next !== activeSize) onChange("size", next);
        setOpen(false);
    };

    return (
        <Dropdown
            trigger={["click"]}
            placement="topLeft"
            open={open}
            onOpenChange={setOpen}
            popupRender={() => (
                <div className={cn(POPUP_CLASS, "w-[236px]")}>
                    <div className={SECTION_TITLE_CLASS}>{t("settingsPanels.image.aspectRatio")}</div>
                    <div className="grid grid-cols-5 gap-1">
                        {mediaRatioOptions.map((item) => (
                            <OptionButton key={item.value} selected={selectedRatio === item.value} className="flex-col gap-0.5 py-1.5" onClick={() => applySize(selectedScale, item.value)} aria-label={`${t("settingsPanels.image.aspectRatio")} ${item.value}`}>
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
            <Pill aria-label={t("settingsPanels.image.size")} title={t("settingsPanels.image.size")}>
                <span className="truncate">{imageSizeLabel(activeSize, config.imageScale)}</span>
                <PillChevron />
            </Pill>
        </Dropdown>
    );
}

/** 质量胶囊：六档质量，3 列排开。 */
export function WorkbenchQualityPill({ quality, onChange }: { quality: string; onChange: (quality: string) => void }) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const current = quality || "auto";
    return (
        <Dropdown
            trigger={["click"]}
            placement="topLeft"
            open={open}
            onOpenChange={setOpen}
            popupRender={() => (
                <div className={cn(POPUP_CLASS, "w-[184px]")}>
                    <div className={SECTION_TITLE_CLASS}>{t("settingsPanels.image.quality")}</div>
                    <div className="grid grid-cols-3 gap-1">
                        {imageQualityOptions.map((item) => (
                            <OptionButton
                                key={item.value}
                                selected={current === item.value}
                                aria-label={`${t("settingsPanels.image.quality")} ${item.label}`}
                                onClick={() => {
                                    onChange(item.value);
                                    setOpen(false);
                                }}
                            >
                                {item.label}
                            </OptionButton>
                        ))}
                    </div>
                </div>
            )}
        >
            <Pill aria-label={t("settingsPanels.image.quality")} title={t("settingsPanels.image.quality")}>
                <span className="truncate">{imageQualityLabel(current)}</span>
                <PillChevron />
            </Pill>
        </Dropdown>
    );
}

/** 张数胶囊：只露当前张数，点开是 1..max，5 列排开。 */
export function WorkbenchCountPill({ value, max = 10, onChange }: { value: number; max?: number; onChange: (count: number) => void }) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    return (
        <Dropdown
            trigger={["click"]}
            placement="topLeft"
            open={open}
            onOpenChange={setOpen}
            popupRender={() => (
                <div className={cn(POPUP_CLASS, "w-[196px]")}>
                    <div className={SECTION_TITLE_CLASS}>{t("settingsPanels.image.count")}</div>
                    <div className="grid grid-cols-5 gap-1">
                        {Array.from({ length: max }, (_, index) => index + 1).map((count) => (
                            <OptionButton
                                key={count}
                                selected={value === count}
                                aria-label={t("settingsPanels.image.images", { count })}
                                onClick={() => {
                                    onChange(count);
                                    setOpen(false);
                                }}
                            >
                                {count}
                            </OptionButton>
                        ))}
                    </div>
                </div>
            )}
        >
            <Pill aria-label={t("settingsPanels.image.count")} title={t("settingsPanels.image.count")}>
                <span className="tabular-nums">{value}</span>
            </Pill>
        </Dropdown>
    );
}
