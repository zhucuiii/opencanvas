import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { navigationTools } from "@/constant/navigation-tools";

/**
 * 首页。
 *
 * 原来是 SwarmCursor + TechText + TracingButton + StarBorder 四层动效叠在一起：
 * 文字碎裂重组、光标拖尾、按钮描边跑马灯、星星边框。信息量很低但视觉噪音很高。
 *
 * 改成影策那套：一个大标题、一句说明、两颗按钮，其余全是留白。
 * 层次靠字号和灰度拉开，不靠动效。
 */
export default function IndexPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [primaryTool] = navigationTools;

    return (
        <main className="relative h-full overflow-y-auto bg-background text-foreground">
            <section className="relative mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-3xl flex-col items-center justify-center px-6 text-center">
                <h1 className="text-[clamp(2.5rem,7vw,4.5rem)] font-semibold leading-[1.05] tracking-[-0.03em] text-foreground">
                    {t("meta.title")}
                </h1>
                <p className="mt-5 max-w-md text-body leading-relaxed text-muted-foreground">{t("meta.description")}</p>

                <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
                    {/* 主操作：实心胶囊 */}
                    <button
                        type="button"
                        onClick={() => navigate(`/${primaryTool.slug}`)}
                        className="inline-flex h-11 items-center gap-2 rounded-pill bg-primary px-6 text-ui font-medium text-primary-foreground transition-opacity duration-200 hover:opacity-88 active:opacity-76"
                    >
                        {t("home.start")}
                        <ArrowRight className="size-4" />
                    </button>
                    {/* 次操作：只有一层淡填充，没有描边 */}
                    <button
                        type="button"
                        onClick={() => navigate("/canvas")}
                        className="inline-flex h-11 items-center rounded-pill bg-accent px-6 text-ui font-medium text-foreground transition-colors duration-200 hover:bg-accent/70"
                    >
                        {t("home.openCanvas")}
                    </button>
                </div>
            </section>
        </main>
    );
}
