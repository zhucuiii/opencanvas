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

const REVEAL_MS = 400;
// `finished` should always settle, but if it somehow does not, this releases the
// in-flight guard so the reveal cannot stay disabled forever.
const REVEAL_TIMEOUT_MS = 1200;

/**
 * Day/night switch styled as a track with a thin bar handle that slides and
 * rotates on toggle, plus a circular view-transition reveal.
 *
 * The reveal is deliberately serialised: a second toggle while one is still
 * playing would put two full-viewport snapshots on the compositor at once,
 * which is enough to take the renderer down (observed as STATUS_BREAKPOINT).
 * Toggling during a reveal therefore switches the theme without animating.
 */
export function ThemeSwitch({ theme, onThemeChange, className, style, "aria-label": ariaLabel, title }: ThemeSwitchProps) {
    const { t } = useTranslation();
    const buttonRef = useRef<HTMLButtonElement>(null);
    const transitionRef = useRef<ReturnType<typeof document.startViewTransition> | null>(null);
    const animationRef = useRef<Animation | null>(null);
    const releaseTimerRef = useRef<number | null>(null);
    const isDark = theme === "dark";
    // Animating the handle only after mount avoids a slide-in on first render.
    const [animate, setAnimate] = useState(false);
    useEffect(() => setAnimate(true), []);

    const release = useCallback(() => {
        if (releaseTimerRef.current !== null) {
            window.clearTimeout(releaseTimerRef.current);
            releaseTimerRef.current = null;
        }
        animationRef.current?.cancel();
        animationRef.current = null;
        transitionRef.current = null;
    }, []);

    useEffect(() => release, [release]);

    const toggle = useCallback(() => {
        const button = buttonRef.current;
        // Read the current theme off the DOM, not off props: the non-animated
        // path below does not flush a React update, so two clicks landing in the
        // same render would both see a stale prop and the second would be a no-op.
        const nextTheme = document.documentElement.classList.contains("dark") ? "light" : "dark";
        const applyTheme = () => {
            document.documentElement.classList.toggle("dark", nextTheme === "dark");
            document.documentElement.style.colorScheme = nextTheme;
            onThemeChange(nextTheme);
        };

        // One reveal at a time — see the note on the component.
        if (transitionRef.current) {
            applyTheme();
            return;
        }

        const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
        if (!button || reduceMotion || typeof document.startViewTransition !== "function") {
            applyTheme();
            return;
        }

        const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
        const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
        const { top, left, width, height } = button.getBoundingClientRect();
        const x = left + width / 2;
        const y = top + height / 2;
        const maxRadius = Math.hypot(Math.max(x, viewportWidth - x), Math.max(y, viewportHeight - y));
        const from = `circle(0px at ${x}px ${y}px)`;

        try {
            const transition = document.startViewTransition(() => {
                flushSync(applyTheme);
            });
            transitionRef.current = transition;
            releaseTimerRef.current = window.setTimeout(release, REVEAL_TIMEOUT_MS);
            transition.finished.finally(release);
            transition.ready
                .then(() => {
                    animationRef.current = document.documentElement.animate({ clipPath: [from, `circle(${maxRadius}px at ${x}px ${y}px)`] }, { duration: REVEAL_MS, easing: "ease-in-out", fill: "forwards", pseudoElement: "::view-transition-new(root)" });
                })
                .catch(() => undefined);
        } catch {
            // startViewTransition can throw if a transition is already pending.
            release();
            applyTheme();
        }
    }, [onThemeChange, release]);

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