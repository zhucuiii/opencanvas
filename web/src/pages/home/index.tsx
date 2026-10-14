import { ArrowRight } from "lucide-react";
import { Button } from "antd";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import SwarmCursor from "@/components/ui/swarm-cursor";
import TechText from "@/components/ui/tech-text";
import { navigationTools } from "@/constant/navigation-tools";

export default function IndexPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
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
                            <Button type="primary" size="large" onClick={() => navigate(`/${primaryTool.slug}`)} icon={<ArrowRight className="size-4" />} iconPlacement="end">
                                {t("home.start")}
                            </Button>
                            <Button size="large" onClick={() => navigate("/canvas")}>
                                {t("home.openCanvas")}
                            </Button>
                        </div>
                    </div>
                </section>
            </SwarmCursor>
        </main>
    );
}
