import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Brush, Check, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button, Input, Modal, Tooltip } from "antd";
import { useTranslation } from "react-i18next";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { useConfigStore } from "@/stores/use-config-store";
import { resolveTransferPresets, type TransferPreset } from "@/lib/canvas/transfer-presets";

type CanvasTransferPromptPopoverProps = {
    /** Applies the chosen prompt to the node's prompt input. */
    onApply: (prompt: string) => void;
    buttonClassName?: string;
    placement?: "topLeft" | "top" | "topRight";
};

/**
 * Pick a redraw prompt for a node. Built-in prompts can be edited and reset;
 * user prompts can be added and deleted. Everything persists in the config store.
 */
export function CanvasTransferPromptPopover({ onApply, buttonClassName, placement = "topLeft" }: CanvasTransferPromptPopoverProps) {
    const { t } = useTranslation();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const config = useConfigStore((state) => state.config);
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const buttonRef = useRef<HTMLSpanElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [buttonRect, setButtonRect] = useState<DOMRect | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [draft, setDraft] = useState("");
    const [adding, setAdding] = useState(false);
    const [newName, setNewName] = useState("");
    const [newPrompt, setNewPrompt] = useState("");

    const presets = resolveTransferPresets(config.transferPresetOverrides, config.transferCustomPresets);

    const updateOpen = (next: boolean) => {
        setOpen(next);
        if (!next) {
            setEditingId(null);
            setAdding(false);
        }
    };

    useEffect(() => {
        if (!open) return;
        const syncPosition = () => setButtonRect(buttonRef.current?.getBoundingClientRect() || null);
        const closeOnOutsidePointer = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
            if (document.querySelector(".ant-modal-root")?.contains(target)) return;
            setOpen(false);
            setEditingId(null);
            setAdding(false);
        };
        syncPosition();
        window.addEventListener("resize", syncPosition);
        window.addEventListener("scroll", syncPosition, true);
        window.addEventListener("pointerdown", closeOnOutsidePointer, true);
        return () => {
            window.removeEventListener("resize", syncPosition);
            window.removeEventListener("scroll", syncPosition, true);
            window.removeEventListener("pointerdown", closeOnOutsidePointer, true);
        };
    }, [open]);

    const saveOverride = (id: string, patch: { name?: string; prompt?: string }) => {
        updateConfig("transferPresetOverrides", { ...config.transferPresetOverrides, [id]: { ...config.transferPresetOverrides[id], ...patch } });
    };

    const resetPreset = (id: string) => {
        const next = { ...config.transferPresetOverrides };
        delete next[id];
        updateConfig("transferPresetOverrides", next);
    };

    const deletePreset = (id: string) => {
        updateConfig("transferCustomPresets", config.transferCustomPresets.filter((item) => item.id !== id));
    };

    const addPreset = () => {
        const name = newName.trim();
        const prompt = newPrompt.trim();
        if (!name || !prompt) return;
        updateConfig("transferCustomPresets", [...config.transferCustomPresets, { id: `transfer-custom-${Date.now()}`, name, prompt }]);
        setNewName("");
        setNewPrompt("");
        setAdding(false);
    };

    // 常驻 portal，内容按 open 挂载：这样关掉时 AnimatePresence 还能播退场。
    const panel = (
        <TransferPromptPortal
            open={open}
            buttonRect={buttonRect}
            panelRef={panelRef}
            placement={placement}
            theme={theme}
            presets={presets}
            editingId={editingId}
            draft={draft}
            onDraftChange={setDraft}
            onStartEdit={(preset) => {
                setEditingId(preset.id);
                setDraft(preset.prompt);
            }}
            onCancelEdit={() => setEditingId(null)}
            onSaveEdit={(preset) => {
                if (preset.builtIn) saveOverride(preset.id, { prompt: draft });
                else updateConfig("transferCustomPresets", config.transferCustomPresets.map((item) => (item.id === preset.id ? { ...item, prompt: draft } : item)));
                setEditingId(null);
            }}
            onReset={resetPreset}
            onDelete={deletePreset}
            onApply={(prompt) => {
                onApply(prompt);
                updateOpen(false);
            }}
            onAdd={() => setAdding(true)}
        />
    );

    return (
        <>
            <span ref={buttonRef} className="inline-flex min-w-0">
                <Tooltip title={t("transferPresets.title")}>
                    <Button
                        size="small"
                        type="text"
                        className={buttonClassName || "!h-10 !w-10 !min-w-10 shrink-0 !rounded-full !p-0"}
                        style={{ background: theme.node.fill, color: theme.node.text }}
                        icon={<Brush className="size-3.5" />}
                        onClick={() => updateOpen(!open)}
                        aria-label={t("transferPresets.title")}
                    />
                </Tooltip>
            </span>
            {panel}
            <Modal title={t("transferPresets.addTitle")} open={adding} onCancel={() => setAdding(false)} onOk={addPreset} okButtonProps={{ disabled: !newName.trim() || !newPrompt.trim() }} okText={t("transferPresets.add")} cancelText={t("common.cancel")} centered destroyOnHidden>
                <div className="space-y-3 pt-2">
                    <Input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder={t("transferPresets.namePlaceholder")} />
                    <Input.TextArea rows={4} value={newPrompt} onChange={(event) => setNewPrompt(event.target.value)} placeholder={t("transferPresets.promptPlaceholder")} />
                </div>
            </Modal>
        </>
    );
}

