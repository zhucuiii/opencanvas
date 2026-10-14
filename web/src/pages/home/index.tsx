import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { StarBorder } from "@/components/ui/star-border";
import SwarmCursor from "@/components/ui/swarm-cursor";
import TechText from "@/components/ui/tech-text";
import { navigationTools } from "@/constant/navigation-tools";
import { neutral } from "@/lib/app-theme";
import { useThemeStore } from "@/stores/use-theme-store";

export default function IndexPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const theme = useThemeStore((state) => state.theme);
    const dark = theme === "dark";
    const palette = dark ? neutral.dark : neutral.light;
    const [primaryTool] = navigationTools;

    return (
        <main className="relative h-full overflow-y-auto bg-background bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] text-stone-950 dark:bg-[radial-gradient(rgba(245,245,244,.18)_1px,transparent_1px)] dark:text-stone-100">
            <SwarmCursor className="min-h-[calc(100vh-4rem)]">
                <section className="relative mx-auto min-h-[calc(100vh-4rem)] max-w-7xl overflow-hidden px-6">
                    <div className="pointer-events-none absolute left-[15%] top-24 size-20 rounded-full border border-dashed border-stone-200 dark:border-stone-800" />
                    <div className="pointer-events-none absolute right-[23%] top-[48%] size-20 rounded-full border border-dashed border-stone-200 dark:border-stone-800" />

                    <div className="relative flex min-h-[620px] flex-col items-center justify-center pt-10 text-center">
                        <div className="w-full" style={{ height: "480px" }}>
                            <TechText text="OpenCanvas" fontWeight={600} fontSize={150} reveal="letter" dashLength={4} dashGap={2} specks={15} />
                        </div>
                        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
                            {/* Primary action stays a flat pill — the star trail is a flourish for the
                                secondary button only; on the high-contrast surface it reads as noise. */}
                            <button
                                type="button"
                                className="inline-flex items-center justify-center gap-2 rounded-xl px-[22px] py-[10px] text-base font-medium leading-5 transition hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2"
                                style={{ background: palette.primary, color: palette.primaryText, outlineColor: palette.primaryText }}
                                onClick={() => navigate(`/${primaryTool.slug}`)}
                            >
                                {t("home.start")}
                                <ArrowRight className="size-4" />
                            </button>
                            <StarBorder theme={dark ? "dark" : "light"} radius={12} onClick={() => navigate("/canvas")}>
                                {t("home.openCanvas")}
                            </StarBorder>
                        </div>
                    </div>
                </section>
            </SwarmCursor>
        </main>
    );
}
