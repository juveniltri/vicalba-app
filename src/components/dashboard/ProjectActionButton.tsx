"use client";

import { useTransition, type ReactNode } from "react";
import { useToast } from "@/components/ui/Toast";

type ActionResult = { error: string } | void | undefined;

export function ProjectActionButton({
  action,
  label,
  pendingLabel,
  successMessage,
  disabled,
  className,
  children,
}: {
  action: () => Promise<ActionResult>;
  label: string;
  pendingLabel: string;
  successMessage: string;
  disabled?: boolean;
  className: string;
  children?: ReactNode;
}) {
  const [isPending, startTransition] = useTransition();
  const toast = useToast();

  const handleClick = () => {
    startTransition(async () => {
      const result = await action();
      if (result && "error" in result) {
        toast.error(result.error);
      } else {
        toast.success(successMessage);
      }
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || isPending}
      className={className}
    >
      {children}
      {isPending ? pendingLabel : label}
    </button>
  );
}