function TransferPromptPortal({
    open,
    buttonRect,
    panelRef,
    placement,
    theme,
    presets,
    editingId,
    draft,
    onDraftChange,
    onStartEdit,
    onCancelEdit,
    onSaveEdit,
    onReset,
    onDelete,
    onApply,
    onAdd,
}: {
    open: boolean;
    buttonRect: DOMRect | null;
    panelRef: RefObject<HTMLDivElement | null>;
    placement: CanvasTransferPromptPopoverProps["placement"];
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    presets: TransferPreset[];
    editingId: string | null;
    draft: string;
    onDraftChange: (value: string) => void;
    onStartEdit: (preset: TransferPreset) => void;
    onCancelEdit: () => void;
    onSaveEdit: (preset: TransferPreset) => void;
    onReset: (id: string) => void;
    onDelete: (id: string) => void;
    onApply: (prompt: string) => void;
    onAdd: () => void;
}) {
    const { t } = useTranslation();
    const reduce = useReducedMotion();
    const width = 380;
    const gap = 8;
    const margin = 12;
    if (!buttonRect) return null;
    const alignRight = placement?.endsWith("Right");
    const alignCenter = placement === "top";
    const left = alignCenter ? buttonRect.left + buttonRect.width / 2 - width / 2 : alignRight ? buttonRect.right - width : buttonRect.left;
    const style = {
        position: "fixed",
        zIndex: 1200,
        width,
        left: Math.max(margin, Math.min(window.innerWidth - width - margin, left)),
        bottom: window.innerHeight - buttonRect.top + gap,
        maxHeight: Math.max(260, buttonRect.top - margin * 2),
        background: theme.toolbar.panel,
        border: `1px solid ${theme.node.stroke}`,
        borderRadius: 18,
        boxShadow: "0 18px 54px rgba(28, 25, 23, 0.16)",
        padding: 14,
        overflowY: "auto",
        color: theme.node.text,
    } as const;

    return createPortal(
        <AnimatePresence>
            {open ? (
                <motion.div
                    ref={panelRef}
                    className="thin-scrollbar"
                    // 这个弹层是往上展开的，所以原点取底边、从下方一点点冒出来。
                    style={{ ...style, transformOrigin: `${alignRight ? "right" : "left"} bottom` }}
                    initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: 6 }}
                    animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
                    exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: 4 }}
                    transition={reduce ? { duration: 0.12 } : { type: "spring", stiffness: 420, damping: 30, mass: 0.7 }}
                    onPointerDown={(event) => event.stopPropagation()}
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={(event) => event.stopPropagation()}
                >
            <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-sm font-medium" style={{ color: theme.node.muted }}>
                    {t("transferPresets.select")}
                </span>
                <Button type="text" size="small" className="!h-7 !rounded-lg !px-2" style={{ color: theme.node.text }} icon={<Plus className="size-3.5" />} onClick={onAdd} aria-label={t("transferPresets.add")} />
            </div>
            <div className="grid gap-1">
                {presets.map((preset) => {
                    const editing = editingId === preset.id;
                    return (
                        <div key={preset.id} className="rounded-xl p-2" style={{ background: theme.node.fill }}>
                            <div className="flex items-center gap-2">
                                <span className="min-w-0 flex-1 truncate text-sm font-medium">{preset.name}</span>
                                <span className="shrink-0 text-[10px] opacity-50">{t(preset.builtIn ? "transferPresets.builtIn" : "transferPresets.custom")}</span>
                                {preset.builtIn ? null : (
                                    <button type="button" className="grid size-6 shrink-0 place-items-center rounded-md opacity-60 transition hover:opacity-100" onClick={() => onDelete(preset.id)} aria-label={t("transferPresets.delete")}>
                                        <Trash2 className="size-3.5" />
                                    </button>
                                )}
                                <button type="button" className="grid size-6 shrink-0 place-items-center rounded-md opacity-60 transition hover:opacity-100" onClick={() => (editing ? onCancelEdit() : onStartEdit(preset))} aria-label={t("transferPresets.edit")}>
                                    <Pencil className="size-3.5" />
                                </button>
                                <Button type="primary" size="small" className="!h-6 shrink-0 !rounded-md !px-2 !text-xs" onClick={() => onApply(preset.prompt)}>
                                    {t("transferPresets.apply")}
                                </Button>
                            </div>
                            {editing ? (
                                <div className="mt-2 space-y-2">
                                    <Input.TextArea rows={4} value={draft} onChange={(event) => onDraftChange(event.target.value)} placeholder={t("transferPresets.promptPlaceholder")} />
                                    <div className="flex items-center justify-end gap-2">
                                        {preset.builtIn ? (
                                            <Button size="small" type="text" className="!h-7 !rounded-md !px-2" icon={<RotateCcw className="size-3.5" />} onClick={() => onReset(preset.id)}>
                                                {t("transferPresets.reset")}
                                            </Button>
                                        ) : null}
                                        <Button size="small" type="primary" className="!h-7 !rounded-md !px-3" icon={<Check className="size-3.5" />} onClick={() => onSaveEdit(preset)}>
                                            {t("common.confirm")}
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <p className="mt-1 line-clamp-2 text-xs leading-5 opacity-60">{preset.prompt}</p>
                            )}
                        </div>
                    );
                })}
            </div>
                </motion.div>
            ) : null}
        </AnimatePresence>,
        document.body,
    );
}
