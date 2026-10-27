import { useTranslation } from "react-i18next";

import { AppConfigPanel } from "@/components/layout/app-config-modal";

export default function ConfigPage() {
    const { t } = useTranslation();

    return (
        /*
         * 用 flex 纵向分配高度，而不是让内容自然撑开：
         * 配置面板内部有多个"自适应滚动区"（编辑器、模型列表），
         * 只有当面板拿到确定的高度时它们才知道该滚多少。
         * 之前 panel 按内容无限长，模型列表一展开就把面板顶出视口，
         * 外层 overflow-y-auto 又只滚整页，导致底下那截既看不见也滚不到。
         */
        <main className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
            <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col px-6 py-6">
                <div className="mb-5 shrink-0">
                    <h1 className="text-xl font-semibold text-stone-950 dark:text-stone-100">{t("config.title")}</h1>
                    <p className="mt-1 text-sm text-stone-500">{t("config.description")}</p>
                </div>
                <div className="flex min-h-0 flex-1 flex-col">
                    <AppConfigPanel />
                </div>
            </div>
        </main>
    );
}
