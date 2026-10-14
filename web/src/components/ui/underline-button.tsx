import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";
import "./underline-button.css";

type UnderlineButtonProps = {
    children: ReactNode;
    icon?: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type">;

/**
 * Ported from uiverse.io/WhiteNervosa/popular-ladybug-27: a borderless button that
 * brightens on hover while a rule grows out from the centre underneath the label.
 * The icon and label share one inline-flex box so the label can dim independently
 * of the rule, which stays at the button's own colour.
 */
export function UnderlineButton({ children, icon, className, ...rest }: UnderlineButtonProps) {
    return (
        <button type="button" className={cn("underline-button", className)} {...rest}>
            <span className="underline-button__label">
                {icon}
                {children}
            </span>
        </button>
    );
}