import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { useId, useState } from "react";

import { defaultAdvancedProtocol, normalizeAdvancedProtocol, type ChannelAdvancedProtocol, type ChannelAuthMode, type ChannelBodyEncoding, type ChannelPollMethod } from "@/stores/use-config-store";

type AdvancedProtocolPanelProps = {
    value?: ChannelAdvancedProtocol;
    onChange: (next: ChannelAdvancedProtocol) => void;
    /** 服务地址或密钥不完整时，测试请求按钮禁用。 */
    canTest: boolean;
};

const AUTH_OPTIONS: Array<{ value: ChannelAuthMode; label: string }> = [
    { value: "bearer", label: "Authorization: Bearer（默认）" },
    { value: "header", label: "自定义请求头" },
    { value: "query", label: "查询参数" },
];

const ENCODING_OPTIONS: Array<{ value: ChannelBodyEncoding; label: string }> = [
    { value: "json", label: "JSON（默认）" },
    { value: "form", label: "表单 application/x-www-form-urlencoded" },
    { value: "multipart", label: "multipart/form-data" },
];

const POLL_METHODS: Array<{ value: ChannelPollMethod; label: string }> = [
    { value: "GET", label: "GET（默认）" },
    { value: "POST", label: "POST" },
];

/**
 * 高级协议（可选）：认证、端点、请求体编码、异步轮询、解析自检。
 *
 * 面向"接口不是标准 OpenAI / Gemini"的中转站与自建服务。默认全部收起，
 * 不填就用内置默认，普通用户完全可以忽略这一块。
 *
 * 当前只做录入与本地保存 —— 这些字段还没有接进 services/api 的请求层，
 * 填了不会改变实际请求。界面上用底部说明如实标注了这一点。
 */
