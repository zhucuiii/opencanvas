import { Button, Drawer, Input, Segmented, Select, Space } from "antd";
import { ListPlus, Trash2, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
    API_PROTOCOL_PRESETS,
    apiProtocolPresetForChannel,
    applyApiProtocolPreset,
    defaultBaseUrlForApiFormat,
    guessCapability,
    normalizeChannelModels,
    type ApiCallFormat,
    type ApiProtocolPresetId,
    type ChannelModel,
    type ModelCapability,
    type ModelChannel,
} from "@/stores/use-config-store";
import { InlineModelPicker } from "./inline-model-picker";
import { ModelScriptEditor } from "./model-script-editor";

type ScriptTarget = { name: string; capability: ModelCapability; value: string };

export function ChannelEditorDrawer({ open, channel, onSave, onClose }: { open: boolean; channel: ModelChannel | null; onSave: (channel: ModelChannel) => void; onClose: () => void }) {
    const { t } = useTranslation();
    const [draft, setDraft] = useState<ModelChannel | null>(channel);
    const [modelsOpen, setModelsOpen] = useState(false);
    const [scriptTarget, setScriptTarget] = useState<ScriptTarget | null>(null);
    const apiFormatOptions: Array<{ label: string; value: ApiCallFormat }> = [
        { label: "OpenAI", value: "openai" },
        { label: "Gemini", value: "gemini" },
    ];
    const capabilityOptions: Array<{ label: string; value: ModelCapability }> = ["image", "video", "text", "audio"].map((value) => ({ label: t(`config.channelEditor.capabilities.${value}`), value: value as ModelCapability }));

    useEffect(() => {
        if (open && channel) {
            setDraft(channel);
            setModelsOpen(false);
        }
    }, [open, channel]);

    if (!draft) return null;

    const patch = (value: Partial<ModelChannel>) => setDraft((current) => (current ? { ...current, ...value } : current));
    const setModels = (models: ChannelModel[]) => patch({ models });

    const changeApiFormat = (apiFormat: ApiCallFormat) => {
        const baseUrl = !draft.baseUrl.trim() || draft.baseUrl.trim() === defaultBaseUrlForApiFormat(draft.apiFormat) ? defaultBaseUrlForApiFormat(apiFormat) : draft.baseUrl;
        patch({ apiFormat, baseUrl });
    };

    const applyPreset = (presetId: ApiProtocolPresetId) => setDraft((current) => (current ? applyApiProtocolPreset(current, presetId) : current));

    const setCapability = (name: string, capability: ModelCapability) => setModels(draft.models.map((model) => (model.name === name ? { ...model, capability } : model)));
    const setScript = (name: string, script: string) => setModels(draft.models.map((model) => (model.name === name ? { ...model, script: script || undefined } : model)));
    const removeModel = (name: string) => setModels(draft.models.filter((model) => model.name !== name));

    const save = () => {
        onSave({ ...draft, name: draft.name.trim() || t("config.channels.unnamed"), models: normalizeChannelModels(draft.models) });
        onClose();
    };

    return (
        <Drawer
            open={open}
            width={640}
            title={t("config.channelEditor.title")}
            onClose={onClose}
            styles={{ body: { paddingTop: 16 } }}
            extra={
                <Space>
                    <Button onClick={onClose}>{t("common.cancel")}</Button>
                    <Button type="primary" onClick={save}>
                        {t("common.save")}
                    </Button>
                </Space>
            }
        >
            <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                    <span className="mb-1 block text-sm font-medium">{t("config.channelEditor.name")}</span>
                    <Input value={draft.name} onChange={(event) => patch({ name: event.target.value })} />
                </label>
                <label className="block">
                    <span className="mb-1 block text-sm font-medium">{t("config.channelEditor.protocol")}</span>
                    <Select className="w-full" value={draft.apiFormat} options={apiFormatOptions} onChange={changeApiFormat} />
                </label>
                <label className="block md:col-span-2">
                    <span className="mb-1 block text-sm font-medium">{t("config.channelEditor.baseUrl")}</span>
                    <Input value={draft.baseUrl} onChange={(event) => patch({ baseUrl: event.target.value })} placeholder="https://api.example.com" />
                </label>
                <label className="block md:col-span-2">
                    <span className="mb-1 block text-sm font-medium">API Key</span>
                    <Input.Password value={draft.apiKey} onChange={(event) => patch({ apiKey: event.target.value })} placeholder="sk-..." />
                </label>
            </div>

            <section className="mt-5 rounded-xl border border-stone-200 bg-stone-50/60 p-3 dark:border-stone-800 dark:bg-stone-950/30">
                <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                        <div className="flex items-center gap-2 text-sm font-semibold">
                            <Zap className="size-4" />
                            {t("config.protocolPresets.title")}
                        </div>
                        <div className="mt-1 text-xs text-stone-500">{t("config.protocolPresets.description")}</div>
                    </div>
                    <span className="rounded-full border border-stone-200 px-2 py-0.5 text-[10px] text-stone-500 dark:border-stone-800">{t("config.protocolPresets.safeHint")}</span>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    {API_PROTOCOL_PRESETS.map((preset) => {
                        const selected = apiProtocolPresetForChannel(draft)?.id === preset.id;
                        return (
                            <button
                                key={preset.id}
                                type="button"
                                aria-pressed={selected}
                                className={`rounded-lg border px-3 py-2 text-left transition ${selected ? "border-stone-500 bg-white shadow-sm dark:border-stone-500 dark:bg-stone-900" : "border-stone-200 bg-white/70 hover:border-stone-300 dark:border-stone-800 dark:bg-stone-900/40 dark:hover:border-stone-700"}`}
                                onClick={() => applyPreset(preset.id)}
                            >
                                <span className="block text-xs font-semibold">{t(`config.protocols.${preset.id}.name`)}</span>
                                <span className="mt-1 block text-[11px] leading-4 text-stone-500">{t(`config.protocols.${preset.id}.description`)}</span>
                                <code className="mt-1.5 block truncate text-[10px] text-stone-400">{preset.baseUrl || "https://your-provider.example.com/v1"}</code>
                            </button>
                        );
                    })}
                </div>
            </section>

            <div className="mt-6 mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                    <div className="text-sm font-semibold">{t("config.channelEditor.models")}</div>
                    <div className="mt-0.5 text-xs text-stone-500">{t("config.channelEditor.modelDescription", { count: draft.models.length })}</div>
                </div>
                <Button type="primary" icon={<ListPlus className="size-4" />} onClick={() => setModelsOpen((current) => !current)} aria-expanded={modelsOpen}>
                    {t("config.channelEditor.selectModels")}
                </Button>
            </div>

            {/* 模型选择就地展开在按钮下方，拉取结果直接出现在这里，不会再叠一层弹窗。 */}
            {modelsOpen ? (
                <div className="mb-3">
                    <InlineModelPicker
                        channel={draft}
                        selectedNames={draft.models.map((model) => model.name)}
                        onChange={(names) => {
                            const map = new Map(draft.models.map((model) => [model.name, model]));
                            setModels(names.map((name) => map.get(name) || { name, capability: guessCapability(name) }));
                        }}
                    />
                </div>
            ) : null}

            <div className="space-y-2 rounded-lg border border-stone-200 p-2 dark:border-stone-800">
                {draft.models.length ? (
                    draft.models.map((model) => (
                        <div key={model.name} className="flex flex-wrap items-center gap-3 rounded-md px-2 py-1.5 hover:bg-stone-50 dark:hover:bg-stone-900/40">
                            <span className="min-w-0 flex-1 truncate text-sm" title={model.name}>
                                {model.name}
                            </span>
                            <div className="flex shrink-0 items-center gap-2">
                                <Segmented size="small" value={model.capability} options={capabilityOptions} onChange={(value) => setCapability(model.name, value as ModelCapability)} />
                                <Button size="small" type={model.script ? "primary" : "default"} ghost={Boolean(model.script)} onClick={() => setScriptTarget({ name: model.name, capability: model.capability, value: model.script || "" })}>
                                    {t(model.script ? "config.channelEditor.scriptReady" : "config.channelEditor.script")}
                                </Button>
                                <Button size="small" danger type="text" icon={<Trash2 className="size-3.5" />} onClick={() => removeModel(model.name)} />
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="px-2 py-8 text-center text-sm text-stone-500">{t("config.channelEditor.empty")}</div>
                )}
            </div>

            <ModelScriptEditor
                open={Boolean(scriptTarget)}
                capability={scriptTarget?.capability || "text"}
                modelName={scriptTarget?.name || ""}
                value={scriptTarget?.value || ""}
                onSave={(script) => scriptTarget && setScript(scriptTarget.name, script)}
                onClose={() => setScriptTarget(null)}
            />
        </Drawer>
    );
}
