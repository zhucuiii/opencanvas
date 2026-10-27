import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, LayoutTemplate, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Button, Input } from "antd";

import { canvasThemes } from "@/lib/canvas-theme";
import { onCanvasPopoverDismiss } from "@/lib/canvas/canvas-popover-dismiss";
import { useThemeStore } from "@/stores/use-theme-store";
import { useConfigStore, type CanvasPromptPreset } from "@/stores/use-config-store";

type CanvasPresetPickerProps = {
    /** 选中预设后把提示词写回输入框。 */
    onApply: (prompt: string) => void;
    /** 面板顶部按钮样式；头部动作条用 quiet。 */
    variant?: "header" | "footer";
};

const newId = () => `canvas-preset-${Date.now()}`;

/**
 * 画布「预设」：用户自己维护的提示词模板。
 *
 * 交互照着参考项目那套来 —— 按钮在面板头部，点开是一个带搜索的列表，
 * 每条显示名称、类型标签和一句说明，点一下就把提示词填进输入框。
 * 不预置任何内容：条目全部来自用户自己添加（存本地配置）。
 */
export function CanvasPresetPicker({ onApply, variant = "header" }: CanvasPresetPickerProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const presets = useConfigStore((state) => state.config.canvasPromptPresets) || [];
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const buttonRef = useRef<HTMLSpanElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [buttonRect, setButtonRect] = useState<DOMRect | null>(null);
    const [containerRect, setContainerRect] = useState<DOMRect | null>(null);
    const [query, setQuery] = useState("");
    const [editingId, setEditingId] = useState<string | null>(null);
    const [draftName, setDraftName] = useState("");
    const [draftPrompt, setDraftPrompt] = useState("");
    const [adding, setAdding] = useState(false);

    const filtered = useMemo(() => {
        const keyword = query.trim().toLowerCase();
        if (!keyword) return presets;
        return presets.filter((item) => `${item.name} ${item.description ?? ""} ${item.prompt}`.toLowerCase().includes(keyword));
    }, [presets, query]);

    useEffect(() => {
        if (!open) return;
        const syncPosition = () => {
            setButtonRect(buttonRef.current?.getBoundingClientRect() || null);
            // 面板边界：弹层只在这个范围内展开，别飘到画布上去。
            setContainerRect(buttonRef.current?.closest(".atelier-prompt-panel")?.getBoundingClientRect() || null);
        };
        const closeOnOutsidePointer = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
            if (document.querySelector(".ant-modal-root")?.contains(target)) return;
            setOpen(false);
            setAdding(false);
            setEditingId(null);
        };
        syncPosition();
        const stopDismissing = onCanvasPopoverDismiss(() => setOpen(false));
        window.addEventListener("resize", syncPosition);
        window.addEventListener("scroll", syncPosition, true);
        window.addEventListener("pointerdown", closeOnOutsidePointer, true);
        return () => {
            stopDismissing();
            window.removeEventListener("resize", syncPosition);
            window.removeEventListener("scroll", syncPosition, true);
            window.removeEventListener("pointerdown", closeOnOutsidePointer, true);
        };
    }, [open]);

    const save = (list: CanvasPromptPreset[]) => updateConfig("canvasPromptPresets", list);

    const addPreset = () => {
        const name = draftName.trim();
        const promptText = draftPrompt.trim();
        if (!name || !promptText) return;
        save([...presets, { id: newId(), name, prompt: promptText }]);
        setDraftName("");
        setDraftPrompt("");
        setAdding(false);
    };

    const startEdit = (preset: CanvasPromptPreset) => {
        setEditingId(preset.id);
        setDraftName(preset.name);
        setDraftPrompt(preset.prompt);
    };

    const commitEdit = (id: string) => {
        const name = draftName.trim();
        const promptText = draftPrompt.trim();
        if (!name || !promptText) return;
        save(presets.map((item) => (item.id === id ? { ...item, name, prompt: promptText } : item)));
        setEditingId(null);
    };

    const removePreset = (id: string) => save(presets.filter((item) => item.id !== id));

    return (
        <>
            <span ref={buttonRef} className="inline-flex min-w-0">
                <button
                    type="button"
                    className={variant === "header" ? "atelier-head-action" : "atelier-library-trigger"}
                    aria-label="预设"
                    title="打开提示词预设"
                    aria-expanded={open}
                    onClick={() => setOpen((current) => !current)}
                >
                    <LayoutTemplate className="size-3.5" />
                    <span>预设</span>
                </button>
            </span>
            <PresetPortal
                open={open}
                buttonRect={buttonRect}
                containerRect={containerRect}
                panelRef={panelRef}
                theme={theme}
                presets={filtered}
                total={presets.length}
                query={query}
                onQueryChange={setQuery}
                adding={adding}
                onStartAdd={() => {
                    setAdding(true);
                    setEditingId(null);
                    setDraftName("");
                    setDraftPrompt("");
                }}
                onCancelAdd={() => setAdding(false)}
                editingId={editingId}
                draftName={draftName}
                draftPrompt={draftPrompt}
                onDraftName={setDraftName}
                onDraftPrompt={setDraftPrompt}
                onAdd={addPreset}
                onStartEdit={startEdit}
                onCommitEdit={commitEdit}
                onCancelEdit={() => setEditingId(null)}
                onRemove={removePreset}
                onApply={(promptText) => {
                    onApply(promptText);
                    setOpen(false);
                }}
            />
        </>
    );
}

