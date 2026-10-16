import { useState } from "react";
import { Check, Folder, FolderPlus, Images, Pencil, Plus, Star, Trash2, X } from "lucide-react";
import { App, Drawer, Input } from "antd";
import { useTranslation } from "react-i18next";

import { useWorkbenchLibraryStore } from "@/stores/use-workbench-library-store";
import type { WorkbenchFolder } from "@/lib/workbench-library";

export type WorkbenchLibraryView = { kind: "all" } | { kind: "favorites" } | { kind: "folder"; id: string };

export function WorkbenchLibraryDrawer({ open, view, imageIds, mediaType = "image", onClose, onSelect }: { open: boolean; view: WorkbenchLibraryView; imageIds: string[]; mediaType?: "image" | "video"; onClose: () => void; onSelect: (view: WorkbenchLibraryView) => void }) {
    const { t } = useTranslation();
    const { message, modal } = App.useApp();
    const imageFoldersList = useWorkbenchLibraryStore((state) => state.folders);
    const videoFoldersList = useWorkbenchLibraryStore((state) => state.videoLibraryFolders);
    const folders = mediaType === "video" ? videoFoldersList : imageFoldersList;
    const favoriteIds = useWorkbenchLibraryStore((state) => state.favoriteIds);
    const imageFolders = useWorkbenchLibraryStore((state) => state.imageFolders);
    const videoFavoriteIds = useWorkbenchLibraryStore((state) => state.videoFavoriteIds);
    const videoFolders = useWorkbenchLibraryStore((state) => state.videoFolders);
    const createFolder = useWorkbenchLibraryStore((state) => state.createFolder);
    const renameFolder = useWorkbenchLibraryStore((state) => state.renameFolder);
    const removeFolder = useWorkbenchLibraryStore((state) => state.removeFolder);
    const createVideoFolder = useWorkbenchLibraryStore((state) => state.createVideoFolder);
    const renameVideoFolder = useWorkbenchLibraryStore((state) => state.renameVideoFolder);
    const removeVideoFolder = useWorkbenchLibraryStore((state) => state.removeVideoFolder);
    const [name, setName] = useState("");
    const [editing, setEditing] = useState<string | null>(null);
    const [editName, setEditName] = useState("");
    const select = (next: WorkbenchLibraryView) => {
        onSelect(next);
        onClose();
    };
    const favoriteSet = new Set(mediaType === "video" ? videoFavoriteIds : favoriteIds);
    const itemFolders = mediaType === "video" ? videoFolders : imageFolders;
    const commitRename = (id: string) => {
        if ((mediaType === "video" ? renameVideoFolder(id, editName) : renameFolder(id, editName))) setEditing(null);
        else message.warning(t("imageWorkbench.folderNameInvalid"));
    };
    const confirmDelete = (folder: WorkbenchFolder) =>
        modal.confirm({
            title: t("imageWorkbench.deleteFolder"),
            content: t("imageWorkbench.deleteFolderHint", { name: folder.name }),
            okText: t("common.delete"),
            cancelText: t("common.cancel"),
            okButtonProps: { danger: true },
            onOk: () => {
                if (mediaType === "video") removeVideoFolder(folder.id);
                else removeFolder(folder.id);
                if (view.kind === "folder" && view.id === folder.id) onSelect({ kind: "all" });
            },
        });
    const rowClass = (active: boolean) =>
        `flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition-colors ${active ? "bg-stone-100 !text-stone-900 dark:bg-stone-800 dark:!text-white" : "!text-stone-500 hover:bg-stone-50 dark:!text-stone-400 dark:hover:bg-stone-900"}`;
    const iconButtonClass = "flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-lg !text-stone-400 hover:bg-stone-100 hover:!text-stone-900 dark:hover:bg-stone-800 dark:hover:!text-white";

    return (
        <Drawer title={t("imageWorkbench.library")} open={open} onClose={onClose} size={340} styles={{ body: { padding: 16 } }}>
            <p className="mb-4 text-xs leading-relaxed text-stone-400">{t("imageWorkbench.libraryHint")}</p>
            <div className="space-y-1">
                <button type="button" className={rowClass(view.kind === "all")} onClick={() => select({ kind: "all" })}>
                    <Images className="size-4" />
                    <span className="flex-1">{t("imageWorkbench.allImages")}</span>
                    <span className="text-xs tabular-nums opacity-50">{imageIds.length}</span>
                </button>
                <button type="button" className={rowClass(view.kind === "favorites")} onClick={() => select({ kind: "favorites" })}>
                    <Star className="size-4 text-amber-500" />
                    <span className="flex-1">{t("imageWorkbench.starred")}</span>
                    <span className="text-xs tabular-nums opacity-50">{imageIds.filter((id) => favoriteSet.has(id)).length}</span>
                </button>
            </div>
            <div className="mb-2 mt-6 flex items-center justify-between px-3 text-xs text-stone-400">
                <span>{t("imageWorkbench.folders")}</span>
                <span>{folders.length}</span>
            </div>
            <div className="space-y-1">
                {!folders.length ? (
                    <div className="rounded-xl border border-dashed border-stone-200 px-4 py-6 text-center text-xs leading-relaxed text-stone-400 dark:border-stone-800">
                        <FolderPlus className="mx-auto mb-2 size-5" />
                        {t("imageWorkbench.noFoldersHint")}
                    </div>
                ) : null}
                {folders.map((folder) => (
                    <div key={folder.id} className="flex min-w-0 items-center gap-1">
                        {editing === folder.id ? (
                            <div className="flex min-w-0 flex-1 items-center gap-1 px-1 py-1.5">
                                <Input autoFocus size="small" value={editName} maxLength={40} onChange={(event) => setEditName(event.target.value)} onPressEnter={() => commitRename(folder.id)} aria-label={t("imageWorkbench.renameFolder")} />
                                <button type="button" className={iconButtonClass} onClick={() => commitRename(folder.id)} aria-label={t("imageWorkbench.saveFolderName")}>
                                    <Check className="size-3.5" />
                                </button>
                                <button type="button" className={iconButtonClass} onClick={() => setEditing(null)} aria-label={t("common.cancel")}>
                                    <X className="size-3.5" />
                                </button>
                            </div>
                        ) : (
                            <>
                                <button type="button" className={`${rowClass(view.kind === "folder" && view.id === folder.id)} min-w-0 flex-1`} onClick={() => select({ kind: "folder", id: folder.id })}>
                                    <Folder className="size-4 shrink-0" />
                                    <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                    <span className="text-xs tabular-nums opacity-50">{imageIds.filter((id) => itemFolders[id]?.includes(folder.id)).length}</span>
                                </button>
                                <button
                                    type="button"
                                    className={iconButtonClass}
                                    onClick={() => {
                                        setEditing(folder.id);
                                        setEditName(folder.name);
                                    }}
                                    aria-label={t("imageWorkbench.renameNamedFolder", { name: folder.name })}
                                >
                                    <Pencil className="size-3.5" />
                                </button>
                                <button type="button" className={iconButtonClass} onClick={() => confirmDelete(folder)} aria-label={t("imageWorkbench.deleteNamedFolder", { name: folder.name })}>
                                    <Trash2 className="size-3.5" />
                                </button>
                            </>
                        )}
                    </div>
                ))}
            </div>
            <div className="mt-4 flex items-center gap-2 border-t border-stone-200 pt-4 dark:border-stone-800">
                <Input
                    placeholder={t("imageWorkbench.newFolder")}
                    aria-label={t("imageWorkbench.newFolder")}
                    value={name}
                    maxLength={40}
                    onChange={(event) => setName(event.target.value)}
                    onPressEnter={() => {
                        if ((mediaType === "video" ? createVideoFolder(name) : createFolder(name))) setName("");
                    }}
                />
                <button
                    type="button"
                    className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-stone-900 !text-white disabled:opacity-30 dark:bg-stone-100 dark:!text-stone-900"
                    disabled={!name.trim()}
                    onClick={() => {
                        if ((mediaType === "video" ? createVideoFolder(name) : createFolder(name))) setName("");
                    }}
                    aria-label={t("imageWorkbench.newFolder")}
                >
                    <Plus className="size-4" />
                </button>
            </div>
        </Drawer>
    );
}
