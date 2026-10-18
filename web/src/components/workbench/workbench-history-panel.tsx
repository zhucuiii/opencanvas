import { useEffect, useRef, type MutableRefObject } from "react";
import { CheckSquare, Plus, Trash2 } from "lucide-react";
import { Button, Checkbox, Tag } from "antd";
import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";

import { formatDuration } from "@/lib/image-utils";
import { getImagePreviewRevision, previewUrlFor, subscribeImagePreviews } from "@/services/image-storage";

/** 面板只用到这些字段，调用方的完整记录类型只要满足它就行（不要求是同一个类型）。 */
export type WorkbenchLogLike = {
    id: string;
    title: string;
    time?: string;
    successCount?: number;
    failCount?: number;
    imageCount: number;
    durationMs: number;
    images: { id: string; dataUrl: string; storageKey?: string }[];
};

type WorkbenchHistoryPanelProps<T extends WorkbenchLogLike> = {
    logs: T[];
    selectedLogIds: string[];
    activeLogId?: string;
    onSelectedLogIdsChange: (ids: string[]) => void;
    onCreateSession: () => void;
    onDeleteSelected: () => void;
    onPreviewLog: (log: T) => void;
    /** 点面板外面时关闭自己。锚定面板必须挂在某个按钮旁边，所以这个由调用方给。 */
    onDismiss?: () => void;
    /** 触发按钮的容器：点它不算「点到面板外面」，否则点按钮就永远关不掉。 */
    anchorRef?: MutableRefObject<HTMLDivElement | null>;
};

/*
 * 生成记录面板：从触发按钮下方锚定弹出的一小块，不是全屏弹窗。
 * 尺寸取参考项目实测值（320 / 384 宽、70vh 高）。
 * 内容本身和原来的 LogPanel 一样，只换了外壳。
 */
export function WorkbenchHistoryPanel<T extends WorkbenchLogLike>({ logs, selectedLogIds, activeLogId, onSelectedLogIdsChange, onCreateSession, onDeleteSelected, onPreviewLog, onDismiss, anchorRef }: WorkbenchHistoryPanelProps<T>) {
    const { t } = useTranslation();
    const innerRef = useRef<HTMLDivElement>(null);
    const allSelected = Boolean(logs.length) && selectedLogIds.length === logs.length;
    const toggleAll = () => onSelectedLogIdsChange(allSelected ? [] : logs.map((log) => log.id));

    // 点面板外面关闭。用 pointerdown 捕获阶段，和项目里其他浮层一致。
    useEffect(() => {
        if (!onDismiss) return;
        const handle = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (anchorRef?.current?.contains(target) || innerRef.current?.contains(target)) return;
            onDismiss();
        };
        document.addEventListener("pointerdown", handle, true);
        return () => document.removeEventListener("pointerdown", handle, true);
    }, [onDismiss, anchorRef]);

    return (
        <div
            ref={innerRef}
            className="fixed top-32 right-4 left-4 z-50 max-h-[70vh] max-w-[calc(100vw-32px)] overflow-y-auto rounded-xl border border-stone-200 bg-white p-3 shadow-2xl sm:absolute sm:top-12 sm:right-0 sm:left-auto sm:w-96 dark:border-[#303034] dark:bg-[#19191b] dark:shadow-[0_18px_54px_rgba(0,0,0,0.56)]"
        >
            <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold">{t("workbench.logs")}</h2>
                <Tag className="m-0">{logs.length}</Tag>
            </div>
            <div className="mb-3 flex flex-wrap gap-2">
                <Button size="small" icon={<Plus className="size-3.5" />} onClick={onCreateSession}>
                    {t("workbench.new")}
                </Button>
                <Button size="small" icon={<CheckSquare className="size-3.5" />} disabled={!logs.length} onClick={toggleAll}>
                    {allSelected ? t("common.cancel") : t("workbench.selectAll")}
                </Button>
                <Button size="small" danger icon={<Trash2 className="size-3.5" />} disabled={!selectedLogIds.length} onClick={onDeleteSelected}>
                    {t("common.delete")}
                </Button>
            </div>
            <div className="space-y-2">
                {logs.map((log) => (
                    <HistoryCard
                        key={log.id}
                        log={log}
                        selected={selectedLogIds.includes(log.id)}
                        active={activeLogId === log.id}
                        onSelectedChange={(checked) => onSelectedLogIdsChange(checked ? [...selectedLogIds, log.id] : selectedLogIds.filter((id) => id !== log.id))}
                        onClick={() => onPreviewLog(log)}
                    />
                ))}
                {!logs.length ? <div className="flex min-h-32 items-center justify-center rounded-lg border border-dashed border-stone-300 text-center text-sm text-stone-500 dark:border-stone-700">{t("workbench.noLogs")}</div> : null}
            </div>
        </div>
    );
}

function HistoryCard<T extends WorkbenchLogLike>({ log, selected, active, onSelectedChange, onClick }: { log: T; selected: boolean; active: boolean; onSelectedChange: (checked: boolean) => void; onClick: () => void }) {
    const { t } = useTranslation();
    // blob URL 会被浏览器回收，预览修订号变了必须重渲染，否则缩略图变空。
    useSyncExternalStore(subscribeImagePreviews, getImagePreviewRevision);
    const thumbnails = log.images.filter((image) => image.dataUrl).slice(0, 4);

    return (
        <button
            type="button"
            className={`block w-full rounded-lg border p-2 text-left transition ${active ? "border-stone-900 bg-stone-100 dark:border-stone-100 dark:bg-stone-800" : "border-stone-200 bg-background hover:bg-stone-50 dark:border-stone-800 dark:hover:bg-stone-900"}`}
            onClick={onClick}
        >
            <div className="flex min-w-0 items-start gap-2">
                <Checkbox className="mt-0.5" checked={selected} onClick={(event) => event.stopPropagation()} onChange={(event) => onSelectedChange(event.target.checked)} />
                <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold leading-5">{log.title}</div>
                    {thumbnails.length ? (
                        <div className="mt-1.5 flex gap-1 overflow-hidden">
                            {thumbnails.map((image) => (
                                <img key={image.id} src={previewUrlFor(image.storageKey) || image.dataUrl} alt="" loading="lazy" className="size-8 shrink-0 rounded-md object-cover" />
                            ))}
                        </div>
                    ) : null}
                    <div className="mt-1.5 flex flex-wrap gap-1">
                        <Tag className="m-0 !px-1.5 !text-[10px] !leading-4" color="blue">
                            {t("workbench.successCount", { count: log.successCount ?? log.imageCount })}
                        </Tag>
                        <Tag className="m-0 !px-1.5 !text-[10px] !leading-4">{t("workbench.itemCount", { count: log.imageCount })}</Tag>
                        <Tag className="m-0 !px-1.5 !text-[10px] !leading-4" color="green">
                            {formatDuration(log.durationMs)}
                        </Tag>
                    </div>
                </div>
            </div>
        </button>
    );
}
