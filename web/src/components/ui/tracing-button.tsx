import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";

import { cn } from "@/lib/utils";
import "./tracing-button.css";

type TracingButtonProps = {
    children: string;
    /** Label that rolls in on hover. Defaults to `children`, which reads as the text scrolling over itself. */
    hoverLabel?: string;
    icon?: ReactNode;
    /** Button face colour. */
    surface?: string;
    /** Ink colour for the label. */
    ink?: string;
    /** Colour of the tracing border. Defaults to the reference's mint. */
    accent?: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type" | "children">;

/**
 * Ported from uiverse.io/Nawsome/tiny-chipmunk-51: the four 2px edges draw
 * themselves around the button on hover, staggered so the border appears to
 * travel, while the label rolls up and out and a second copy rises in.
 *
 * The reference fixes the size at 150x50 because every text layer is absolutely
 * positioned; here a visually hidden sizer carries the real text so the button
 * grows with the label. The visible layers are decorative, so the accessible
 * name lives on the button itself.
 */
export function TracingButton({ children, hoverLabel, icon, surface, ink, accent, className, style, ...rest }: TracingButtonProps) {
    return (
        <button
            type="button"
            aria-label={children}
            className={cn("tracing-button", className)}
            // Only spread the accent when given: an undefined custom property would
            // be written as an invalid value and take the border down with it.
            style={{ "--tracing-surface": surface, "--tracing-ink": ink, "--tracing-icon-slot": icon ? "22px" : "0px", ...(accent ? { "--tracing-accent": accent } : {}), ...style } as CSSProperties}
            {...rest}
        >
            <span className="tracing-button__lines" aria-hidden="true" />
            <span className="tracing-button__sizer" aria-hidden="true">
                {icon}
                {children}
            </span>
            {icon ? (
                <span className="tracing-button__icon" aria-hidden="true">
                    {icon}
                </span>
            ) : null}
            <span className="tracing-button__label" aria-hidden="true">
                <span className="tracing-button__title">{children}</span>
                <span className="tracing-button__text">{hoverLabel ?? children}</span>
            </span>
        </button>
    );
}