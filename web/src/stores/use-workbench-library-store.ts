import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { nanoid } from "nanoid";

import { normalizeFolderName, normalizeWorkbenchLibrary, removeLibraryFolder, toggleLibraryId, type WorkbenchLibraryData } from "@/lib/workbench-library";

type WorkbenchLibraryStore = WorkbenchLibraryData & {
    toggleFavorite: (imageId: string) => void;
    setImageFolder: (imageId: string, folderId: string, enabled: boolean) => void;
    createFolder: (name: string, imageId?: string) => string | undefined;
    renameFolder: (folderId: string, name: string) => boolean;
    removeFolder: (folderId: string) => void;
};

function legacyFavorites(): string[] {
    try {
        return normalizeWorkbenchLibrary({ favoriteIds: JSON.parse(localStorage.getItem("infinite-canvas:image_favorites") || "[]") }).favoriteIds;
    } catch {
        return [];
    }
}

export const useWorkbenchLibraryStore = create<WorkbenchLibraryStore>()(
    persist(
        (set, get) => ({
            favoriteIds: legacyFavorites(),
            folders: [],
            imageFolders: {},
            toggleFavorite: (imageId) => set((state) => ({ favoriteIds: toggleLibraryId(state.favoriteIds, imageId) })),
            setImageFolder: (imageId, folderId, enabled) =>
                set((state) => {
                    if (!state.folders.some((folder) => folder.id === folderId)) return state;
                    return { imageFolders: { ...state.imageFolders, [imageId]: toggleLibraryId(state.imageFolders[imageId] || [], folderId, enabled) } };
                }),
            createFolder: (value, imageId) => {
                const name = normalizeFolderName(value);
                if (!name) return;
                const existing = get().folders.find((folder) => folder.name.toLocaleLowerCase() === name.toLocaleLowerCase());
                const id = existing?.id || nanoid();
                const now = Date.now();
                set((state) => ({
                    folders: existing ? state.folders : [...state.folders, { id, name, createdAt: now, updatedAt: now }],
                    imageFolders: imageId ? { ...state.imageFolders, [imageId]: toggleLibraryId(state.imageFolders[imageId] || [], id, true) } : state.imageFolders,
                }));
                return id;
            },
            renameFolder: (id, value) => {
                const name = normalizeFolderName(value);
                if (!name || !get().folders.some((folder) => folder.id === id) || get().folders.some((folder) => folder.id !== id && folder.name.toLocaleLowerCase() === name.toLocaleLowerCase())) return false;
                set((state) => ({ folders: state.folders.map((folder) => (folder.id === id ? { ...folder, name, updatedAt: Date.now() } : folder)) }));
                return true;
            },
            removeFolder: (id) => set((state) => removeLibraryFolder(state, id)),
        }),
        {
            name: "infinite-canvas:image_library",
            storage: createJSONStorage(() => localStorage),
            version: 1,
            partialize: ({ favoriteIds, folders, imageFolders }) => ({ favoriteIds, folders, imageFolders }),
            merge: (persisted, current) => (persisted && typeof persisted === "object" ? { ...current, ...normalizeWorkbenchLibrary(persisted) } : current),
        },
    ),
);
