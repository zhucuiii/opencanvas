/*
 * 节点形变期间，连线要逐帧重算路径。
 *
 * 这里刻意不走 React state：早先的做法是页面每帧 setState 一次当信号，
 * 结果整页每帧重渲染，形变看着就卡（实测 5 帧超过 20ms、最长 39.9ms）。
 * 改成一个小的事件总线：页面在节点尺寸变化时喊一声，订阅者（各条连线）
 * 在同一个 rAF 循环里各自改自己的 path，React 完全不参与。
 */

type Listener = () => void;

const listeners = new Set<Listener>();
let frame = 0;
let deadline = 0;

/** 订阅者每帧被调一次，用来把自己的路径重算到节点当前的实际尺寸上。 */
export function subscribeConnectionMorph(listener: Listener) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

/**
 * 喊一声「节点开始形变了」，接下来的 duration 毫秒里每帧通知一次订阅者。
 * 已经在跑就只把截止时间往后推，不重复起循环。
 */
export function startConnectionMorph(duration = 400) {
    deadline = performance.now() + duration;
    if (frame) return;
    const step = () => {
        for (const listener of listeners) listener();
        if (performance.now() >= deadline) {
            frame = 0;
            return;
        }
        frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
}
