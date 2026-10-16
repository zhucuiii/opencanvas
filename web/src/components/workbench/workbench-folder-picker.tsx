import { useState } from "react";
import { Check, Folder, FolderPlus, LoaderCircle, Plus } from "lucide-react";
import { Dropdown, Input } from "antd";
import { useTranslation } from "react-i18next";

import { useExclusivePopover } from "@/components/ui/popover-group";
import { useWorkbenchLibraryStore } from "@/stores/use-workbench-library-store";

const EMPTY_IDS: string[] = [];

export function WorkbenchFolderPicker({ imageId, onSaveAsset }: { imageId: string; onSaveAsset?: () => Promise<void> }) {
    const { t } = useTranslation();
    const [open, setOpen] = useExclusivePopover();
    const [name, setName] = useState("");
    const [saving, setSaving] = useState(false);
    const folders = useWorkbenchLibraryStore((state) => state.folders);
    const assigned = useWorkbenchLibraryStore((state) => state.imageFolders[imageId]) || EMPTY_IDS;
    const setImageFolder = useWorkbenchLibraryStore((state) => state.setImageFolder);
    const createFolder = useWorkbenchLibraryStore((state) => state.createFolder);
    const createAndAssign = () => {
        if (createFolder(name, imageId)) setName("");
    };

    return (
        <Dropdown
            trigger={["click"]}
            placement="topLeft"
            open={open}
            onOpenChange={setOpen}
            transitionName="workbench-output-motion"
            popupRender={() => (
                <div className="w-64 max-w-[calc(100vw-32px)] rounded-2xl border border-stone-200 bg-white p-3 text-xs shadow-xl dark:border-stone-700 dark:bg-stone-900" onClick={(event) => event.stopPropagation()}>
                    <p className="mb-2 px-1 font-medium text-stone-700 dark:text-stone-200">{t("imageWorkbench.organizeImage")}</p>
                    <div className="max-h-48 space-y-1 overflow-y-auto" role="group" aria-label={t("imageWorkbench.folders")}>
                        {!folders.length ? <p className="px-1 py-3 leading-relaxed text-stone-400">{t("imageWorkbench.noFoldersHint")}</p> : null}
                        {folders.map((folder) => (
                            <button
                                key={folder.id}
                                type="button"
                                aria-label={t("imageWorkbench.folderAssignment", { name: folder.name })}
                                aria-pressed={assigned.includes(folder.id)}
                                className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-left !text-stone-600 hover:bg-stone-100 dark:!text-stone-300 dark:hover:bg-stone-800"
                                onClick={() => setImageFolder(imageId, folder.id, !assigned.includes(folder.id))}
                            >
                                <Folder className="size-3.5 shrink-0" />
                                <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                                {assigned.includes(folder.id) ? <Check className="size-3.5 shrink-0" /> : null}
                            </button>
                        ))}
                    </div>
                    <div className="mt-2 flex gap-1 border-t border-stone-200 pt-3 dark:border-stone-700">
                        <Input size="small" value={name} onChange={(event) => setName(event.target.value)} onPressEnter={createAndAssign} maxLength={40} placeholder={t("imageWorkbench.newFolder")} aria-label={t("imageWorkbench.newFolder")} />
                        <button
                            type="button"
                            className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-stone-100 !text-stone-600 disabled:opacity-30 dark:bg-stone-800 dark:!text-stone-200"
                            disabled={!name.trim()}
                            onClick={createAndAssign}
                            aria-label={t("imageWorkbench.createAndAssign")}
                        >
                            <Plus className="size-3.5" />
                        </button>
                    </div>
                    {onSaveAsset ? (
                        <button
                            type="button"
                            className="mt-3 flex w-full cursor-pointer items-center gap-2 border-t border-stone-200 px-1 pt-3 text-left !text-stone-500 disabled:opacity-40 dark:border-stone-700 dark:!text-stone-400"
                            disabled={saving}
                            onClick={async () => {
                                if (saving) return;
                                setSaving(true);
                                try {
                                    await onSaveAsset();
                                    setOpen(false);
                                } finally {
                                    setSaving(false);
                                }
                            }}
                        >
                            {saving ? <LoaderCircle className="size-3.5 animate-spin" /> : <FolderPlus className="size-3.5" />}
                            {t("common.addToAssets")}
                        </button>
                    ) : null}
                </div>
            )}
        >
            <button
                type="button"
                className={`inline-flex h-7 cursor-pointer items-center justify-center gap-1 rounded-lg px-1.5 transition-colors hover:bg-stone-200/70 dark:hover:bg-stone-800 ${assigned.length ? "!text-stone-800 dark:!text-stone-100" : "!text-stone-500 dark:!text-stone-400"}`}
                aria-label={t("imageWorkbench.organizeImage")}
                aria-expanded={open}
                title={
                    assigned.length
                        ? folders
                              .filter((folder) => assigned.includes(folder.id))
                              .map((folder) => folder.name)
                              .join(" / ")
                        : t("imageWorkbench.organizeImage")
                }
                onClick={(event) => event.stopPropagation()}
            >
                <FolderPlus className="size-3.5" />
                {assigned.length ? <span className="text-[10px] tabular-nums">{assigned.length}</span> : null}
            </button>
        </Dropdown>
    );
}
