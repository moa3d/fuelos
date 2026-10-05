// Horizontal-wrapping fuel filter chips (tablist). Visual height is 34px; the hit area is extended to 44px
// with a pseudo-element so the touch target stays ≥ 44px. Labels are passed in, so no copy lives here.
import { cx } from "@fuelos/ui";

export function FuelChips({
  items,
  value,
  onChange,
  label,
}: {
  items: readonly string[];
  value: string;
  onChange: (item: string) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap gap-2">
      {items.map((item) => {
        const selected = item === value;
        return (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(item)}
            className={cx(
              "relative h-[34px] rounded-full border px-4 text-body-strong-14 transition-colors motion-reduce:transition-none",
              "before:absolute before:inset-x-0 before:-inset-y-[5px] before:content-['']",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary",
              selected
                ? "border-brand-primary bg-brand-primary text-text-on-dark"
                : "border-border-default bg-surface-card text-text-secondary",
            )}
          >
            {item}
          </button>
        );
      })}
    </div>
  );
}
