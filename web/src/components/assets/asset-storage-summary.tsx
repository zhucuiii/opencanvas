import { App, Button, Modal, Progress, Spin } from "antd";
import { BrushCleaning, HardDrive, Images, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { formatBytes } from "@/lib/image-utils";
import { cleanupUnusedImagesFromScan, scanUnusedImages, type UnusedImageStorage } from "@/services/image-storage";
import { cleanupUnusedMediaFromScan, scanUnusedMedia, type UnusedMediaStorage } from "@/services/file-storage";
import { localMediaUsage, readLocalStorageUsage, type LocalStorageUsage } from "@/services/local-storage-usage";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { useAssetStore } from "@/stores/use-asset-store";

type CleanupScan = {
    images: UnusedImageStorage;
    media: UnusedMediaStorage;
};

export function AssetStorageSummary() {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const assets = useAssetStore((state) => state.assets);
    const [usage, setUsage] = useState<LocalStorageUsage | null>(null);
    const [scan, setScan] = useState<CleanupScan | null>(null);
    const [loading, setLoading] = useState(false);
    const [scanning, setScanning] = useState(false);
    const [cleaning, setCleaning] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            setUsage(await readLocalStorageUsage());
        } catch {
            setUsage(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const media = localMediaUsage(usage?.databases[0]);
    const percent = usage?.quota ? Math.min(100, (usage.usage / usage.quota) * 100) : 0;
    const unusedCount = (scan?.images.keys.length ?? 0) + (scan?.media.keys.length ?? 0);
    const unusedBytes = (scan?.images.bytes ?? 0) + (scan?.images.previewBytes ?? 0) + (scan?.media.bytes ?? 0);

    const scanUnused = async () => {
        setScanning(true);
        try {
            // 画布、资产库和生成历史都在引用范围内，避免误删仍在使用的内容。
            const usedData = { projects: useCanvasStore.getState().projects, assets: useAssetStore.getState().assets };
            const [images, mediaScan] = await Promise.all([scanUnusedImages(usedData), scanUnusedMedia(usedData)]);
            setScan({ images, media: mediaScan });
            const count = images.keys.length + mediaScan.keys.length;
            const bytes = images.bytes + images.previewBytes + mediaScan.bytes;
            if (!count) message.success(t("assets.storage.noUnused"));
            else message.info(t("assets.storage.scanResult", { count, bytes: formatBytes(bytes) || "0 B" }));
        } catch {
            message.error(t("assets.storage.scanFailed"));
        } finally {
            setScanning(false);
        }
    };

    const cleanup = async () => {
        if (!scan) return;
        setCleaning(true);
        try {
            await Promise.all([cleanupUnusedImagesFromScan(scan.images), cleanupUnusedMediaFromScan(scan.media)]);
            message.success(t("assets.storage.cleaned", { count: unusedCount, bytes: formatBytes(unusedBytes) || "0 B" }));
            setConfirmOpen(false);
            setScan(null);
            await refresh();
        } catch {
            message.error(t("assets.storage.cleanupFailed"));
        } finally {
            setCleaning(false);
        }
    };

    return (
        <>
            <section className="rounded-2xl border border-stone-200/80 bg-background/75 px-4 py-3 shadow-sm backdrop-blur-sm dark:border-stone-800 dark:bg-stone-950/55">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-stone-100 text-stone-600 dark:bg-stone-900 dark:text-stone-300">
                            <HardDrive className="size-4" />
                        </span>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                                <span className="font-medium text-stone-900 dark:text-stone-100">{t("assets.storage.localUsage")}</span>
                                <span className="tabular-nums text-stone-500 dark:text-stone-400">{loading && !usage ? "…" : formatBytes(media.imageBytes + media.mediaBytes) || "0 B"}</span>
                                <span className="text-stone-400 dark:text-stone-500">·</span>
                                <span className="text-xs text-stone-500 dark:text-stone-400">{t("assets.storage.fileCounts", { images: media.images, media: media.media })}</span>
                                <span className="text-stone-400 dark:text-stone-500">·</span>
                                <span className="inline-flex items-center gap-1 text-xs text-stone-500 dark:text-stone-400">
                                    <Images className="size-3.5" />
                                    {t("assets.storage.assetCount", { count: assets.length })}
                                </span>
                            </div>
                            {usage?.quota ? (
                                <div className="mt-2 flex items-center gap-2">
                                    <Progress percent={percent} showInfo={false} size="small" className="!mb-0 max-w-56" strokeColor="#78716c" />
                                    <span className="text-[11px] tabular-nums text-stone-400">{t("assets.storage.quotaUsed", { percent: percent.toFixed(1) })}</span>
                                </div>
                            ) : null}
                        </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        <Button size="small" type="text" icon={<RefreshCw className="size-3.5" />} loading={loading} onClick={() => void refresh()}>
                            {t("assets.storage.refresh")}
                        </Button>
                        <Button size="small" icon={<BrushCleaning className="size-3.5" />} loading={scanning} onClick={() => void scanUnused()}>
                            {t("assets.storage.scan")}
                        </Button>
                        {scan ? (
                            <Button size="small" type="primary" disabled={!unusedCount} onClick={() => setConfirmOpen(true)}>
                                {t("assets.storage.cleanup", { count: unusedCount })}
                            </Button>
                        ) : null}
                    </div>
                </div>
                {scan ? (
                    <div className="mt-3 flex items-center justify-between gap-3 border-t border-stone-200/70 pt-2.5 text-xs dark:border-stone-800">
                        <span className="text-stone-500 dark:text-stone-400">{unusedCount ? t("assets.storage.readyToClean", { count: unusedCount, bytes: formatBytes(unusedBytes) || "0 B" }) : t("assets.storage.noUnused")}</span>
                        <button type="button" className="shrink-0 cursor-pointer text-stone-400 underline-offset-4 hover:text-stone-700 hover:underline dark:hover:text-stone-200" onClick={() => setScan(null)}>
                            {t("common.cancel")}
                        </button>
                    </div>
                ) : null}
            </section>
            <Modal
                title={t("assets.storage.confirmTitle")}
                open={confirmOpen}
                onCancel={() => setConfirmOpen(false)}
                onOk={() => void cleanup()}
                okText={t("assets.storage.confirmAction")}
                cancelText={t("common.cancel")}
                okButtonProps={{ danger: true, loading: cleaning }}
                destroyOnHidden
            >
                <div className="space-y-3 text-sm text-stone-600 dark:text-stone-300">
                    <p>{t("assets.storage.confirmDescription", { count: unusedCount, bytes: formatBytes(unusedBytes) || "0 B" })}</p>
                    <p className="text-xs text-stone-500 dark:text-stone-400">{t("assets.storage.confirmHint")}</p>
                    {cleaning ? (
                        <div className="flex items-center gap-2 text-xs text-stone-500">
                            <Spin size="small" />
                            {t("assets.storage.cleaning")}
                        </div>
                    ) : null}
                </div>
            </Modal>
        </>
    );
}
