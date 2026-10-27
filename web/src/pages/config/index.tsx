import { useTranslation } from "react-i18next";

import { AppConfigPanel } from "@/components/layout/app-config-modal";

export default function ConfigPage() {
    const { t } = useTranslation();

    return (
        /*
         * 整页滚动 + 面板最小高度，而不是把面板死死压进视口高度。
         *
         * 早先用的是 flex + h-full：窗口够高时没问题，一旦窗口变矮（比如 900x340），
         * 面板只能分到几十像素，侧栏列表被压成一条线、还和底部提示叠在一起，
         * 整个 API 配置区等于看不见。
         *
         * 现在改成：
         *   - 页面自身 overflow-y-auto，装不下就滚页面；
         *   - 面板给一个最小高度（32rem），保证列表、表单、底部提示三段都排得开；
         *   - 屏幕够高时再用 h-full 让面板填满，视觉和之前一致。
         */
        <main className="h-full overflow-y-auto bg-background">
            <div className="mx-auto flex w-full max-w-6xl flex-col px-6 py-6">
                <div className="mb-5 shrink-0">
                    <h1 className="text-xl font-semibold text-stone-950 dark:text-stone-100">{t("config.title")}</h1>
                    <p className="mt-1 text-sm text-stone-500">{t("config.description")}</p>
                </div>
                <div className="app-config-page-panel">
                    <AppConfigPanel />
                </div>
            </div>
        </main>
    );
}
