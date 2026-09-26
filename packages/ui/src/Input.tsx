import { useId, type InputHTMLAttributes } from "react";
import { cx } from "./cx";

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & {
  label: string;
  size?: "md" | "lg";
  /** Unit shown inside the field, e.g. «لتر» or «ل.س». */
  suffix?: string;
  helper?: string;
  /** Replaces the helper text and turns the field red. */
  error?: string;
};

export function Input({ label, size = "md", suffix, helper, error, className, id, ...rest }: InputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const noteId = `${inputId}-note`;
  const note = error ?? helper;
  return (
    <div className={cx("flex flex-col gap-1", className)}>
      <label htmlFor={inputId} className="text-label-12 text-text-secondary">{label}</label>
      <div
        className={cx(
          "flex items-center gap-2 rounded-md border bg-surface-card px-4",
          "focus-within:border-brand-primary focus-within:ring-2 focus-within:ring-brand-primary-50",
          error ? "border-status-danger" : "border-border-strong",
          size === "lg" ? "h-16" : "h-11",
        )}
      >
        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={note ? noteId : undefined}
          className={cx(
            "min-w-0 flex-1 bg-transparent font-sans text-text-primary outline-none placeholder:text-text-muted",
            size === "lg" ? "text-number-l-24" : "text-body-large-16",
          )}
          {...rest}
        />
        {suffix && <span className="text-body-regular-14 text-text-secondary">{suffix}</span>}
      </div>
      {note && (
        <p id={noteId} className={cx("text-body-small-12", error ? "text-status-danger-700" : "text-text-secondary")}>
          {note}
        </p>
      )}
    </div>
  );
}
