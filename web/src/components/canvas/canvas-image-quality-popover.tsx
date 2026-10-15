import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Gauge } from "lucide-react";
import { Button } from "antd";
import { useTranslation } from "react-i18next";

import { ImageQualityGrid, imageQualityLabel } from "@/components/image-settings-panel";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";

type CanvasImageQualityPopoverProps = {
    quality: string;
    onChange: (quality: string) => void;
    buttonClassName?: string;
    /** 画布节点底栏的扁平样式：去掉胶囊的底色，只留图标加文字。 */
    flat?: boolean;
};

/*
 * 提示词面板底栏的质量控件：胶囊显示当前质量（自动 / 低 / 中 / 高 / 极高 / 最高），
 * 点击向上弹出六档宫格。数据仍走节点的 config.quality，只是从「参数」弹层挪到了
 * 底栏、放在转绘按钮前面——质量和尺寸一样是每次生成都要看一眼的参数。
 * 选定即收起：这里只有一个字段，没有继续改别的的必要。
 */
export function CanvasImageQualityPopover({ quality, onChange, buttonClassName, flat = false }: CanvasImageQualityPopoverProps) {
    const { t } = useTranslation();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const buttonRef = useRef<HTMLSpanElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [buttonRect, setButtonRect] = useState<DOMRect | null>(null);

    useEffect(() => {
        if (!open) return;
        const syncPosition = () => setButtonRect(buttonRef.current?.getBoundingClientRect() || null);
        const closeOnOutsidePointer = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
            setOpen(false);
        };

        syncPosition();
        window.addEventListener("resize", syncPosition);
        window.addEventListener("scroll", syncPosition, true);
        window.addEventListener("pointerdown", closeOnOutsidePointer, true);
        return () => {
            window.removeEventListener("resize", syncPosition);
            window.removeEventListener("scroll", syncPosition, true);
            window.removeEventListener("pointerdown", closeOnOutsidePointer, true);
        };
    }, [open]);

    return (
        <>
            <span ref={buttonRef} className="inline-flex min-w-0">
                <Button
                    size="small"
                    type="text"
                    className={buttonClassName || "!h-10 !max-w-[120px] !justify-start !rounded-full !px-3"}
                    style={{ background: flat ? "transparent" : theme.node.fill, color: theme.node.text }}
                    icon={<Gauge className="size-3.5" />}
                    onClick={() => setOpen(!open)}
                    aria-label={t("settingsPanels.image.quality")}
                    title={t("settingsPanels.image.quality")}
                >
                    <span className="truncate">{imageQualityLabel(quality)}</span>
                </Button>
            </span>
            {open && buttonRect ? (
                <QualityPortal
                    buttonRect={buttonRect}
                    panelRef={panelRef}
                    theme={theme}
                    quality={quality}
                    onChange={(value) => {
                        onChange(value);
                        setOpen(false);
                    }}
                />
            ) : null}
        </>
    );
}

function QualityPortal({
    buttonRect,
    panelRef,
    theme,
    quality,
    onChange,
}: {
    buttonRect: DOMRect;
    panelRef: RefObject<HTMLDivElement | null>;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    quality: string;
    onChange: (quality: string) => void;
}) {
    const { t } = useTranslation();
    const width = 240;
    const gap = 8;
    const margin = 12;
    const style = {
        position: "fixed",
        zIndex: 1200,
        width,
        left: Math.max(margin, Math.min(window.innerWidth - width - margin, buttonRect.left)),
        bottom: window.innerHeight - buttonRect.top + gap,
        background: theme.toolbar.panel,
        borderRadius: 18,
        boxShadow: "0 18px 54px rgba(28, 25, 23, 0.16)",
        padding: 14,
        color: theme.node.text,
    } as const;

    return createPortal(
        <div ref={panelRef} style={style} onPointerDown={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
            <div className="mb-2 px-1 text-sm font-medium" style={{ color: theme.node.muted }}>
                {t("settingsPanels.image.quality")}
            </div>
            <ImageQualityGrid quality={quality} theme={theme} onChange={onChange} className="grid grid-cols-3 gap-2" />
        </div>,
        document.body,
    );
}
