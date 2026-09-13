import type { ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ExternalLinkIcon,
  PinIcon,
  PinOffIcon,
  PlayIcon,
  RefreshCwIcon,
  Trash2Icon,
} from "lucide-react";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table.tsx";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group.tsx";
import { T3Logo } from "./logo.tsx";
import { ConfirmDialog } from "./confirm-dialog.tsx";
import {
  changePassword,
  checkT3CodeWebUpdates,
  activateT3CodeWebVersion,
  garbageCollectT3CodeWebVersions,
  removeT3CodeWebVersion,
  setT3CodeWebVersionPin,
  updateT3CodeWebSettings,
} from "../lib/gateway-api.ts";
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
  const [updatesOpen, setUpdatesOpen] = useState(false);

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
          <>
            <Button size="xs" render={<a href="/" target="_blank" rel="noreferrer" />}>
              <ExternalLinkIcon data-icon="inline-start" />
              Open T3 Code
            </Button>
            <Button size="xs" variant="outline" onClick={() => setUpdatesOpen(true)}>
              <RefreshCwIcon data-icon="inline-start" />
              T3 Code Versions
            </Button>
          </>
        ) : null}
        {actions}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-7 sm:px-8 sm:py-10">
          {children}
        </div>
      </div>
      <ResetPasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
      <T3CodeUpdatesDialog open={updatesOpen} onOpenChange={setUpdatesOpen} settings={t3codeWeb} />
    </main>
  );
}

