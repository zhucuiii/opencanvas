import { Download, FolderPlus, ImagePlus, Pencil } from "lucide-react";
import { useSyncExternalStore } from "react";
import { Button, Image, Tooltip, Typography } from "antd";
import { useTranslation } from "react-i18next";

import { ImageGenerationPending } from "@/components/image-generation-pending";
import { formatBytes, formatDuration } from "@/lib/image-utils";
import { getImagePreviewRevision, previewUrlFor, subscribeImagePreviews } from "@/services/image-storage";

/** 生成结果里的一张图。字段和 pages/image 里原本的 GeneratedImage 一致。 */
export type WorkbenchImage = {
    id: string;
    dataUrl: string;
    storageKey?: string;
    durationMs: number;
    width: number;
    height: number;
    bytes: number;
    mimeType?: string;
};

type WorkbenchImageCardProps = {
    image: WorkbenchImage;
    index: number;
    /** 这条来自历史记录（而不是本次生成），历史卡片整体可点、用于回放参数。 */
    onReplay?: () => void;
    /** 高亮当前正在回放的那条历史。 */
    active?: boolean;
    onAddToReferences?: (image: WorkbenchImage) => void;
    onDownload?: (image: WorkbenchImage) => void;
    onSaveAsset?: (image: WorkbenchImage) => void;
};

/*
 * 结果网格里的一张图。
 *
 * 两个动作必须分开：点图片本身放大预览，点卡片空白处才回放参数 ——
 * 所以图片容器上 stopPropagation，否则每看一张大图都会顺手把输入区覆盖掉。
 *
 * useSyncExternalStore 那行不能少：图片走的是 IndexedDB 里的 blob URL，
 * 浏览器会回收它，预览修订号变化时必须重渲染，否则显示空图。
 */
export function WorkbenchImageCard({ image, index, onReplay, active = false, onAddToReferences, onDownload, onSaveAsset }: WorkbenchImageCardProps) {
    useSyncExternalStore(subscribeImagePreviews, getImagePreviewRevision);
    const { t } = useTranslation();
    const src = previewUrlFor(image.storageKey) || image.dataUrl;

    return (
        <div className={`group relative overflow-hidden rounded-lg border bg-background transition ${active ? "border-stone-900 dark:border-stone-100" : "border-stone-200 hover:border-stone-400 dark:border-stone-800 dark:hover:border-stone-600"}`} data-workbench-image={image.id}>
            <div onClick={(event) => event.stopPropagation()}>
                <Image
                    src={src}
                    // 点图片 = 只放大看，不触发回放。
                    preview={{ src: image.dataUrl }}
                    alt={t("imageWorkbench.resultAlt", { count: index + 1 })}
                    loading="lazy"
                    className="aspect-square w-full object-cover"
                />
            </div>

            <div className="flex items-center justify-between gap-2 px-2.5 py-2 text-xs text-stone-500 dark:text-stone-400">
                <span className="truncate">
                    {image.width}×{image.height} · {formatBytes(image.bytes)}
                </span>
                <span className="shrink-0 tabular-nums">{formatDuration(image.durationMs)}</span>
            </div>

            {/*
             * 悬停蒙层放操作按钮。
             * 关键：蒙层本身必须始终 pointer-events:none，只有里面的按钮恢复 auto ——
             * 否则它会盖在图片上，把 antd 的预览点击整个吃掉（点图片没反应）。
             */}
            <div className="pointer-events-none absolute inset-x-0 bottom-9 z-20 flex justify-end gap-1 bg-gradient-to-t from-black/70 to-transparent p-2 opacity-0 transition group-hover:opacity-100">
                {onSaveAsset ? (
                    <Tooltip title={t("common.addToAssets")}>
                        <Button size="small" className="pointer-events-auto" icon={<FolderPlus className="size-3.5" />} onClick={(event) => { event.stopPropagation(); void onSaveAsset(image); }} aria-label={t("common.addToAssets")} />
                    </Tooltip>
                ) : null}
                {onAddToReferences ? (
                    <Tooltip title={t("imageWorkbench.addReference")}>
                        <Button size="small" className="pointer-events-auto" icon={<Pencil className="size-3.5" />} onClick={(event) => { event.stopPropagation(); onAddToReferences(image); }} aria-label={t("imageWorkbench.addReference")} />
                    </Tooltip>
                ) : null}
                {onDownload ? (
                    <Tooltip title={t("common.download")}>
                        <Button size="small" className="pointer-events-auto" icon={<Download className="size-3.5" />} onClick={(event) => { event.stopPropagation(); onDownload(image); }} aria-label={t("common.download")} />
                    </Tooltip>
                ) : null}
            </div>

            {/*
             * 历史卡片：点卡片空白处回放参数。
             * 用 inset-0 铺满会盖在图片上、把 antd 的预览点击吃掉，所以只盖「底部信息条」
             * 那一行（图片区本身留给预览），z 也压到图片之下。
             */}
            {onReplay ? (
                <button type="button" className="absolute inset-x-0 bottom-0 z-10 h-9 cursor-pointer" onClick={onReplay} aria-label={t("workbench.replayLog")}>
                    <span className="sr-only">{t("workbench.replayLog")}</span>
                </button>
            ) : null}
        </div>
    );
}

/** 生成中的占位卡。 */
export function WorkbenchPendingCard() {
    return <ImageGenerationPending className="aspect-square w-full rounded-lg" />;
}

/** 失败卡。 */
export function WorkbenchFailedCard({ error, onRetry }: { error: string; onRetry: () => void }) {
    const { t } = useTranslation();
    return (
        <div className="flex aspect-square w-full flex-col items-center justify-center gap-3 rounded-lg border border-red-300 bg-red-50/60 p-4 text-center dark:border-red-900 dark:bg-red-950/30">
            <ImagePlus className="size-8 text-red-400" />
            <Typography.Paragraph className="!mb-0 !text-xs !text-red-600 dark:!text-red-400" ellipsis={{ rows: 4 }}>
                {error || t("workbench.generationFailed")}
            </Typography.Paragraph>
            <Button size="small" danger onClick={onRetry}>
                {t("workbench.retry")}
            </Button>
        </div>
    );
}
