import type { ButtonHTMLAttributes } from "react";
import { cx } from "./cx";

export type ButtonVariant = "primary" | "action" | "secondary" | "ghost" | "danger";
export type ButtonSize = "md" | "lg";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-brand-primary text-white hover:bg-brand-primary-hover",
  action: "bg-brand-action text-brand-on-action hover:bg-brand-action-700 hover:text-white",
  secondary: "bg-surface-card text-text-primary border border-border-strong hover:bg-surface-muted",
  ghost: "bg-transparent text-brand-primary hover:bg-brand-primary-50",
  danger: "bg-status-danger text-white hover:bg-status-danger-700",
};

const sizes: Record<ButtonSize, string> = {
  md: "h-10 px-4 text-body-strong-14 rounded-sm",
  lg: "h-14 px-6 text-button-large-18 rounded-md", // worker app
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
};

/** Exactly one primary/action button per screen. */
export function Button({ variant = "primary", size = "md", block, className, type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        "inline-flex items-center justify-center gap-2 font-sans transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary",
        "disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant], sizes[size], block && "w-full", className,
      )}
      {...rest}
    />
  );
}
