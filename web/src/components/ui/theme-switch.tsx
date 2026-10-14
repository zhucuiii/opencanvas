import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

type ThemeSwitchProps = {
    theme: "light" | "dark";
    onThemeChange: (theme: "light" | "dark") => void;
    className?: string;
    style?: React.CSSProperties;
    "aria-label"?: string;
    title?: string;
};

/**
 * Day/night switch styled as a track with a thin bar handle that slides and
 * rotates on toggle. Keeps the circular view-transition reveal used elsewhere.
 */
export function ThemeSwitch({ theme, onThemeChange, className, style, "aria-label": ariaLabel, title }: ThemeSwitchProps) {
    const { t } = useTranslation();
    const buttonRef = useRef<HTMLButtonElement>(null);
    const isDark = theme === "dark";
    // Animating the handle only after mount avoids a slide-in on first render.
    const [animate, setAnimate] = useState(false);
    useEffect(() => setAnimate(true), []);

    const toggle = useCallback(() => {
        const button = buttonRef.current;
        const nextTheme = isDark ? "light" : "dark";
        const applyTheme = () => {
            document.documentElement.classList.toggle("dark", nextTheme === "dark");
            document.documentElement.style.colorScheme = nextTheme;
            onThemeChange(nextTheme);
        };

        if (!button || typeof document.startViewTransition !== "function") {
            applyTheme();
            return;
        }

        const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
        const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
        const { top, left, width, height } = button.getBoundingClientRect();
        const x = left + width / 2;
        const y = top + height / 2;
        const maxRadius = Math.hypot(Math.max(x, viewportWidth - x), Math.max(y, viewportHeight - y));

        const root = document.documentElement;
        root.dataset.magicuiThemeVt = "active";
        root.style.setProperty("--magicui-theme-toggle-vt-duration", "400ms");
        root.style.setProperty("--magicui-theme-vt-clip-from", `circle(0px at ${x}px ${y}px)`);
        const cleanup = () => {
            delete root.dataset.magicuiThemeVt;
            root.style.removeProperty("--magicui-theme-toggle-vt-duration");
            root.style.removeProperty("--magicui-theme-vt-clip-from");
        };

        const transition = document.startViewTransition(() => {
            flushSync(applyTheme);
        });
        transition.finished.finally(cleanup);
        transition.ready
            .then(() => {
                root.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${maxRadius}px at ${x}px ${y}px)`] }, { duration: 400, easing: "ease-in-out", fill: "forwards", pseudoElement: "::view-transition-new(root)" });
            })
            .catch(() => {});
    }, [isDark, onThemeChange]);

    return (
        <button
            type="button"
            ref={buttonRef}
            role="switch"
            aria-checked={isDark}
            onClick={toggle}
            className={cn("group relative inline-block h-[1.4em] w-[2.6em] shrink-0 cursor-pointer rounded-md p-0 align-middle text-[17px] transition-colors duration-300", className)}
            style={{
                ...style,
                backgroundColor: isDark ? "#2b2b2b" : "#c9c6bf",
                border: `1px solid ${isDark ? "rgba(255,255,255,.28)" : "rgba(0,0,0,.22)"}`,
                boxShadow: isDark ? "inset 2px 3px 6px rgba(0,0,0,.6)" : "inset 2px 3px 6px rgba(0,0,0,.22)",
            }}
            aria-label={ariaLabel || t("theme.toggle")}
            title={title}
        >
            <span
                className="pointer-events-none absolute bottom-[0.3em] left-[0.3em] block h-[0.8em] w-[0.32em] rounded-[2px] bg-white"
                style={{
                    transition: animate ? "transform .4s cubic-bezier(.4,0,.2,1)" : undefined,
                    transform: isDark ? "translateX(1.68em) rotate(360deg)" : "translateX(0) rotate(0deg)",
                }}
            />
        </button>
    );
}
