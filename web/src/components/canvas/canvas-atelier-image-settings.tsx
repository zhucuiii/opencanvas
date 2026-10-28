import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Popover } from "antd";
import { Focus, RectangleHorizontal } from "lucide-react";
import { AspectIcon, imageQualityLabel, imageQualityOptions } from "@/components/image-settings-panel";
import { computeMediaSize, inferMediaRatio, inferMediaScale, mediaRatioOptions } from "@/lib/media-size";
import { onCanvasPopoverDismiss } from "@/lib/canvas/canvas-popover-dismiss";
import type { AiConfig } from "@/stores/use-config-store";

const resolutionOptions = ["auto", "1k", "2k", "4k"] as const;

export function CanvasAtelierImageSettings({ config, onChange, onOpenChange }: { config: AiConfig; onChange: (patch: { size?: string; imageScale?: string; quality?: string }) => void; onOpenChange?: (open: boolean) => void }) {
    const [open, setOpen] = useState(false);
    const [anchorOffsetX, setAnchorOffsetX] = useState(0);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const anchorCenterRef = useRef<number | null>(null);
    const ratio = inferMediaRatio(config.size);
    const scale = inferMediaScale(config.size, config.imageScale);
    const quality = config.quality || "auto";
    const resolutionIndex = Math.max(
        0,
        resolutionOptions.findIndex((value) => value === scale),
    );
    const qualityIndex = Math.max(
        0,
        imageQualityOptions.findIndex((item) => item.value === quality),
    );
    const updateOpen = (value: boolean) => {
        if (value) {
            const rect = triggerRef.current?.getBoundingClientRect();
            anchorCenterRef.current = rect ? rect.left + rect.width / 2 : null;
            setAnchorOffsetX(0);
        }
        setOpen(value);
        onOpenChange?.(value);
    };
    useLayoutEffect(() => {
        if (!open || anchorCenterRef.current === null) return;
        const rect = triggerRef.current?.getBoundingClientRect();
        if (!rect) return;
        // Ant Design applies targetOffset in the opposite horizontal direction, so keep the
        // captured menu center stationary by measuring the trigger's center change.
        const nextOffset = rect.left + rect.width / 2 - anchorCenterRef.current;
        setAnchorOffsetX((current) => (Math.abs(current - nextOffset) < 0.1 ? current : nextOffset));
    }, [open, ratio, scale]);
    useEffect(
        () =>
            onCanvasPopoverDismiss(() => {
                setOpen(false);
                onOpenChange?.(false);
            }),
        [onOpenChange],
    );
    const ratios = ["auto", "1:1", "16:9", "9:16", "4:3", "3:4", "21:9", "3:2", "2:3"];
    // 底栏不再单放质量胶囊，非默认档位就跟在比例 / 画质后面，免得改完看不见。
    const qualityLabel = imageQualityLabel(quality);
    const label = `${ratio === "auto" ? "自适应" : ratio} · ${scale === "auto" ? "自适应" : scale.toUpperCase()}${quality === "auto" ? "" : ` · ${qualityLabel}`}`;
    return (
        <Popover
            trigger="click"
            placement="bottom"
            open={open}
            onOpenChange={updateOpen}
            align={{ targetOffset: [anchorOffsetX, 0] }}
            arrow={false}
            styles={{ container: { padding: 13, borderRadius: 18, border: "1px solid #8883" } }}
            content={
                <div className="atelier-ratio-panel" role="dialog" aria-label="比例 / 画质" onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>
                    <div className="atelier-menu-caption">画质</div>
                    <div className="atelier-resolution-tabs" role="tablist" aria-label="画质">
                        <span className="atelier-resolution-thumb" aria-hidden="true" style={{ transform: `translateX(calc(${resolutionIndex * 100}% + ${resolutionIndex * 4}px))` }} />
                        {resolutionOptions.map((value) => (
                            <button type="button" key={value} role="tab" aria-selected={scale === value} onClick={() => onChange({ imageScale: value, size: computeMediaSize(value, ratio) })}>
                                {value === "auto" ? "自适应" : value.toUpperCase()}
                            </button>
                        ))}
                    </div>
                    <div className="atelier-menu-caption">比例</div>
                    <div className="atelier-ratio-grid">
                        {ratios.map((value) => {
                            const option = mediaRatioOptions.find((item) => item.value === value)!;
                            return (
                                <button
                                    type="button"
                                    key={value}
                                    aria-label={`比例 ${value}`}
                                    aria-pressed={ratio === value}
                                    onClick={() => {
                                        onChange({ imageScale: scale, size: computeMediaSize(scale, value) });
                                        updateOpen(false);
                                    }}
                                >
                                    {value === "auto" ? <Focus size={15} /> : <AspectIcon width={option.width} height={option.height} color="currentColor" box={14} thickness={1} />}
                                    <span>{value === "auto" ? "自适应" : value}</span>
                                </button>
                            );
                        })}
                    </div>
                    <div className="atelier-menu-caption">质量</div>
                    <div className="atelier-resolution-tabs atelier-quality-tabs" role="tablist" aria-label="质量">
                        <span
                            className="atelier-resolution-thumb"
                            aria-hidden="true"
                            style={{
                                width: `calc((100% - ${8 + 4 * (imageQualityOptions.length - 1)}px) / ${imageQualityOptions.length})`,
                                transform: `translateX(calc(${qualityIndex * 100}% + ${qualityIndex * 4}px))`,
                            }}
                        />
                        {imageQualityOptions.map((item) => (
                            <button type="button" key={item.value} role="tab" aria-selected={quality === item.value} onClick={() => onChange({ quality: item.value })}>
                                {item.label}
                            </button>
                        ))}
                    </div>
                </div>
            }
        >
            <button ref={triggerRef} type="button" className="atelier-size-trigger" aria-label="比例 / 画质 / 质量" aria-expanded={open}>
                <RectangleHorizontal size={13} />
                {label}
            </button>
        </Popover>
    );
}
