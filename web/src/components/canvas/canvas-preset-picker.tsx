import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, FastForward, Grid2x2, Grid3x3, LayoutTemplate, Package, Pencil, Plus, Rewind, ScanFace, Search, Sun, Trash2, UserRound } from "lucide-react";
import { Button, Input } from "antd";

import { canvasThemes } from "@/lib/canvas-theme";
import { onCanvasPopoverDismiss } from "@/lib/canvas/canvas-popover-dismiss";
import { BUILTIN_PROMPT_PRESETS, CUSTOM_PRESET_CATEGORY, PRESET_CATEGORY_ORDER, type BuiltinPromptPreset } from "@/lib/canvas/canvas-presets";
import { useThemeStore } from "@/stores/use-theme-store";
import { useConfigStore, type CanvasPromptPreset } from "@/stores/use-config-store";

type CanvasPresetPickerProps = {
    /** 选中预设后把提示词写回输入框。 */
    onApply: (prompt: string) => void;
};

type PresetRow = {
    id: string;
    name: string;
    description: string;
    category: string;
    prompt: string;
    builtin: boolean;
    icon?: ReactNode;
};

const newId = () => `canvas-preset-${Date.now()}`;

/** 按 id 给内置条目配图标，和上游工具条保持同一套语义。 */
const BUILTIN_ICONS: Record<string, ReactNode> = {
    "builtin-79": <Grid3x3 className="size-3.5" />,
    "builtin-80": <Grid2x2 className="size-3.5" />,
    "builtin-83": <Grid3x3 className="size-3.5" />,
    "builtin-81": <ScanFace className="size-3.5" />,
    "builtin-85": <UserRound className="size-3.5" />,
    "builtin-82": <Package className="size-3.5" />,
    "builtin-84": <Sun className="size-3.5" />,
    "builtin-86": <FastForward className="size-3.5" />,
    "builtin-87": <Rewind className="size-3.5" />,
};

/**
 * 画布「预设」：内置提示词模板 + 用户自己添加的模板。
 *
 * 交互与分组照着参考项目来 —— 面板头部一个入口，点开是带搜索的两列列表，
 * 按 分镜宫格 / 设定图 / 光影 / 画面推演 分组，每条显示名称和一句说明。
 * 内置条目的 prompt 直接取自上游数据文件，不在本地改写。
 */
