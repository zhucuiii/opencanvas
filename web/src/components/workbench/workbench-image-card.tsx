import { Download, ImagePlus, Pencil, Star } from "lucide-react";
import { useSyncExternalStore } from "react";
import { Button, Image, Tooltip, Typography } from "antd";
import { useTranslation } from "react-i18next";

import { ImageGenerationPending } from "@/components/image-generation-pending";
import { formatBytes, formatDuration } from "@/lib/image-utils";
import { getImagePreviewRevision, previewUrlFor, subscribeImagePreviews } from "@/services/image-storage";
import { useWorkbenchLibraryStore } from "@/stores/use-workbench-library-store";
import { WorkbenchFolderPicker } from "./workbench-folder-picker";
import { cn } from "@/lib/utils";

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
    onSaveAsset?: (image: WorkbenchImage) => Promise<void>;
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
    const favorite = useWorkbenchLibraryStore((state) => state.favoriteIds.includes(image.id));
    const toggleFavorite = useWorkbenchLibraryStore((state) => state.toggleFavorite);
    const details = (
        <>
            <span className="truncate">
                {image.width}×{image.height} · {formatBytes(image.bytes)}
            </span>
            <span className="shrink-0 tabular-nums">{formatDuration(image.durationMs)}</span>
        </>
    );
    const detailsClass = "flex w-full items-center justify-between gap-2 px-2.5 py-2 !text-xs !leading-4 !text-stone-500 dark:!text-stone-400";
    const actionClass = "inline-flex size-7 cursor-pointer items-center justify-center rounded-lg !text-stone-500 transition-colors hover:bg-stone-200/70 dark:!text-stone-400 dark:hover:bg-stone-800";

    return (
        <div
            className={`group relative overflow-hidden rounded-2xl border bg-background transition ${active ? "border-stone-900 dark:border-stone-100" : "border-stone-200 hover:border-stone-400 dark:border-stone-800 dark:hover:border-stone-600"}`}
            data-workbench-image={image.id}
        >
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

            {onReplay ? (
                <button type="button" className={`${detailsClass} cursor-pointer text-left hover:bg-stone-50 dark:hover:bg-stone-900`} onClick={onReplay} aria-label={t("workbench.replayLog")}>
                    {details}
                </button>
            ) : (
                <div className={detailsClass}>{details}</div>
            )}

            {/* Keep all actions below the image, separate from preview and history replay. */}
            <div className="flex h-10 items-center justify-between border-t border-stone-100 bg-stone-50/70 px-2 dark:border-stone-800 dark:bg-stone-900/50">
                <div className="flex items-center gap-1">
                    <Tooltip title={t(favorite ? "imageWorkbench.unfavorite" : "imageWorkbench.favorite")}>
                        <button
                            type="button"
                            className={cn(actionClass, favorite && "!text-amber-500 dark:!text-amber-400")}
                            onClick={() => toggleFavorite(image.id)}
                            aria-label={t(favorite ? "imageWorkbench.unfavorite" : "imageWorkbench.favorite")}
                            aria-pressed={favorite}
                        >
                            <Star className="size-3.5" fill={favorite ? "currentColor" : "none"} />
                        </button>
                    </Tooltip>
                    <WorkbenchFolderPicker imageId={image.id} onSaveAsset={onSaveAsset ? () => onSaveAsset(image) : undefined} />
                </div>
                <div className="flex items-center gap-1">
                    {onAddToReferences ? (
                        <Tooltip title={t("imageWorkbench.addReference")}>
                            <button type="button" className={actionClass} onClick={() => onAddToReferences(image)} aria-label={t("imageWorkbench.addReference")}>
                                <Pencil className="size-3.5" />
                            </button>
                        </Tooltip>
                    ) : null}
                    {onDownload ? (
                        <Tooltip title={t("common.download")}>
                            <button type="button" className={actionClass} onClick={() => onDownload(image)} aria-label={t("common.download")}>
                                <Download className="size-3.5" />
                            </button>
                        </Tooltip>
                    ) : null}
                </div>
            </div>
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