function T3CodeUpdatesDialog({
  open,
  onOpenChange,
  settings,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: GatewayStatus["t3codeWeb"] | undefined;
}>) {
  const queryClient = useQueryClient();
  const [updateChannel, setUpdateChannel] = useState<T3CodeWebChannel>("nightly");
  const [autoUpdate, setAutoUpdate] = useState(false);
  const [autoGc, setAutoGc] = useState(false);
  const [keepRecent, setKeepRecent] = useState({ stable: 2, nightly: 2 });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updateResult, setUpdateResult] = useState<"updated" | "none" | null>(null);
  const [removeCandidate, setRemoveCandidate] = useState<{
    readonly channel: T3CodeWebChannel;
    readonly version: string;
  } | null>(null);

  const applyStatus = (nextStatus: GatewayStatus) => {
    queryClient.setQueryData(GATEWAY_STATUS_QUERY_KEY, nextStatus);
  };

  const settingsMutation = useMutation({
    mutationFn: updateT3CodeWebSettings,
    onSuccess: (nextStatus) => {
      applyStatus(nextStatus);
      setMessage("Update settings saved.");
      setError(null);
    },
    onError: (cause) => {
      setMessage(null);
      setError(cause instanceof Error ? cause.message : "Could not save update settings.");
    },
  });

  const checkMutation = useMutation({
    mutationFn: checkT3CodeWebUpdates,
    onError: (cause) => {
      setError(cause instanceof Error ? cause.message : "Could not check for updates.");
      setUpdateResult(null);
    },
    onSuccess: (nextStatus) => {
      applyStatus(nextStatus);
      const previousVersion =
        settings?.versions
          .filter((version) => version.channel === updateChannel)
          .map((version) => version.version)
          .toSorted()
          .at(-1) ?? null;
      const nextVersion =
        nextStatus.t3codeWeb.versions
          .filter((version) => version.channel === updateChannel)
          .map((version) => version.version)
          .toSorted()
          .at(-1) ?? null;
      setUpdateResult(previousVersion === nextVersion ? "none" : "updated");
      setError(null);
    },
  });

  const activateMutation = useMutation({
    mutationFn: activateT3CodeWebVersion,
    onSuccess: (nextStatus) => {
      applyStatus(nextStatus);
      setMessage("Version activated and pinned.");
      setError(null);
    },
    onError: (cause) => {
      setError(cause instanceof Error ? cause.message : "Could not activate that version.");
    },
  });

  const pinMutation = useMutation({
    mutationFn: setT3CodeWebVersionPin,
    onSuccess: (nextStatus) => {
      applyStatus(nextStatus);
      setMessage("Version pin updated.");
      setError(null);
    },
    onError: (cause) => {
      setError(cause instanceof Error ? cause.message : "Could not update the version pin.");
    },
  });

  const removeMutation = useMutation({
    mutationFn: removeT3CodeWebVersion,
    onSuccess: (nextStatus) => {
      applyStatus(nextStatus);
      setRemoveCandidate(null);
      setMessage("Version removed.");
      setError(null);
    },
    onError: (cause) => {
      setError(cause instanceof Error ? cause.message : "Could not remove that version.");
    },
  });

  const gcMutation = useMutation({
    mutationFn: garbageCollectT3CodeWebVersions,
    onSuccess: (nextStatus) => {
      applyStatus(nextStatus);
      setMessage("Unused versions removed.");
      setError(null);
    },
    onError: (cause) => {
      setError(cause instanceof Error ? cause.message : "Could not remove unused versions.");
    },
  });

  const saveDraft = (
    nextUpdateChannel: T3CodeWebChannel,
    nextAutoUpdate: boolean,
    nextAutoGc = autoGc,
    nextKeepRecent = keepRecent,
  ) => {
    setUpdateChannel(nextUpdateChannel);
    setAutoUpdate(nextAutoUpdate);
    setAutoGc(nextAutoGc);
    setKeepRecent(nextKeepRecent);
    setMessage("Saving...");
    setError(null);
    setUpdateResult(null);
    settingsMutation.mutate({
      updateChannel: nextUpdateChannel,
      autoUpdate: nextAutoUpdate,
      autoGc: nextAutoGc,
      keepRecent: nextKeepRecent,
    });
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (nextOpen && settings !== undefined) {
            setUpdateChannel(settings.updateChannel);
            setAutoUpdate(settings.autoUpdate);
            setAutoGc(settings.autoGc);
            setKeepRecent(settings.keepRecent);
            setMessage(null);
            setError(null);
            setUpdateResult(null);
          }
          onOpenChange(nextOpen);
        }}
      >
        <DialogPopup className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>T3 Code Versions</DialogTitle>
            <DialogDescription>
              Manage bundled and downloaded versions, pins, and automatic updates.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <Label>Installed versions</Label>
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={gcMutation.isPending}
                    onClick={() => gcMutation.mutate()}
                  >
                    <Trash2Icon data-icon="inline-start" />
                    {gcMutation.isPending ? "Collecting..." : "GC unused"}
                  </Button>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Version</TableHead>
                      <TableHead>Channel</TableHead>
                      <TableHead>State</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(settings?.versions.length ?? 0) === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-muted-foreground">
                          No T3 Code versions are installed.
                        </TableCell>
                      </TableRow>
                    ) : null}
                    {(settings?.versions ?? []).map((version) => (
                      <TableRow key={`${version.channel}:${version.version}`}>
                        <TableCell className="font-mono text-xs">{version.version}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{version.channel}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {version.active ? <Badge>Active</Badge> : null}
                            {version.pinned ? <Badge variant="secondary">Pinned</Badge> : null}
                            {version.forcedPinned ? (
                              <Badge variant="secondary">Bundled</Badge>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            {!version.active ? (
                              <Button
                                size="xs"
                                variant="outline"
                                disabled={activateMutation.isPending}
                                onClick={() =>
                                  activateMutation.mutate({
                                    channel: version.channel,
                                    version: version.version,
                                  })
                                }
                              >
                                <PlayIcon data-icon="inline-start" />
                                Activate
                              </Button>
                            ) : null}
                            {!version.forcedPinned && version.pinned ? (
                              <Button
                                size="xs"
                                variant="outline"
                                disabled={pinMutation.isPending}
                                onClick={() =>
                                  pinMutation.mutate({ channel: version.channel, version: null })
                                }
                              >
                                <PinOffIcon data-icon="inline-start" />
                                Unpin
                              </Button>
                            ) : null}
                            {!version.forcedPinned && !version.pinned ? (
                              <Button
                                size="xs"
                                variant="outline"
                                disabled={pinMutation.isPending}
                                onClick={() =>
                                  pinMutation.mutate({
                                    channel: version.channel,
                                    version: version.version,
                                  })
                                }
                              >
                                <PinIcon data-icon="inline-start" />
                                Pin
                              </Button>
                            ) : null}
                            {version.source === "downloaded" &&
                            !version.active &&
                            !version.pinned ? (
                              <Button
                                size="xs"
                                variant="destructive"
                                disabled={removeMutation.isPending}
                                onClick={() =>
                                  setRemoveCandidate({
                                    channel: version.channel,
                                    version: version.version,
                                  })
                                }
                              >
                                <Trash2Icon data-icon="inline-start" />
                                Remove
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex flex-col gap-3 rounded-lg border p-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="t3code-auto-update">Automatic updates</Label>
                    <p className="text-xs text-muted-foreground">
                      Check GitHub periodically for the selected channel.
                    </p>
                  </div>
                  <Switch
                    id="t3code-auto-update"
                    checked={autoUpdate}
                    onCheckedChange={(checked) =>
                      saveDraft(updateChannel, checked, autoGc, keepRecent)
                    }
                  />
                </div>
                <div className="flex items-center justify-between gap-3 border-t pt-3">
                  <div className="flex flex-col gap-1">
                    <Label>Update channel</Label>
                    <p className="text-xs text-muted-foreground">
                      Automatic updates download and switch within this channel.
                    </p>
                  </div>
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    value={updateChannel}
                    onValueChange={(value) => {
                      if (value === "stable" || value === "nightly") {
                        saveDraft(value, autoUpdate, autoGc, keepRecent);
                      }
                    }}
                    aria-label="Automatic update channel"
                  >
                    <ToggleGroupItem value="stable">Stable</ToggleGroupItem>
                    <ToggleGroupItem value="nightly">Nightly</ToggleGroupItem>
                  </ToggleGroup>
                </div>
                <div className="flex items-center justify-between gap-4 border-t pt-3">
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="t3code-auto-gc">Automatic GC</Label>
                    <p className="text-xs text-muted-foreground">
                      Remove old unpinned downloads during the periodic update check.
                    </p>
                  </div>
                  <Switch
                    id="t3code-auto-gc"
                    checked={autoGc}
                    onCheckedChange={(checked) =>
                      saveDraft(updateChannel, autoUpdate, checked, keepRecent)
                    }
                  />
                </div>
                <div className="flex flex-col gap-2 border-t pt-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex flex-col gap-1">
                      <Label>Keep recent versions</Label>
                      <p className="text-xs text-muted-foreground">
                        Per-channel downloaded versions kept by GC.
                      </p>
                    </div>
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={gcMutation.isPending}
                      onClick={() => gcMutation.mutate()}
                    >
                      <Trash2Icon data-icon="inline-start" />
                      {gcMutation.isPending ? "Collecting..." : "GC now"}
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Label className="flex items-center gap-2 text-xs">
                      Stable
                      <Input
                        nativeInput
                        type="number"
                        min={0}
                        value={keepRecent.stable}
                        onChange={(event) => {
                          const value = Number(event.target.value);
                          if (Number.isInteger(value) && value >= 0) {
                            saveDraft(updateChannel, autoUpdate, autoGc, {
                              ...keepRecent,
                              stable: value,
                            });
                          }
                        }}
                      />
                    </Label>
                    <Label className="flex items-center gap-2 text-xs">
                      Nightly
                      <Input
                        nativeInput
                        type="number"
                        min={0}
                        value={keepRecent.nightly}
                        onChange={(event) => {
                          const value = Number(event.target.value);
                          if (Number.isInteger(value) && value >= 0) {
                            saveDraft(updateChannel, autoUpdate, autoGc, {
                              ...keepRecent,
                              nightly: value,
                            });
                          }
                        }}
                      />
                    </Label>
                  </div>
                </div>
              </div>
            </div>
          </DialogPanel>
          <DialogFooter>
            <div className="flex-1 text-xs sm:mr-auto">
              {error !== null ? (
                <span className="text-destructive-foreground">{error}</span>
              ) : message !== null ? (
                <span className="text-success-foreground">{message}</span>
              ) : null}
            </div>
            <Button
              size="xs"
              type="button"
              disabled={checkMutation.isPending}
              onClick={() => checkMutation.mutate({ channel: updateChannel })}
            >
              <RefreshCwIcon data-icon="inline-start" />
              {checkMutation.isPending
                ? "Updating..."
                : updateResult === "updated"
                  ? "Updated"
                  : updateResult === "none"
                    ? "No updates available"
                    : "Check for updates"}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
      <ConfirmDialog
        open={removeCandidate !== null}
        title="Remove T3 Code version?"
        description={
          removeCandidate === null
            ? ""
            : `Remove ${removeCandidate.version} from the ${removeCandidate.channel} channel?`
        }
        confirmLabel="Remove version"
        pendingLabel="Removing..."
        destructive
        pending={removeMutation.isPending}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !removeMutation.isPending) {
            setRemoveCandidate(null);
          }
        }}
        onConfirm={() => {
          if (removeCandidate !== null) {
            removeMutation.mutate(removeCandidate);
          }
        }}
      />
    </>
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
