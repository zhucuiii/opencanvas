import { App, Button, Checkbox, Input } from "antd";
import { CircleAlert, RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { fetchChannelModels } from "@/services/api/image";
import type { ModelChannel } from "@/stores/use-config-store";

type InlineModelPickerProps = {
    channel: ModelChannel | null;
    /** 当前已选的模型名，顺序即展示顺序。 */
    selectedNames: string[];
    /** 勾选变化时立即回写，不再有"确定"这一步。 */
    onChange: (names: string[]) => void;
};

const unique = (list: string[]) => list.filter((name, index) => list.indexOf(name) === index);

/**
 * 就地展开的模型选择区：拉取结果直接落在按钮下方，勾选即生效。
 *
 * 取代原先的 ModelSelectModal —— 那个弹窗要在编辑渠道抽屉里再叠一层，
 * 拉取完还得切 tab、勾选、再点确定才能回到原来的界面，绕了一圈。
 * 这里把「拉取 → 浏览 → 勾选」压在同一处，父级只负责开关和接收结果。
 */
export function InlineModelPicker({ channel, selectedNames, onChange }: InlineModelPickerProps) {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const [fetched, setFetched] = useState<string[]>([]);
    const [search, setSearch] = useState("");
    const [manual, setManual] = useState("");
    const [loading, setLoading] = useState(false);
    // 拉取失败的原因直接留在面板里，不靠一闪而过的 toast——用户点完看不到任何变化时
    // 根本不知道是地址不对、密钥无效还是上游不提供 /models。
    const [error, setError] = useState<string | null>(null);
    const started = useRef(false);

    // 已选 + 新拉取的并集：之前配好的模型不会因为这次拉取而消失。
    const names = useMemo(() => unique([...selectedNames, ...fetched]), [selectedNames, fetched]);
    const visibleList = useMemo(() => {
        const keyword = search.trim().toLowerCase();
        return keyword ? names.filter((name) => name.toLowerCase().includes(keyword)) : names;
    }, [names, search]);
    const visibleSelected = visibleList.filter((name) => selectedNames.includes(name)).length;

    const load = async () => {
        if (!channel) return;
        if (!channel.baseUrl.trim() || !channel.apiKey.trim()) {
            setError("请先填写服务地址和 API Key。");
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const models = await fetchChannelModels(channel);
            setFetched(models);
            if (!models.length) {
                setError("上游返回了空列表：接口能连通，但没有可用模型。可以手动填写模型名称。");
                message.warning(t("config.modelSelect.fetchedEmpty"));
            } else {
                message.success(t("config.modelSelect.fetched", { count: models.length }));
            }
        } catch (caught) {
            const detail = caught instanceof Error ? caught.message : t("config.modelSelect.fetchFailed");
            setError(detail);
        } finally {
            setLoading(false);
        }
    };

    // 展开时自动拉一次，省掉"展开后再点一次拉取"。
    // 地址或密钥还没填完就静默跳过，避免刚打开面板就弹一个错误。
    useEffect(() => {
        if (started.current || !channel) return;
        // 刚打开面板时还没填完配置是正常状态，不要一进来就报警。
        if (!channel.baseUrl.trim() || !channel.apiKey.trim()) return;
        started.current = true;
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [channel]);

    const toggle = (name: string, checked: boolean) => onChange(checked ? unique([...selectedNames, name]) : selectedNames.filter((item) => item !== name));

    const selectVisible = () => onChange(unique([...selectedNames, ...visibleList]));
    const clearVisible = () => onChange(selectedNames.filter((name) => !visibleList.includes(name)));

    const addManual = () => {
        const name = manual.trim();
        if (!name) return;
        if (!names.includes(name)) setFetched((current) => [name, ...current]);
        if (!selectedNames.includes(name)) onChange(unique([...selectedNames, name]));
        setManual("");
    };

    return (
        <div className="rounded-lg border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-950">
            <div className="flex flex-wrap items-center gap-1.5 border-b border-stone-200 px-2 py-1.5 dark:border-stone-800">
                <Input size="small" className="min-w-[130px] flex-1" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("config.modelSelect.search")} prefix={<Search className="size-3.5 text-stone-400" />} allowClear />
                <Input size="small" className="min-w-[130px] flex-1" value={manual} onChange={(event) => setManual(event.target.value)} onPressEnter={addManual} placeholder={t("config.modelSelect.modelName")} />
                <Button size="small" onClick={addManual}>
                    {t("config.modelSelect.add")}
                </Button>
                <Button size="small" icon={<RefreshCw className="size-3.5" />} loading={loading} onClick={() => void load()}>
                    {t("config.modelSelect.fetch")}
                </Button>
            </div>
            <div className="flex items-center justify-between gap-2 px-2 py-1">
                <span className="text-[11px] text-stone-500">{t("config.modelSelect.selected", { selected: selectedNames.length, total: names.length })}</span>
                <span className="flex gap-1">
                    <Button size="small" type="text" disabled={!visibleList.length} onClick={selectVisible}>
                        {t("config.modelSelect.selectVisible")}
                    </Button>
                    <Button size="small" type="text" disabled={!visibleSelected} onClick={clearVisible}>
                        {t("config.modelSelect.clearVisible")}
                    </Button>
                </span>
            </div>
            {error && !loading ? (
                <div className="flex items-start gap-1.5 border-t border-red-200 px-3 py-2 text-[11px] leading-4 text-red-600 dark:border-red-900/60 dark:text-red-400">
                    <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                    <span className="min-w-0 break-all">
                        拉取失败：{error}
                        <span className="mt-0.5 block opacity-70">可以重试，或直接在右上角输入模型名称手动添加。</span>
                    </span>
                </div>
            ) : null}
            {visibleList.length ? (
                <div className="grid max-h-40 grid-cols-1 gap-x-6 gap-y-1 overflow-y-auto border-t border-stone-200 px-3 py-2 dark:border-stone-800 md:grid-cols-2">
                    {visibleList.map((name) => (
                        <Checkbox key={name} checked={selectedNames.includes(name)} onChange={(event) => toggle(name, event.target.checked)}>
                            <span className="truncate text-xs" title={name}>
                                {name}
                            </span>
                        </Checkbox>
                    ))}
                </div>
            ) : !error ? (
                <div className="border-t border-stone-200 px-3 py-5 text-center text-xs text-stone-500 dark:border-stone-800">
                    {loading ? t("config.modelSelect.fetch") : channel?.baseUrl.trim() && channel?.apiKey.trim() ? "点右上角「拉取模型列表」获取上游模型，也可以直接输入模型名称手动添加。" : "填好上面的服务地址和 API Key 后即可拉取；也可以直接输入模型名称手动添加。"}
                </div>
            ) : null}
        </div>
    );
}