export function AdvancedProtocolPanel({ value, onChange, canTest }: AdvancedProtocolPanelProps) {
    const [open, setOpen] = useState(false);
    const panelId = useId();
    const protocol = normalizeAdvancedProtocol(value);

    const patch = (next: Partial<ChannelAdvancedProtocol>) => onChange({ ...protocol, ...next });
    const field = (key: keyof ChannelAdvancedProtocol) => (event: { target: { value: string } }) => patch({ [key]: event.target.value } as Partial<ChannelAdvancedProtocol>);

    const resetAll = () => onChange({ ...defaultAdvancedProtocol });

    return (
        <section className="atelier-config-api-advanced">
            <button type="button" className="atelier-config-api-advanced-toggle" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((current) => !current)}>
                <SlidersHorizontal className="size-3.5" />
                <strong>高级协议（可选）</strong>
                <span>认证 · 端点 · 请求体 · 异步轮询 · 解析自检</span>
                <ChevronDown className={`size-3.5 atelier-config-api-advanced-chevron${open ? " is-open" : ""}`} />
            </button>

            {open ? (
                <div id={panelId} className="atelier-config-api-advanced-body">
                    <div className="atelier-config-api-advanced-grid">
                        <label className="atelier-config-api-advanced-field">
                            <span>认证方式</span>
                            <select value={protocol.authMode} onChange={(event) => patch({ authMode: event.target.value as ChannelAuthMode })}>
                                {AUTH_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        </label>
                        {protocol.authMode !== "bearer" ? (
                            <label className="atelier-config-api-advanced-field">
                                <span>{protocol.authMode === "header" ? "请求头名称" : "查询参数名"}</span>
                                <input value={protocol.authName} onChange={field("authName")} placeholder={protocol.authMode === "header" ? "X-Api-Key" : "key"} />
                            </label>
                        ) : (
                            <label className="atelier-config-api-advanced-field">
                                <span>认证参数名（可选）</span>
                                <input value={protocol.authName} onChange={field("authName")} placeholder="留空使用 Authorization" />
                            </label>
                        )}
                        <label className="atelier-config-api-advanced-field">
                            <span>文本端点路径</span>
                            <input value={protocol.textEndpoint} onChange={field("textEndpoint")} placeholder="/v1/chat/completions" />
                        </label>
                        <label className="atelier-config-api-advanced-field">
                            <span>图片端点路径</span>
                            <input value={protocol.imageEndpoint} onChange={field("imageEndpoint")} placeholder="/v1/images/generations" />
                        </label>
                        <label className="atelier-config-api-advanced-field">
                            <span>视频端点路径</span>
                            <input value={protocol.videoEndpoint} onChange={field("videoEndpoint")} placeholder="/v1/videos" />
                        </label>
                        <label className="atelier-config-api-advanced-field">
                            <span>请求体编码</span>
                            <select value={protocol.bodyEncoding} onChange={(event) => patch({ bodyEncoding: event.target.value as ChannelBodyEncoding })}>
                                {ENCODING_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="atelier-config-api-advanced-field">
                            <span>轮询地址模板</span>
                            <input value={protocol.pollUrl} onChange={field("pollUrl")} placeholder="/v1/tasks/{task_id}" />
                        </label>
                        <label className="atelier-config-api-advanced-field">
                            <span>轮询方法</span>
                            <select value={protocol.pollMethod} onChange={(event) => patch({ pollMethod: event.target.value as ChannelPollMethod })}>
                                {POLL_METHODS.map((option) => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="atelier-config-api-advanced-field">
                            <span>任务号点路径（可选，每行一条）</span>
                            <textarea value={protocol.taskIdPaths} onChange={field("taskIdPaths")} placeholder="data.task.id" rows={2} />
                        </label>
                        <label className="atelier-config-api-advanced-field">
                            <span>状态点路径（可选，每行一条）</span>
                            <textarea value={protocol.statusPaths} onChange={field("statusPaths")} placeholder="data.state" rows={2} />
                        </label>
                        <label className="atelier-config-api-advanced-field">
                            <span>完成状态值</span>
                            <input value={protocol.successValues} onChange={field("successValues")} placeholder="succeeded, 2" />
                        </label>
                        <label className="atelier-config-api-advanced-field">
                            <span>失败状态值</span>
                            <input value={protocol.failureValues} onChange={field("failureValues")} placeholder="failed, 3" />
                        </label>
                        <label className="atelier-config-api-advanced-field">
                            <span>进度点路径</span>
                            <input value={protocol.progressPaths} onChange={field("progressPaths")} placeholder="data.progress" />
                        </label>
                        <label className="atelier-config-api-advanced-field">
                            <span>错误信息点路径（可选，每行一条）</span>
                            <textarea value={protocol.errorMessagePaths} onChange={field("errorMessagePaths")} placeholder="msg" rows={2} />
                        </label>
                        <label className="atelier-config-api-advanced-field">
                            <span>错误码点路径（可选，每行一条）</span>
                            <textarea value={protocol.errorCodePaths} onChange={field("errorCodePaths")} placeholder="code" rows={2} />
                        </label>
                        <label className="atelier-config-api-advanced-field atelier-config-api-advanced-field--wide">
                            <span>结果取回路径（可选，每行一条）</span>
                            <textarea value={protocol.resultPaths} onChange={field("resultPaths")} placeholder="data.outputs.0.url" rows={2} />
                        </label>
                    </div>

                    <div className="atelier-config-api-advanced-note">留空即用内置候选；只接受点路径，不接受脚本。</div>

                    <div className="atelier-config-api-advanced-grid atelier-config-api-advanced-grid--split">
                        <div className="atelier-config-api-advanced-block">
                            <strong>测试请求</strong>
                            <p>浏览器直发，Key 不出本机；只发一条文本请求，不会触发图片/视频计费</p>
                            <button type="button" className="atelier-config-api-advanced-action" disabled={!canTest}>
                                发送测试请求
                            </button>
                        </div>
                        <div className="atelier-config-api-advanced-block">
                            <strong>解析自检（粘贴上游返回的 JSON）</strong>
                            <p>只做本地解析，不发请求、不产生费用。改完点路径后先在这里对一遍。</p>
                            <button type="button" className="atelier-config-api-advanced-action">
                                解析这段响应
                            </button>
                        </div>
                    </div>

                    <div className="atelier-config-api-advanced-foot">
                        <span>这些字段目前只保存到本地配置，尚未接入实际请求。</span>
                        <button type="button" className="atelier-config-api-advanced-reset" onClick={resetAll}>
                            恢复默认
                        </button>
                    </div>
                </div>
            ) : null}
        </section>
    );
}
