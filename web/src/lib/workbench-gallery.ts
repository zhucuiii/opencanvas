export type GalleryFilter = "all" | "success" | "pending" | "failed";

export function matchesGalleryFilter(status: string, text: string, filter: GalleryFilter, query: string) {
    return (filter === "all" || status === filter) && text.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
}

export function imageDownloadExtension(mimeType?: string) {
    if (mimeType === "image/jpeg") return "jpg";
    if (mimeType === "image/webp") return "webp";
    return "png";
}
