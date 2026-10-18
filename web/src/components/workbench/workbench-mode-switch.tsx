import { Image as ImageIcon, Video } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

export function WorkbenchModeSwitch({ mode }: { mode: "image" | "video" }) {
    const { t } = useTranslation();
    const itemClass = "workbench-mode-item relative z-10 inline-flex h-8 items-center justify-center gap-1.5 rounded-lg text-[11px] font-medium transition-colors";

    return (
        <nav aria-label={t("workbench.mediaType")} data-mode={mode} className="workbench-mode-switch relative grid shrink-0 grid-cols-2 rounded-xl p-1">
            <span className="workbench-mode-indicator" aria-hidden="true" />
            {([
                { key: "image", href: "/image", Icon: ImageIcon },
                { key: "video", href: "/video", Icon: Video },
            ] as const).map(({ key, href, Icon }) => {
                const active = mode === key;
                return (
                    <Link
                        key={key}
                        to={href}
                        aria-current={active ? "page" : undefined}
                        className={`${itemClass} ${active ? "text-stone-900 dark:text-stone-100" : "text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-white"}`}
                    >
                        <Icon className="size-3.5" strokeWidth={1.8} />
                        <span>{t(`navigation.${key}`)}</span>
                    </Link>
                );
            })}
        </nav>
    );
}