function PresetPortal({
    open,
    buttonRect,
    containerRect,
    panelRef,
    theme,
    presets,
    total,
    query,
    onQueryChange,
    adding,
    onStartAdd,
    onCancelAdd,
    editingId,
    draftName,
    draftPrompt,
    onDraftName,
    onDraftPrompt,
    onAdd,
    onStartEdit,
    onCommitEdit,
    onCancelEdit,
    onRemove,
    onApply,
}: {
    open: boolean;
    buttonRect: DOMRect | null;
    containerRect: DOMRect | null;
    panelRef: RefObject<HTMLDivElement | null>;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    presets: CanvasPromptPreset[];
    total: number;
    query: string;
    onQueryChange: (value: string) => void;
    adding: boolean;
    onStartAdd: () => void;
    onCancelAdd: () => void;
    editingId: string | null;
    draftName: string;
    draftPrompt: string;
    onDraftName: (value: string) => void;
    onDraftPrompt: (value: string) => void;
    onAdd: () => void;
    onStartEdit: (preset: CanvasPromptPreset) => void;
    onCommitEdit: (id: string) => void;
    onCancelEdit: () => void;
    onRemove: (id: string) => void;
    onApply: (prompt: string) => void;
}) {
    const reduce = useReducedMotion();
    const width = 340;
    const gap = 8;
    const margin = 12;
    if (!buttonRect) return null;
    // 右边缘贴齐按钮右边缘，再夹在面板范围内：按钮在面板右上角，左对齐会戳出去。
    const minLeft = (containerRect?.left ?? 0) + margin;
    const maxLeft = (containerRect?.right ?? window.innerWidth) - width - margin;
    const left = Math.max(minLeft, Math.min(maxLeft, buttonRect.right - width));
    const style = {
        position: "fixed",
        zIndex: 1200,
        width,
        left,
        // 按钮在面板头部，弹层向下展开。
        top: buttonRect.bottom + gap,
        maxHeight: Math.max(240, window.innerHeight - buttonRect.bottom - margin * 2),
        background: theme.toolbar.panel,
        border: `1px solid ${theme.node.stroke}`,
        borderRadius: 16,
        boxShadow: "0 18px 54px rgba(0, 0, 0, 0.42)",
        overflow: "hidden",
        color: theme.node.text,
        display: "flex",
        flexDirection: "column" as const,
    } as const;

    return createPortal(
        <AnimatePresence>
            {open ? (
                <motion.div
                    ref={panelRef}
                    className="thin-scrollbar"
                    style={{ ...style, transformOrigin: "left top" }}
                    initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -4 }}
                    animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
                    exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: -2 }}
                    transition={reduce ? { duration: 0.12 } : { type: "spring", stiffness: 420, damping: 30, mass: 0.7 }}
                    onPointerDown={(event) => event.stopPropagation()}
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={(event) => event.stopPropagation()}
                >
                    <div className="flex items-center gap-1.5 border-b px-2 py-1.5" style={{ borderColor: theme.node.stroke }}>
                        <Input
                            size="small"
                            variant="borderless"
                            allowClear
                            autoFocus
                            value={query}
                            onChange={(event) => onQueryChange(event.target.value)}
                            placeholder="搜索预设"
                            prefix={<Search className="size-3.5 opacity-60" />}
                        />
                        <Button type="text" size="small" className="!h-6 !w-6 !min-w-6 !rounded-md" icon={<Plus className="size-3.5" />} onClick={onStartAdd} aria-label="添加预设" title="添加预设" />
                    </div>

                    {adding ? (
                        <div className="space-y-1.5 border-b px-2 py-2" style={{ borderColor: theme.node.stroke }}>
                            <Input size="small" value={draftName} onChange={(event) => onDraftName(event.target.value)} placeholder="预设名称" />
                            <Input.TextArea rows={3} value={draftPrompt} onChange={(event) => onDraftPrompt(event.target.value)} placeholder="提示词正文" />
                            <div className="flex justify-end gap-1.5">
                                <Button size="small" type="text" onClick={onCancelAdd}>
                                    取消
                                </Button>
                                <Button size="small" type="primary" disabled={!draftName.trim() || !draftPrompt.trim()} onClick={onAdd}>
                                    保存
                                </Button>
                            </div>
                        </div>
                    ) : null}

                    <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-1">
                        {presets.length ? (
                            presets.map((preset) => {
                                const editing = editingId === preset.id;
                                return (
                                    <div key={preset.id} className="rounded-lg px-2 py-1.5" style={{ background: editing ? theme.node.fill : "transparent" }}>
                                        {editing ? (
                                            <div className="space-y-1.5">
                                                <Input size="small" value={draftName} onChange={(event) => onDraftName(event.target.value)} placeholder="预设名称" />
                                                <Input.TextArea rows={3} value={draftPrompt} onChange={(event) => onDraftPrompt(event.target.value)} placeholder="提示词正文" />
                                                <div className="flex justify-end gap-1.5">
                                                    <Button size="small" type="text" onClick={onCancelEdit}>
                                                        取消
                                                    </Button>
                                                    <Button size="small" type="primary" icon={<Check className="size-3.5" />} disabled={!draftName.trim() || !draftPrompt.trim()} onClick={() => onCommitEdit(preset.id)}>
                                                        保存
                                                    </Button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="group flex items-start gap-2">
                                                <button type="button" className="flex min-w-0 flex-1 items-start gap-2 text-left" onClick={() => onApply(preset.prompt)}>
                                                    <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md" style={{ background: theme.node.fill, color: theme.node.text }}>
                                                        <LayoutTemplate className="size-3.5" />
                                                    </span>
                                                    <span className="min-w-0 flex-1">
                                                        <span className="block truncate text-xs font-semibold">{preset.name}</span>
                                                        {preset.description ? <span className="mt-0.5 block truncate text-[11px] opacity-60">{preset.description}</span> : null}
                                                        <span className="mt-0.5 block truncate text-[11px] opacity-45">{preset.prompt}</span>
                                                    </span>
                                                </button>
                                                <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                                                    <button type="button" className="grid size-5 place-items-center rounded opacity-60 hover:opacity-100" aria-label="编辑预设" onClick={() => onStartEdit(preset)}>
                                                        <Pencil className="size-3" />
                                                    </button>
                                                    <button type="button" className="grid size-5 place-items-center rounded opacity-60 hover:opacity-100" aria-label="删除预设" onClick={() => onRemove(preset.id)}>
                                                        <Trash2 className="size-3" />
                                                    </button>
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        ) : (
                            <div className="px-3 py-8 text-center text-xs opacity-55">{total ? "没有匹配的预设" : "还没有预设，点右上角 + 添加"}</div>
                        )}
                    </div>
                </motion.div>
            ) : null}
        </AnimatePresence>,
        document.body,
    );
}
