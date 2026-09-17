"use client";

import { Toast } from "@base-ui/react/toast";
import {
  CircleAlertIcon,
  CircleCheckIcon,
  InfoIcon,
  LoaderCircleIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "../../lib/utils.ts";

interface GatewayToastData {}

const toastManager = Toast.createToastManager<GatewayToastData>();

function toastIcon(type: unknown) {
  switch (type) {
    case "error":
      return CircleAlertIcon;
    case "success":
      return CircleCheckIcon;
    case "warning":
      return TriangleAlertIcon;
    case "loading":
      return LoaderCircleIcon;
    default:
      return InfoIcon;
  }
}

function toastIconClassName(type: unknown) {
  switch (type) {
    case "error":
      return "text-destructive-foreground";
    case "success":
      return "text-success-foreground";
    case "warning":
      return "text-warning-foreground";
    case "loading":
      return "text-muted-foreground animate-spin";
    default:
      return "text-muted-foreground";
  }
}

function ToastProvider({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <Toast.Provider toastManager={toastManager}>
      {children}
      <Toasts />
    </Toast.Provider>
  );
}

function Toasts() {
  const { toasts } = Toast.useToastManager<GatewayToastData>();

  return (
    <Toast.Portal data-slot="toast-portal">
      <Toast.Viewport
        className="fixed right-4 top-4 z-60 flex w-[calc(100%-2rem)] max-w-96 flex-col gap-3 outline-none sm:right-6 sm:top-6"
        data-slot="toast-viewport"
      >
        {toasts.map((toast) => {
          const Icon = toastIcon(toast.type);

          return (
            <Toast.Root
              className="relative rounded-lg border bg-popover not-dark:bg-clip-padding text-popover-foreground shadow-lg/5 transition-[opacity,scale,translate] before:pointer-events-none before:absolute before:inset-0 before:rounded-[calc(var(--radius-lg)-1px)] before:shadow-[0_1px_--theme(--color-black/4%)] data-ending-style:translate-x-3 data-ending-style:scale-98 data-ending-style:opacity-0 data-starting-style:translate-x-3 data-starting-style:scale-98 data-starting-style:opacity-0 dark:before:shadow-[0_-1px_--theme(--color-white/6%)]"
              data-slot="toast-root"
              key={toast.id}
              toast={toast}
            >
              <Toast.Content className="flex min-w-0 items-start gap-3 px-3.5 py-3 text-sm">
                <Icon className={cn("mt-0.5 size-4.5 shrink-0", toastIconClassName(toast.type))} />
                <div className="min-w-0 flex-1">
                  <Toast.Title className="min-w-0 [overflow-wrap:anywhere] font-medium" />
                  <Toast.Description className="mt-1 text-muted-foreground" />
                </div>
                <button
                  aria-label="Dismiss notification"
                  className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
                  onClick={() => toastManager.close(toast.id)}
                  type="button"
                >
                  <XIcon className="size-3" />
                </button>
              </Toast.Content>
            </Toast.Root>
          );
        })}
      </Toast.Viewport>
    </Toast.Portal>
  );
}

export { ToastProvider, toastManager };
