/** Local references always need inline data; public URLs can be kept for scripts. */
export function canSendReferenceUrl(source: string, forceBase64 = false) {
    return !forceBase64 && /^https?:\/\//i.test(source);
}
