export type WorkbenchFolder = { id: string; name: string; createdAt: number; updatedAt: number };
export type WorkbenchLibraryData = {
    favoriteIds: string[];
    folders: WorkbenchFolder[];
    imageFolders: Record<string, string[]>;
};

export function normalizeFolderName(name: string) {
    return name.trim().replace(/\s+/g, " ").slice(0, 40);
}

export function toggleLibraryId(ids: string[], id: string, enabled = !ids.includes(id)) {
    return enabled ? Array.from(new Set([...ids, id])) : ids.filter((value) => value !== id);
}

export function normalizeWorkbenchLibrary(value: unknown): WorkbenchLibraryData {
    const data = value && typeof value === "object" ? (value as Partial<WorkbenchLibraryData>) : {};
    const favoriteIds = Array.isArray(data.favoriteIds) ? [...new Set(data.favoriteIds.filter((id): id is string => typeof id === "string" && Boolean(id)))] : [];
    const seen = new Set<string>();
    const folders: WorkbenchFolder[] = [];
    for (const folder of Array.isArray(data.folders) ? data.folders : []) {
        if (!folder || typeof folder.id !== "string" || !folder.id || typeof folder.name !== "string" || seen.has(folder.id)) continue;
        const name = normalizeFolderName(folder.name);
        if (!name) continue;
        seen.add(folder.id);
        folders.push({ id: folder.id, name, createdAt: Number(folder.createdAt) || 0, updatedAt: Number(folder.updatedAt) || 0 });
    }
    const assignments: Array<[string, string[]]> = [];
    if (data.imageFolders && typeof data.imageFolders === "object") {
        for (const [imageId, ids] of Object.entries(data.imageFolders)) {
            if (Array.isArray(ids)) assignments.push([imageId, [...new Set(ids.filter((id): id is string => typeof id === "string" && seen.has(id)))]]);
        }
    }
    return { favoriteIds, folders, imageFolders: Object.fromEntries(assignments) };
}

export function removeLibraryFolder(data: WorkbenchLibraryData, folderId: string): WorkbenchLibraryData {
    return {
        ...data,
        folders: data.folders.filter((folder) => folder.id !== folderId),
        imageFolders: Object.fromEntries(Object.entries(data.imageFolders).map(([id, folders]) => [id, folders.filter((folder) => folder !== folderId)])),
    };
}
