type OutputConfig = {
    imageOutputFormat?: string;
    imageModeration?: string;
    background?: string;
};

export function imageOutputOptions(config: OutputConfig) {
    const format = config.imageOutputFormat === "jpeg" || config.imageOutputFormat === "webp" ? config.imageOutputFormat : "png";
    return {
        output_format: format,
        ...(config.imageModeration === "low" ? { moderation: "low" } : {}),
        ...(format !== "jpeg" && config.background === "transparent" ? { background: "transparent" } : {}),
    };
}

export function base64ImageSource(data: string, fallbackFormat = "png") {
    // Prefer the actual bytes: some compatible providers ignore output_format.
    const format = data.startsWith("/9j/") ? "jpeg" : data.startsWith("UklGR") ? "webp" : data.startsWith("iVBOR") ? "png" : fallbackFormat;
    return `data:image/${format};base64,${data}`;
}
