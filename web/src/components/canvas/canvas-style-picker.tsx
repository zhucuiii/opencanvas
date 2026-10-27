import { useMemo, useState } from "react";
import { Check, Palette, Pencil, Plus, Trash2 } from "lucide-react";
import { Button, Input, Modal } from "antd";

import { useConfigStore, type CanvasStylePreset } from "@/stores/use-config-store";

type CanvasStylePickerProps = {
    /** 选中风格后，把该风格的提示词追加到输入框。 */
    onApply: (prompt: string) => void;
    variant?: "header" | "footer";
};

const newId = () => `canvas-style-${Date.now()}`;

const SWATCHES = ["#d9c7a8", "#c9b7d6", "#a8c7d9", "#c7d9a8", "#d9a8a8", "#b7b7b7"];

/**
 * 画布「风格」：用户自己维护的视觉风格库。
 *
 * 交互照着参考项目那套 —— 按钮在面板头部，点开是一个弹窗，里面用卡片网格
 * 铺开所有风格，选一个就把它的提示词插进输入框。
 * 不预置任何内容：条目全部来自用户自己添加（存本地配置）。
 */
export function CanvasStylePicker({ onApply, variant = "header" }: CanvasStylePickerProps) {
    const styles = useConfigStore((state) => state.config.canvasStylePresets) || [];
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const [open, setOpen] = useState(false);
    const [adding, setAdding] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [draftName, setDraftName] = useState("");
    const [draftPrompt, setDraftPrompt] = useState("");
    const [draftColor, setDraftColor] = useState(SWATCHES[0]);

    const save = (list: CanvasStylePreset[]) => updateConfig("canvasStylePresets", list);

    const resetDraft = () => {
        setDraftName("");
        setDraftPrompt("");
        setDraftColor(SWATCHES[0]);
    };

    const openPicker = () => {
        setOpen(true);
        setAdding(false);
        setEditingId(null);
        resetDraft();
    };

    const addStyle = () => {
        const name = draftName.trim();
        const promptText = draftPrompt.trim();
        if (!name || !promptText) return;
        save([...styles, { id: newId(), name, prompt: promptText, color: draftColor }]);
        resetDraft();
        setAdding(false);
    };

    const startEdit = (item: CanvasStylePreset) => {
        setEditingId(item.id);
        setAdding(false);
        setDraftName(item.name);
        setDraftPrompt(item.prompt);
        setDraftColor(item.color || SWATCHES[0]);
    };

    const commitEdit = (id: string) => {
        const name = draftName.trim();
        const promptText = draftPrompt.trim();
        if (!name || !promptText) return;
        save(styles.map((item) => (item.id === id ? { ...item, name, prompt: promptText, color: draftColor } : item)));
        setEditingId(null);
        resetDraft();
    };

    const remove = (id: string) => save(styles.filter((item) => item.id !== id));

    const form = (
        <div className="space-y-2 rounded-lg border border-stone-200 p-2.5 dark:border-stone-800">
            <Input size="small" value={draftName} onChange={(event) => setDraftName(event.target.value)} placeholder="风格名称，例如：水彩" maxLength={24} />
            <Input.TextArea rows={3} value={draftPrompt} onChange={(event) => setDraftPrompt(event.target.value)} placeholder="这个风格的提示词，例如：水彩画质感，柔和晕染，纸张纹理" />
            <div className="flex items-center gap-1.5">
                {SWATCHES.map((color) => (
                    <button key={color} type="button" className="size-5 rounded-full border-2" style={{ background: color, borderColor: draftColor === color ? "#fff" : "transparent" }} aria-label={`色块 ${color}`} onClick={() => setDraftColor(color)} />
                ))}
                <span className="flex-1" />
                <Button
                    size="small"
                    type="text"
                    onClick={() => {
                        setAdding(false);
                        setEditingId(null);
                        resetDraft();
                    }}
                >
                    取消
                </Button>
                <Button size="small" type="primary" icon={<Check className="size-3.5" />} disabled={!draftName.trim() || !draftPrompt.trim()} onClick={() => (editingId ? commitEdit(editingId) : addStyle())}>
                    保存
                </Button>
            </div>
        </div>
    );

    const body = useMemo(
        () => (
            <div className="space-y-3">
                {adding || editingId ? (
                    form
                ) : (
                    <Button size="small" type="dashed" block icon={<Plus className="size-3.5" />} onClick={() => setAdding(true)}>
                        添加风格
                    </Button>
                )}
                {styles.length ? (
                    <div className="grid max-h-[52vh] grid-cols-2 gap-2 overflow-y-auto thin-scrollbar sm:grid-cols-3">
                        {styles.map((item) => (
                            <div key={item.id} className="group overflow-hidden rounded-xl border border-stone-200 dark:border-stone-800">
                                <button type="button" className="block w-full text-left" onClick={() => { onApply(item.prompt); setOpen(false); }} title={`应用：${item.name}`}>
                                    <span className="block h-14 w-full" style={{ background: item.color || SWATCHES[0] }} />
                                    <span className="block px-2 py-1.5">
                                        <span className="block truncate text-xs font-semibold">{item.name}</span>
                                        <span className="mt-0.5 block truncate text-[11px] text-stone-500">{item.prompt}</span>
                                    </span>
                                </button>
                                <div className="flex justify-end gap-0.5 px-1 pb-1">
                                    <Button size="small" type="text" className="!h-6 !w-6 !min-w-6" icon={<Pencil className="size-3" />} aria-label="编辑风格" onClick={() => startEdit(item)} />
                                    <Button size="small" type="text" danger className="!h-6 !w-6 !min-w-6" icon={<Trash2 className="size-3" />} aria-label="删除风格" onClick={() => remove(item.id)} />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="py-10 text-center text-xs text-stone-500">还没有风格，点上面的「添加风格」新建一个</div>
                )}
            </div>
        ),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [styles, adding, editingId, draftName, draftPrompt, draftColor],
    );

    return (
        <>
            <button type="button" className={variant === "header" ? "atelier-head-action" : "atelier-library-trigger"} aria-label="风格" title="打开风格库" onClick={openPicker}>
                <Palette className="size-3.5" />
                <span>风格</span>
            </button>
            <Modal open={open} onCancel={() => setOpen(false)} footer={null} width={620} centered title="风格" destroyOnHidden>
                {body}
            </Modal>
        </>
    );
}
