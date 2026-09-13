import type { ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Settings2Icon } from "lucide-react";
import { useState } from "react";

import type { GatewayStatus, T3CodeWebChannel } from "@t3code-gateway/contracts/schemas";

import { Button } from "./ui/button.tsx";
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog.tsx";
import { Badge } from "./ui/badge.tsx";
import { Input } from "./ui/input.tsx";
import { Label } from "./ui/label.tsx";
import { Switch } from "./ui/switch.tsx";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group.tsx";
import { T3Logo } from "./logo.tsx";
import { changePassword, updateT3CodeWebSettings } from "../lib/gateway-api.ts";
import { GATEWAY_STATUS_QUERY_KEY } from "../features/environments/query-keys.ts";

export function AdminShell({
  actions,
  children,
  t3codeWeb,
}: Readonly<{
  actions?: ReactNode;
  children: ReactNode;
  t3codeWeb: GatewayStatus["t3codeWeb"] | undefined;
}>) {
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

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
        {t3codeWeb?.available === true ? (
          <Button size="xs" variant="outline" onClick={() => setSettingsOpen(true)}>
            <Settings2Icon data-icon="inline-start" />
            T3 Code
          </Button>
        ) : null}
        {actions}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-7 sm:px-8 sm:py-10">
          {children}
        </div>
      </div>
      <ResetPasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
      <T3CodeSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={t3codeWeb}
      />
    </main>
  );
}

function T3CodeSettingsDialog({
  open,
  onOpenChange,
  settings,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: GatewayStatus["t3codeWeb"] | undefined;
}>) {
  const queryClient = useQueryClient();
  const [channel, setChannel] = useState<T3CodeWebChannel>("nightly");
  const [autoUpdate, setAutoUpdate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: updateT3CodeWebSettings,
    onSuccess: (nextStatus) => {
      queryClient.setQueryData(GATEWAY_STATUS_QUERY_KEY, nextStatus);
      setError(null);
      onOpenChange(false);
    },
    onError: (cause) => {
      setError(cause instanceof Error ? cause.message : "Could not save T3 Code settings.");
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen && settings !== undefined) {
          setChannel(settings.channel);
          setAutoUpdate(settings.autoUpdate);
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogPopup className="max-w-md">
        <DialogHeader>
          <DialogTitle>T3 Code settings</DialogTitle>
          <DialogDescription>Choose which bundled channel the gateway serves.</DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <Label>Channel</Label>
              <ToggleGroup
                type="single"
                variant="outline"
                value={channel}
                onValueChange={(value) => {
                  if (value === "stable" || value === "nightly") {
                    setChannel(value);
                  }
                }}
                aria-label="T3 Code channel"
              >
                <ToggleGroupItem value="stable">Stable</ToggleGroupItem>
                <ToggleGroupItem value="nightly">Nightly</ToggleGroupItem>
              </ToggleGroup>
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">
                  Stable {settings?.channels.stable.installedVersion ?? "not installed"}
                </Badge>
                <Badge variant="outline">
                  Nightly {settings?.channels.nightly.installedVersion ?? "not installed"}
                </Badge>
              </div>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
              <div className="flex flex-col gap-1">
                <Label htmlFor="t3code-auto-update">Automatic updates</Label>
                <p className="text-xs text-muted-foreground">
                  Check GitHub periodically for the selected channel.
                </p>
              </div>
              <Switch
                id="t3code-auto-update"
                checked={autoUpdate}
                onCheckedChange={setAutoUpdate}
              />
            </div>
            {error !== null ? <p className="text-xs text-destructive-foreground">{error}</p> : null}
          </div>
        </DialogPanel>
        <DialogFooter>
          <Button
            size="xs"
            type="button"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate({ channel, autoUpdate })}
          >
            {mutation.isPending ? "Saving..." : "Save settings"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
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
