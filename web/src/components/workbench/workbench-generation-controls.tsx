import { type ReactNode } from "react";
import { ChevronDown, KeyRound, RectangleHorizontal, Settings2 } from "lucide-react";
import { Dropdown } from "antd";
import { useTranslation } from "react-i18next";

import { AspectIcon, imageQualityOptions } from "@/components/image-settings-panel";
import { useExclusivePopover } from "@/components/ui/popover-group";
import { WorkbenchOutputOptions } from "@/components/workbench/workbench-output-pill";
import { computeMediaSize, inferMediaRatio, inferMediaScale, mediaRatioOptions, clampVideoSeconds } from "@/lib/media-size";
import { normalizeVideoSizeValue, videoResolutionOptions, videoSizeLabel } from "@/components/video-settings-panel";
import { decodeChannelModel, encodeChannelModel, useConfigStore, type AiConfig } from "@/stores/use-config-store";

type UpdateConfig = <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => void;
type ControlsProps = { mode: "image" | "video"; config: AiConfig; model: string; onChange: UpdateConfig };

function Section({ label, children }: { label: string; children: ReactNode }) {
    return <section className="studio-parameter-section" aria-label={label}><h3>{label}</h3>{children}</section>;
}

function Segment({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
    return (
        <div className="studio-segments" role="group" aria-label={label}>
            {options.map((option) => (
                <button key={option.value} type="button" aria-pressed={value === option.value} aria-label={`${label} ${option.label}`} onClick={() => onChange(option.value)}>{option.label}</button>
            ))}
        </div>
    );
}

export function WorkbenchGenerationControls({ mode, config, model, onChange }: ControlsProps) {
    const { t } = useTranslation();
    const [open, setOpen] = useExclusivePopover();
    const isVideo = mode === "video";
    const auto = t("settingsPanels.common.auto");
    const ratio = inferMediaRatio(config.size || "auto");
    const scale = inferMediaScale(config.size || "auto", config.imageScale);
    const count = String(Math.max(1, Math.min(10, Number(config.count) || 1)));
    const label = t("studioControls.parameters");
    const ratioLabel = t("studioControls.ratio");
    const resolutionLabel = isVideo ? t("settingsPanels.video.quality") : t("settingsPanels.image.resolution");
    const countLabel = t("studioControls.count");
    const orderedRatios = ["auto", "1:1", "16:9", "9:16", "4:3", "3:4", "21:9", "3:2", "2:3", "9:21"];
    const setImageSize = (nextScale: string, nextRatio: string) => {
        onChange("imageScale", nextScale);
        onChange("size", computeMediaSize(nextScale, nextRatio));
    };
    const setRatio = (nextRatio: string) => isVideo ? onChange("size", normalizeVideoSizeValue(nextRatio, config.vquality || "720")) : setImageSize(scale, nextRatio);
    const displayedRatio = isVideo ? videoSizeLabel(config.size) : ratio === "auto" ? auto : ratio;
    const displayedScale = isVideo ? `${config.vquality || "720"}P` : scale === "auto" ? auto : scale.toUpperCase();

    return (
        <div className="studio-function-controls">
            <Dropdown trigger={["click"]} placement="topLeft" align={{ offset: [0, -8] }} open={open} onOpenChange={setOpen} popupRender={() => (
                <div className="studio-parameter-popover" role="dialog" aria-label={label} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}>
                    {isVideo ? (
                        <Section label={t("studioControls.videoMode")}>
                            <Segment label={t("studioControls.videoMode")} value={config.videoMode || "frames"} options={[{ value: "frames", label: t("studioControls.frames") }, { value: "reference", label: t("studioControls.reference") }]} onChange={(value) => onChange("videoMode", value)} />
                        </Section>
                    ) : null}
                    <Section label={ratioLabel}>
                        <div className="studio-ratio-grid">
                            {orderedRatios.map((value) => {
                                const item = mediaRatioOptions.find((option) => option.value === value)!;
                                return (
                                    <button key={value} type="button" aria-pressed={ratio === value} aria-label={`${ratioLabel} ${value}`} onClick={() => setRatio(value)}>
                                        <AspectIcon width={item.width || 1} height={item.height || 1} color="currentColor" box={20} thickness={1} />
                                        <span>{value === "auto" ? auto : value}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </Section>
                    <Section label={resolutionLabel}>
                        <Segment label={resolutionLabel} value={isVideo ? config.vquality || "720" : scale} options={isVideo ? videoResolutionOptions : ["auto", "1k", "2k", "4k"].map((value) => ({ value, label: value === "auto" ? auto : value.toUpperCase() }))} onChange={(value) => {
                            if (isVideo) { onChange("vquality", value); onChange("size", normalizeVideoSizeValue(ratio, value)); }
                            else setImageSize(value, ratio);
                        }} />
                    </Section>
                    {isVideo ? (
                        <Section label={t("studioControls.duration")}>
                            <Segment label={t("studioControls.duration")} value={clampVideoSeconds(config.videoSeconds)} options={Array.from({ length: 27 }, (_, index) => ({ value: String(index + 4), label: `${index + 4}s` }))} onChange={(value) => onChange("videoSeconds", value)} />
                        </Section>
                    ) : null}
                    <Section label={countLabel}>
                        <Segment label={countLabel} value={isVideo ? "1" : count} options={(isVideo ? ["1"] : Array.from(new Set(["1", "2", "4", ...(!["1", "2", "4"].includes(count) ? [count] : [])]))).map((value) => ({ value, label: value }))} onChange={(value) => onChange("count", value)} />
                        {isVideo ? <p className="studio-parameter-hint">{t("studioControls.singleVideo")}</p> : null}
                    </Section>
                    {!isVideo ? (
                        <details className="studio-advanced-settings">
                            <summary><Settings2 size={13} />{t("imageWorkbench.advancedSettings")}<ChevronDown size={12} /></summary>
                            <Section label={t("settingsPanels.image.quality")}>
                                <Segment label={t("settingsPanels.image.quality")} value={config.quality || "auto"} options={imageQualityOptions.map((item) => ({ value: item.value, label: item.value }))} onChange={(value) => onChange("quality", value)} />
                            </Section>
                            <WorkbenchOutputOptions config={config} onChange={onChange} />
                        </details>
                    ) : null}
                </div>
            )}>
                <button type="button" className="studio-function-button studio-parameter-trigger" aria-haspopup="dialog" aria-expanded={open} aria-label={label} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}>
                    <RectangleHorizontal size={12} />
                    <span>{displayedRatio} · {displayedScale}{isVideo ? ` · ${clampVideoSeconds(config.videoSeconds)}s` : ""} · {t("studioControls.items", { count: Number(isVideo ? 1 : count) })}</span>
                    <ChevronDown size={11} className={open ? "rotate-180" : ""} />
                </button>
            </Dropdown>
            <label className="studio-base64-toggle" title={t("studioControls.base64Hint")}>
                <input type="checkbox" checked={config.imageReferencesAsBase64 !== false} onChange={(event) => onChange("imageReferencesAsBase64", event.target.checked)} />
                <span>B64</span>
            </label>
            <span className="studio-function-divider" aria-hidden="true" />
            <ProviderControl config={config} model={model} mode={mode} onChange={onChange} />
        </div>
    );
}

function ProviderControl({ config, model, mode, onChange }: ControlsProps) {
    const { t } = useTranslation();
    const [open, setOpen] = useExclusivePopover();
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const currentId = decodeChannelModel(model)?.channelId;
    const channel = config.channels.find((item) => item.id === currentId);
    const channels = config.channels.filter((item) => item.models.some((entry) => entry.capability === mode));
    const label = t("studioControls.provider");

    return (
        <Dropdown trigger={["click"]} placement="topLeft" align={{ offset: [0, -8] }} open={open} onOpenChange={setOpen} popupRender={() => (
            <div className="studio-provider-popover" role="dialog" aria-label={label} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}>
                <div className="studio-provider-caption">{t("config.tabs.channels")}</div>
                {channels.map((item) => (
                    <button type="button" key={item.id} aria-pressed={item.id === currentId} onClick={() => {
                        const next = item.models.find((entry) => entry.capability === mode)!;
                        onChange(mode === "image" ? "imageModel" : "videoModel", encodeChannelModel(item.id, next.name));
                        setOpen(false);
                    }}><KeyRound size={12} /><span>{item.name}</span><span className="studio-provider-caption">{t("studioControls.modelKey")}</span></button>
                ))}
                <button type="button" className="studio-provider-settings" onClick={() => { setOpen(false); openConfigDialog(false, "channels"); }}><Settings2 size={12} />{t("studioControls.manageKeys")}</button>
            </div>
        )}>
            <button type="button" className="studio-function-button studio-provider-trigger" aria-label={label} aria-haspopup="dialog" aria-expanded={open} title={label} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}><KeyRound size={13} /><span>{t("settingsPanels.common.auto")}·{channel?.name || t("studioControls.modelKey")}</span></button>
        </Dropdown>
    );
}
