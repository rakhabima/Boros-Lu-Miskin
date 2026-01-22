import { useEffect, useId, useRef, useState } from "react";

type CategorySelectProps = {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  className?: string;
};


export function CategorySelect({
  label,
  value,
  options,
  onChange,
  className
}: CategorySelectProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!open) return;
    const selectedIndex = options.findIndex((opt) => opt === value);
    const nextIndex = selectedIndex >= 0 ? selectedIndex : 0;
    setHighlightedIndex(nextIndex);
    optionRefs.current[nextIndex]?.focus();
  }, [open, options, value]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!open) return;
      const target = event.target as Node;
      if (
        buttonRef.current?.contains(target) ||
        listRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  function handleButtonKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
    }
  }

  function handleListKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      const nextIndex =
        (highlightedIndex + delta + options.length) % options.length;
      setHighlightedIndex(nextIndex);
      optionRefs.current[nextIndex]?.focus();
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onChange(options[highlightedIndex]);
      setOpen(false);
      buttonRef.current?.focus();
    }
  }

  return (
    <div className={`relative ${className || ""}`}>
      <button
        ref={buttonRef}
        type="button"
        className="h-10 w-full rounded-md border border-neutral-300 bg-white px-3 pr-9 text-sm text-left"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`category-list-${id}`}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={handleButtonKeyDown}
      >
        <span>{value}</span>
      </button>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400">
        ▾
      </span>

      <div
        ref={listRef}
        role="listbox"
        id={`category-list-${id}`}
        aria-label={label}
        tabIndex={-1}
        onKeyDown={handleListKeyDown}
        className={`absolute z-20 mt-2 w-full rounded-md border border-neutral-200 bg-white shadow-sm transition-all ${
          open
            ? "opacity-100 scale-100"
            : "pointer-events-none opacity-0 scale-95"
        }`}
      >
        <div className="max-h-56 overflow-y-auto py-1">
          {options.map((option, index) => {
            const selected = option === value;
            return (
              <button
                key={option}
                ref={(el) => {
                  optionRefs.current[index] = el;
                }}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                  buttonRef.current?.focus();
                }}
                onFocus={() => setHighlightedIndex(index)}
                className={`flex w-full items-center justify-between px-3 py-2 text-sm ${
                  selected
                    ? "bg-neutral-900 text-white"
                    : "text-neutral-700 hover:bg-neutral-50"
                }`}
              >
                <span>{option}</span>
                {selected && (
                  <span aria-hidden="true" className="text-xs">
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
