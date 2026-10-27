import { Button, Input } from "antd";
import { CircleAlert, CircleCheck, CircleDashed, Eye, EyeOff, ListPlus, Plus, RefreshCw, Server, Trash2, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { InlineModelPicker } from "./inline-model-picker";
import {
    API_PROTOCOL_PRESETS,
    apiProtocolPresetForChannel,
    applyApiProtocolPreset,
    createModelChannel,
    defaultBaseUrlForApiFormat,
    guessCapability,
    normalizeChannelModels,
    type AiConfig,
    type ApiCallFormat,
    type ApiProtocolPresetId,
    type ModelChannel,
} from "@/stores/use-config-store";

type ConfigApiSettingsProps = {
    config: AiConfig;
    onChange: <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => void;
    onEditModels: (channel: ModelChannel) => void;
};

type ConnectionState = "ready" | "incomplete" | "error";

export function ConfigApiSettings({ config, onChange, onEditModels }: ConfigApiSettingsProps) {
    const { t } = useTranslation();
    const channels = config.channels;
    const [activeId, setActiveId] = useState(channels[0]?.id || "");
    const [visibleKeyId, setVisibleKeyId] = useState<string | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    // 模型列表在按钮下方就地展开，不再另开弹窗。
    const [modelsOpen, setModelsOpen] = useState(false);
    const activeChannel = channels.find((channel) => channel.id === activeId) || channels[0] || null;

    useEffect(() => {
        if (activeChannel && activeChannel.id !== activeId) setActiveId(activeChannel.id);
    }, [activeChannel, activeId]);

    const channelState = (channel: ModelChannel | null): { state: ConnectionState; label: string } => {
        if (!channel) return { state: "incomplete", label: "未配置" };
        if (!channel.baseUrl.trim()) return { state: "error", label: "缺少服务地址" };
        if (!channel.apiKey.trim()) return { state: "incomplete", label: "待填写密钥" };
        if (!channel.models.length) return { state: "incomplete", label: "待拉取模型" };
        return { state: "ready", label: "已就绪" };
    };

    const activeState = channelState(activeChannel);
    const readyCount = channels.filter((channel) => channelState(channel).state === "ready").length;
    const activePreset = activeChannel ? apiProtocolPresetForChannel(activeChannel) : null;

    const updateChannel = (patch: Partial<ModelChannel>) => {
        if (!activeChannel) return;
        onChange(
            "channels",
            channels.map((channel) => (channel.id === activeChannel.id ? { ...channel, ...patch } : channel)),
        );
    };

    const changeFormat = (apiFormat: ApiCallFormat) => {
        if (!activeChannel) return;
        const currentBaseUrl = activeChannel.baseUrl.trim();
        const shouldUseDefault = !currentBaseUrl || currentBaseUrl === defaultBaseUrlForApiFormat(activeChannel.apiFormat);
        updateChannel({ apiFormat, ...(shouldUseDefault ? { baseUrl: defaultBaseUrlForApiFormat(apiFormat) } : {}) });
    };

    const applyPreset = (presetId: ApiProtocolPresetId) => {
        if (!activeChannel) return;
        onChange(
            "channels",
            channels.map((channel) => (channel.id === activeChannel.id ? applyApiProtocolPreset(channel, presetId) : channel)),
        );
    };

    const addChannel = () => {
        const channel = createModelChannel({
            name: `API 配置 ${channels.length + 1}`,
            baseUrl: defaultBaseUrlForApiFormat("openai"),
            apiFormat: "openai",
        });
        onChange("channels", [...channels, channel]);
        setActiveId(channel.id);
        setModelsOpen(false);
    };

    const removeChannel = (id: string) => {
        const next = channels.filter((channel) => channel.id !== id);
        if (!next.length) {
            const replacement = createModelChannel({ name: "API 配置 1" });
            onChange("channels", [replacement]);
            setActiveId(replacement.id);
        } else {
            onChange("channels", next);
            if (id === activeId) setActiveId(next[0].id);
        }
        setConfirmDeleteId(null);
    };

    const stateIcon = activeState.state === "ready" ? <CircleCheck className="size-3.5" /> : activeState.state === "error" ? <CircleAlert className="size-3.5" /> : <CircleDashed className="size-3.5" />;

    return (
        <div className="atelier-config-api-layout">
            <aside className="atelier-config-api-sidebar">
                <div className="atelier-config-api-sidebar-head">
                    <div>
                        <strong>API 接口</strong>
                        <small>{channels.length} 个配置</small>
                    </div>
                    <button type="button" aria-label="添加 API 配置" title="添加配置" onClick={addChannel}>
                        <Plus className="size-4" />
                    </button>
                </div>
                <div className="atelier-config-api-list">
                    {channels.map((channel) => {
                        const state = channelState(channel);
                        return (
                            <button
                                key={channel.id}
                                type="button"
                                className={`atelier-config-api-list-item${channel.id === activeChannel?.id ? " is-active" : ""}`}
                                aria-label={`${channel.name}，${state.label}`}
                                onClick={() => {
                                    setActiveId(channel.id);
                                    setConfirmDeleteId(null);
                                    setModelsOpen(false);
                                }}
                            >
                                <i className={`is-${state.state}`} />
                                <span>
                                    <strong>{channel.name || "未命名配置"}</strong>
                                    <small>{state.label}</small>
                                </span>
                            </button>
                        );
                    })}
                </div>
                <button type="button" className="atelier-config-api-add" onClick={addChannel}>
                    <Plus className="size-4" />
                    添加配置
                </button>
            </aside>
            <section className="atelier-config-api-editor">
                {activeChannel ? (
                    <>
                        <div className="atelier-config-api-editor-head">
                            <div className="atelier-config-api-identity">
                                <span className="atelier-config-api-icon">
                                    <Server className="size-4" />
                                </span>
                                <div>
                                    <strong>{activeChannel.name || "未命名配置"}</strong>
                                    <span>{activeChannel.baseUrl || "未设置服务地址"}</span>
                                </div>
                            </div>
                            <div className="atelier-config-api-controls">
                                <span className={`atelier-config-api-state is-${activeState.state}`}>
                                    {stateIcon}
                                    {activeState.label}
                                </span>
                                <span className="atelier-config-api-browser-note">浏览器本地配置</span>
                                <span className="atelier-config-api-delete-wrap">
                                    <button type="button" className="atelier-config-api-icon-button is-danger" title="删除配置" aria-label="删除当前 API 配置" onClick={() => setConfirmDeleteId(activeChannel.id)}>
                                        <Trash2 className="size-4" />
                                    </button>
                                    {confirmDeleteId === activeChannel.id ? (
                                        <span className="atelier-config-api-delete-popover" role="alertdialog" aria-label="确认删除 API 配置">
                                            <div>
                                                <strong>删除这个配置？</strong>
                                                <small>密钥和模型映射会一并移除</small>
                                            </div>
                                            <div>
                                                <button type="button" onClick={() => setConfirmDeleteId(null)}>
                                                    取消
                                                </button>
                                                <button type="button" className="is-danger" onClick={() => removeChannel(activeChannel.id)}>
                                                    删除
                                                </button>
                                            </div>
                                        </span>
                                    ) : null}
                                </span>
                            </div>
                        </div>
                        <div className="atelier-config-api-editor-body">
                            <div className="atelier-config-api-section-heading">
                                <strong>连接信息</strong>
                                <span>浏览器本地配置</span>
                            </div>
                            <div className="atelier-config-api-fields">
                                <label className="atelier-config-api-field atelier-config-api-field--name">
                                    <span>配置名称</span>
                                    <Input value={activeChannel.name} maxLength={48} onChange={(event) => updateChannel({ name: event.target.value })} />
                                </label>
                                <div className="atelier-config-api-field atelier-config-api-field--protocol">
                                    <span className="atelier-config-api-field-label">调用协议</span>
                                    <div className="atelier-config-api-protocol" role="radiogroup" aria-label="调用协议">
                                        {(["openai", "gemini"] as ApiCallFormat[]).map((format) => (
                                            <button key={format} type="button" role="radio" aria-checked={activeChannel.apiFormat === format} className={activeChannel.apiFormat === format ? "is-active" : undefined} onClick={() => changeFormat(format)}>
                                                <i />
                                                <span>{format === "openai" ? "OpenAI 兼容" : "Gemini 原生"}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="atelier-config-api-field atelier-config-api-field--wide atelier-config-api-preset-field">
                                    <span className="atelier-config-api-field-label">
                                        <Zap className="size-3.5" />
                                        常见协议预设
                                        <small>{t("config.protocolPresets.safeHint")}</small>
                                    </span>
                                    <div className="atelier-config-api-presets" role="group" aria-label="常见协议预设">
                                        {API_PROTOCOL_PRESETS.map((preset) => (
                                            <button key={preset.id} type="button" className={activePreset?.id === preset.id ? "is-active" : undefined} aria-pressed={activePreset?.id === preset.id} onClick={() => applyPreset(preset.id)}>
                                                <strong>{t(`config.protocols.${preset.id}.name`)}</strong>
                                                <small>{t(`config.protocols.${preset.id}.description`)}</small>
                                                <code>{preset.baseUrl || "https://your-provider.example.com/v1"}</code>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <label className="atelier-config-api-field atelier-config-api-field--wide">
                                    <span>服务地址</span>
                                    <Input value={activeChannel.baseUrl} placeholder={defaultBaseUrlForApiFormat(activeChannel.apiFormat)} onChange={(event) => updateChannel({ baseUrl: event.target.value })} />
                                </label>
                                <label className="atelier-config-api-field atelier-config-api-field--wide">
                                    <span>API Key</span>
                                    <span className="atelier-config-api-secret">
                                        <Input.Password
                                            value={activeChannel.apiKey}
                                            placeholder="sk-..."
                                            visibilityToggle={false}
                                            type={visibleKeyId === activeChannel.id ? "text" : "password"}
                                            onChange={(event) => updateChannel({ apiKey: event.target.value })}
                                        />
                                        <button type="button" aria-label={visibleKeyId === activeChannel.id ? "隐藏 API Key" : "显示 API Key"} onClick={() => setVisibleKeyId((current) => (current === activeChannel.id ? null : activeChannel.id))}>
                                            {visibleKeyId === activeChannel.id ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                                        </button>
                                    </span>
                                </label>
                            </div>
                        </div>
                        <div className="atelier-config-api-editor-foot">
                        <div className="atelier-config-api-editor-actions">
                            <button type="button" className="atelier-config-api-model-button" onClick={() => onEditModels(activeChannel)}>
                                <ListPlus className="size-4" />
                                模型与高级脚本
                            </button>
                            <Button
                                type="primary"
                                icon={<RefreshCw className="size-4" />}
                                disabled={!activeChannel.baseUrl.trim() || !activeChannel.apiKey.trim()}
                                aria-expanded={modelsOpen}
                                onClick={() => setModelsOpen((current) => !current)}
                            >
                                {activeChannel.models.length ? "重新拉取模型" : "拉取模型"}
                            </Button>
                        </div>
                        {/*
                         * 拉取结果直接在这块面板里展开可选，勾了就生效。
                         * 原先点这个按钮会无声覆盖整个模型列表，想挑模型还得再进
                         * "编辑渠道" 抽屉里叠一层弹窗，绕一圈回到同一个地方。
                         */}
                        {modelsOpen ? (
                            <div className="atelier-config-api-model-picker">
                                <InlineModelPicker
                                    channel={activeChannel}
                                    selectedNames={activeChannel.models.map((model) => model.name)}
                                    onChange={(names) => {
                                        const existing = new Map(activeChannel.models.map((model) => [model.name, model]));
                                        updateChannel({ models: normalizeChannelModels(names.map((name) => existing.get(name) || { name, capability: guessCapability(name) })) });
                                    }}
                                />
                            </div>
                        ) : null}
                        </div>
                    </>
                ) : (
                    <div className="atelier-config-api-empty">
                        <Server className="size-7" />
                        <strong>还没有 API 配置</strong>
                        <button type="button" onClick={addChannel}>
                            <Plus className="size-4" />
                            添加配置
                        </button>
                    </div>
                )}
            </section>
            <div className="atelier-config-api-foot">
                <span>API Key 仅保存在当前浏览器</span>
                <small>
                    {readyCount}/{channels.length} 个配置已就绪
                </small>
            </div>
        </div>
    );
}
