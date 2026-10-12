"use client";

import { useEffect, useRef, useState } from "react";

export type ListboxOption<T extends string> = { value: T; label: string };

export function Listbox<T extends string>({
  id,
  value,
  options,
  onChange,
  ariaLabel,
  placeholder = "Selecciona…",
}: {
  id?: string;
  value: T | "";
  options: ListboxOption<T>[];
  onChange: (value: T) => void;
  ariaLabel?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    listRef.current?.focus();
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  function openAt(index: number) {
    setHighlighted(Math.max(index, 0));
    setOpen(true);
  }

  function selectIndex(index: number) {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    setOpen(false);
  }

  function handleButtonKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openAt(options.findIndex((o) => o.value === value));
    }
  }

  function handleListKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      selectIndex(highlighted);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "Home") {
      e.preventDefault();
      setHighlighted(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setHighlighted(options.length - 1);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        id={id}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() =>
          open
            ? setOpen(false)
            : openAt(options.findIndex((o) => o.value === value))
        }
        onKeyDown={handleButtonKeyDown}
        className="font-body text-sm w-full bg-transparent border border-border rounded-[var(--radius-sm)] px-3 py-2 text-text-primary text-left focus:outline-none focus:border-primary-300 flex items-center justify-between gap-2"
      >
        <span>{selected ? selected.label : placeholder}</span>
        <span aria-hidden className="text-text-muted text-[10px]">
          ▾
        </span>
      </button>
      {open && (
        <ul
          role="listbox"
          ref={listRef}
          tabIndex={-1}
          onKeyDown={handleListKeyDown}
          className="absolute z-10 mt-1 w-full max-h-60 overflow-auto bg-surface border border-border rounded-[var(--radius-sm)] py-1 shadow-lg focus:outline-none"
        >
          {options.map((option, index) => (
            <li
              key={option.value}
              role="option"
              aria-selected={option.value === value}
              onMouseEnter={() => setHighlighted(index)}
              onClick={() => selectIndex(index)}
              className={`font-body text-sm px-3 py-1.5 cursor-pointer ${
                index === highlighted ? "bg-elevated" : ""
              } ${option.value === value ? "text-primary-300" : "text-text-primary"}`}
            >
              {option.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