export function CanvasPresetPicker({ onApply }: CanvasPresetPickerProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const customPresets = useConfigStore((state) => state.config.canvasPromptPresets) || [];
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

    const groups = useMemo(() => {
        const keyword = query.trim().toLowerCase();
        const builtin: PresetRow[] = BUILTIN_PROMPT_PRESETS.map((item: BuiltinPromptPreset) => ({
            id: item.id,
            name: item.name,
            description: item.description,
            category: item.category,
            prompt: item.prompt,
            builtin: true,
            icon: BUILTIN_ICONS[item.id] ?? <LayoutTemplate className="size-3.5" />,
        }));
        const custom: PresetRow[] = customPresets.map((item) => ({
            id: item.id,
            name: item.name,
            description: item.description || "",
            category: CUSTOM_PRESET_CATEGORY,
            prompt: item.prompt,
            builtin: false,
            icon: <LayoutTemplate className="size-3.5" />,
        }));
        const all = [...builtin, ...custom].filter((item) => !keyword || `${item.name} ${item.description} ${item.category}`.toLowerCase().includes(keyword));
        const order = [...PRESET_CATEGORY_ORDER, CUSTOM_PRESET_CATEGORY];
        return order
            .map((category) => ({ category, items: all.filter((item) => item.category === category) }))
            .filter((group) => group.items.length);
    }, [customPresets, query]);

    useEffect(() => {
        if (!open) return;
        const syncPosition = () => {
            setButtonRect(buttonRef.current?.getBoundingClientRect() || null);
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
        save([...customPresets, { id: newId(), name, prompt: promptText }]);
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
        save(customPresets.map((item) => (item.id === id ? { ...item, name, prompt: promptText } : item)));
        setEditingId(null);
    };

    const removePreset = (id: string) => save(customPresets.filter((item) => item.id !== id));

    return (
        <>
            <span ref={buttonRef} className="inline-flex min-w-0">
                <button type="button" className="atelier-head-action" aria-label="预设" title="打开提示词预设" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
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
                groups={groups}
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
    groups,
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
    groups: Array<{ category: string; items: PresetRow[] }>;
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
    const width = 460;
    const gap = 8;
    const margin = 12;
    if (!buttonRect) return null;
    const minLeft = (containerRect?.left ?? 0) + margin;
    const maxLeft = (containerRect?.right ?? window.innerWidth) - width - margin;
    const left = Math.max(Math.min(minLeft, maxLeft), Math.min(Math.max(minLeft, maxLeft), buttonRect.right - width));
    const style = {
        position: "fixed",
        zIndex: 1200,
        width,
        left,
        top: buttonRect.bottom + gap,
        maxHeight: Math.max(280, window.innerHeight - buttonRect.bottom - margin * 2),
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
                    style={{ ...style, transformOrigin: "right top" }}
                    initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -4 }}
                    animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
                    exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: -2 }}
                    transition={reduce ? { duration: 0.12 } : { type: "spring", stiffness: 420, damping: 30, mass: 0.7 }}
                    onPointerDown={(event) => event.stopPropagation()}
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={(event) => event.stopPropagation()}
                >
                    <div className="flex items-center gap-1.5 border-b px-2 py-1.5" style={{ borderColor: theme.node.stroke }}>
                        <Input size="small" variant="borderless" allowClear autoFocus value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="搜索预设" prefix={<Search className="size-3.5 opacity-60" />} />
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

                    <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-2 py-1">
                        {groups.length ? (
                            groups.map((group) => (
                                <section key={group.category} className="mb-1.5">
                                    <div className="atelier-preset-group-title">{group.category}</div>
                                    <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                                        {group.items.map((item) => {
                                            const editing = editingId === item.id;
                                            return editing ? (
                                                <div key={item.id} className="col-span-2 rounded-lg px-2 py-1.5" style={{ background: theme.node.fill }}>
                                                    <div className="space-y-1.5">
                                                        <Input size="small" value={draftName} onChange={(event) => onDraftName(event.target.value)} placeholder="预设名称" />
                                                        <Input.TextArea rows={3} value={draftPrompt} onChange={(event) => onDraftPrompt(event.target.value)} placeholder="提示词正文" />
                                                        <div className="flex justify-end gap-1.5">
                                                            <Button size="small" type="text" onClick={onCancelEdit}>
                                                                取消
                                                            </Button>
                                                            <Button size="small" type="primary" icon={<Check className="size-3.5" />} disabled={!draftName.trim() || !draftPrompt.trim()} onClick={() => onCommitEdit(item.id)}>
                                                                保存
                                                            </Button>
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div key={item.id} className="atelier-preset-item group" style={{ color: theme.node.text }}>
                                                    <button type="button" className="flex min-w-0 flex-1 items-start gap-2 text-left" onClick={() => onApply(item.prompt)} title={item.name}>
                                                        <span className="atelier-preset-item-icon" style={{ background: theme.node.fill }}>
                                                            {item.icon}
                                                        </span>
                                                        <span className="min-w-0 flex-1">
                                                            <span className="block truncate text-xs font-medium">{item.name}</span>
                                                            <span className="mt-0.5 block truncate text-[10.5px] opacity-55">{item.description}</span>
                                                        </span>
                                                    </button>
                                                    {item.builtin ? null : (
                                                        <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                                                            <button type="button" className="grid size-5 place-items-center rounded opacity-60 hover:opacity-100" aria-label="编辑预设" onClick={() => onStartEdit({ id: item.id, name: item.name, prompt: item.prompt })}>
                                                                <Pencil className="size-3" />
                                                            </button>
                                                            <button type="button" className="grid size-5 place-items-center rounded opacity-60 hover:opacity-100" aria-label="删除预设" onClick={() => onRemove(item.id)}>
                                                                <Trash2 className="size-3" />
                                                            </button>
                                                        </span>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </section>
                            ))
                        ) : (
                            <div className="px-3 py-8 text-center text-xs opacity-55">没有匹配的预设</div>
                        )}
                    </div>
                </motion.div>
            ) : null}
        </AnimatePresence>,
        document.body,
    );
}
