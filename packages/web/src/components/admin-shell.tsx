import type { ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "./ui/button.tsx";
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "./ui/dialog.tsx";
import { Input } from "./ui/input.tsx";
import { Label } from "./ui/label.tsx";
import { T3Logo } from "./logo.tsx";
import { changePassword } from "../lib/gateway-api.ts";

export function AdminShell({
  actions,
  children,
}: Readonly<{
  actions?: ReactNode;
  children: ReactNode;
}>) {
  const [passwordOpen, setPasswordOpen] = useState(false);

  return (
    <main className="flex h-dvh flex-col text-foreground">
      <header className="flex h-13 shrink-0 items-center gap-2 bg-background/88 px-4 backdrop-blur">
        <div className="flex h-8 w-auto items-center">
          <T3Logo />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold">Code Gateway</h1>
        </div>
        <Button size="xs" variant="outline" onClick={() => setPasswordOpen(true)}>
          Reset password
        </Button>
        {actions}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-7 sm:px-8 sm:py-10">
          {children}
        </div>
      </div>
      <ResetPasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
    </main>
  );
}

function ResetPasswordDialog({
  open,
  onOpenChange,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>) {
  const formId = "reset-password-form";
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const changePasswordMutation = useMutation({
    mutationFn: changePassword,
    onSuccess: () => {
      setMessage("Password updated.");
      setError(null);
      setCurrentPassword("");
      setNextPassword("");
    },
    onError: (cause) => {
      setMessage(null);
      setError(cause instanceof Error ? cause.message : "Password change failed");
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) {
          setMessage(null);
          setError(null);
          setCurrentPassword("");
          setNextPassword("");
        }
      }}
    >
      <DialogPopup className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
        </DialogHeader>
        <DialogPanel>
          <form
            id={formId}
            onSubmit={(event) => {
              event.preventDefault();
              changePasswordMutation.mutate({ currentPassword, nextPassword });
            }}
          >
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label>Current password</Label>
                <Input
                  nativeInput
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>New password</Label>
                <Input
                  nativeInput
                  type="password"
                  autoComplete="new-password"
                  value={nextPassword}
                  onChange={(event) => setNextPassword(event.target.value)}
                />
              </div>
              {message !== null ? (
                <p className="text-xs text-success-foreground">{message}</p>
              ) : null}
              {error !== null ? (
                <p className="text-xs text-destructive-foreground">{error}</p>
              ) : null}
            </div>
          </form>
        </DialogPanel>
        <DialogFooter>
          <Button form={formId} size="xs" type="submit" disabled={changePasswordMutation.isPending}>
            {changePasswordMutation.isPending ? "Saving..." : "Save password"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
