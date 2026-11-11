import { Menu } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { navigationTools, type NavigationToolSlug } from "@/constant/navigation-tools";
import { AppConfigModal } from "@/components/layout/app-config-modal";
import { MobileNavDrawer } from "@/components/layout/mobile-nav-drawer";
import { UserStatusActions } from "@/components/layout/user-status-actions";
import { cn } from "@/lib/utils";
import { useState } from "react";

export function AppTopNav() {
    const { t } = useTranslation();
    const { pathname } = useLocation();
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const hideHeader = /^\/canvas\/[^/]+/.test(pathname);
    const slug = pathname.split("/").filter(Boolean)[0];
    const activeToolSlug: NavigationToolSlug | undefined = slug === "image" || slug === "video" ? "studio" : navigationTools.some((tool) => tool.slug === slug) ? (slug as NavigationToolSlug) : undefined;

    return (
        <>
            {/*
              顶栏：不做硬边框分隔，靠 backdrop-blur 的一层薄雾把内容和画布分开。
              导航项改成胶囊 —— 选中项是填充块，未选中只有文字和图标。
              影策的分层全靠填充和留白，不用下划线。
            */}
            {!hideHeader ? (
                <header className="sticky top-0 z-20 h-14 shrink-0 border-b border-border bg-background/75 backdrop-blur-2xl backdrop-saturate-150">
                    <div className="grid h-full grid-cols-[1fr_auto_1fr] items-center gap-5 px-6">
                        <div className="flex min-w-0 items-center">
                            <Link to="/" className="flex h-full shrink-0 items-center text-sm font-semibold leading-none tracking-tight text-foreground transition hover:opacity-70">
                                <span className="text-base font-semibold tracking-[-0.01em]">{t("meta.title")}</span>
                            </Link>

                            <button
                                type="button"
                                className="ml-3 inline-flex size-8 shrink-0 items-center justify-center rounded-control text-muted-foreground transition hover:bg-accent hover:text-foreground md:hidden"
                                onClick={() => setMobileNavOpen(true)}
                                aria-label={t("topNav.openMenu")}
                                title={t("topNav.menu")}
                            >
                                <Menu className="size-5" />
                            </button>
                        </div>

                        <nav className="hide-scrollbar hidden h-full min-w-0 items-center justify-center gap-1 overflow-x-auto md:flex">
                            {navigationTools.map((tool) => {
                                const Icon = tool.icon;
                                const active = tool.slug === activeToolSlug;
                                return (
                                    <Link
                                        key={tool.slug}
                                        to={"href" in tool ? tool.href : `/${tool.slug}`}
                                        className={cn(
                                            "flex h-9 shrink-0 items-center gap-2 rounded-pill px-3.5 text-sm leading-6 transition-colors duration-200",
                                            active
                                                ? "bg-accent font-medium text-foreground"
                                                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                                        )}
                                    >
                                        <Icon className="size-4" />
                                        <span className="truncate">{t(`navigation.${tool.slug}`)}</span>
                                    </Link>
                                );
                            })}
                        </nav>

                        <div className="flex min-w-0 items-center justify-end gap-2 whitespace-nowrap">
                            {/* 设置入口已挪到画布页的底部工具条，这里不再重复放一个。 */}
                            <UserStatusActions showConfig={false} />
                        </div>
                    </div>
                </header>
            ) : null}

            <MobileNavDrawer open={mobileNavOpen} activeToolSlug={activeToolSlug} onClose={() => setMobileNavOpen(false)} />
            <AppConfigModal />
        </>
    );
}
