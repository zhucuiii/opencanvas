import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";
import "./underline-button.css";

type UnderlineButtonProps = {
    children: ReactNode;
    icon?: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type">;

/**
 * Ported from uiverse.io/biswacpcode/curvy-crab-71: a borderless button whose two
 * red rules grow out from opposite sides on hover. The icon and label share one
 * inline-flex box so the rules stay siblings of it, exactly as in the original.
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