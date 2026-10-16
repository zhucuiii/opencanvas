/*
 * 挂在节点上的浮层（参数 / 质量 / 张数 / 转绘……）都是 portal 到 body 的 fixed 层，
 * 位置是打开那一刻按锚点量下来的快照。它们靠谁收起？靠 window 上那个
 * 「pointerdown 在浮层和锚点之外」的监听。而滚轮（LibTV 习惯下的平移、缩放）
 * 根本不派发 pointerdown，于是浮层既不收起、也停在原地 —— 画布一跑，
 * 它就跟芯片错开一整个位移量。
 *
 * 所以画布被滚轮推动时在这里喊一声，正打开的浮层自己收起。
 *
 * 刻意不做成「视口 state 一变就广播」：选中节点后的居中动画是逐帧改视口的，
 * 那样会把动画期间刚打开的浮层立刻关掉。
 */
type Handler = () => void;
const handlers = new Set<Handler>();

/** 画布被滚轮平移/缩放时喊一声，正在打开的浮层立刻收起。 */
export function dismissCanvasPopovers() {
    for (const handler of [...handlers]) handler();
}

/** 浮层打开期间订阅；返回取消订阅。 */
export function onCanvasPopoverDismiss(handler: Handler) {
    handlers.add(handler);
    return () => {
        handlers.delete(handler);
    };
}
