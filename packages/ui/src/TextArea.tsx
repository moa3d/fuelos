import { useId, type TextareaHTMLAttributes } from "react";
import { cx } from "./cx";

export type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  /** Shows a «إلزامي» badge next to the label. */
  required?: boolean;
  helper?: string;
  /** Replaces the helper text and turns the field red. */
  error?: string;
};

export function TextArea({ label, required, helper, error, className, id, rows = 3, ...rest }: TextAreaProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const noteId = `${fieldId}-note`;
  const note = error ?? helper;
  return (
    <div className={cx("flex flex-col gap-1", className)}>
      <label htmlFor={fieldId} className="flex items-center gap-2 text-label-12 text-text-secondary">
        {label}
        {required && (
          <span className="inline-flex h-5 items-center gap-1 rounded-full bg-status-danger-50 px-2 text-label-11 text-status-danger-700">
            <span aria-hidden className="size-1.5 rounded-full bg-status-danger" />
            إلزامي
          </span>
        )}
      </label>
      <textarea
        id={fieldId}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-required={required || undefined}
        aria-describedby={note ? noteId : undefined}
        className={cx(
          "rounded-md border bg-surface-card px-4 py-3 font-sans text-body-large-16 text-text-primary outline-none",
          "placeholder:text-text-muted focus:border-brand-primary focus:ring-2 focus:ring-brand-primary-50",
          error ? "border-status-danger" : "border-border-strong",
        )}
        {...rest}
      />
      {note && (
        <p id={noteId} className={cx("text-body-small-12", error ? "text-status-danger-700" : "text-text-secondary")}>
          {note}
        </p>
      )}
    </div>
  );
}
