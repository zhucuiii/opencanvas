/**
 * 路由级懒加载的占位。只画一枚居中的细环，不做文字提示 ——
 * 分包后的首次加载通常只有几十毫秒，闪一下文案反而更扎眼。
 * 尺寸/配色走主题变量，深浅色都跟着走。
 */
export function RouteLoading() {
    return (
        <div className="flex h-full min-h-0 w-full items-center justify-center bg-background" aria-busy="true" aria-live="polite">
            <span className="route-loading-ring" />
        </div>
    );
}
