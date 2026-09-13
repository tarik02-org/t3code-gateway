import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ExternalLinkIcon,
  MinusIcon,
  PlayIcon,
  PlusIcon,
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
import { toastManager } from "./ui/toast.tsx";
import { T3Logo } from "./logo.tsx";
import { ConfirmDialog } from "./confirm-dialog.tsx";
import {
  changePassword,
  checkT3CodeWebUpdates,
  activateT3CodeWebVersion,
  garbageCollectT3CodeWebVersions,
  installT3CodeWebRelease,
  listT3CodeWebReleases,
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
  const releasesQuery = useQuery({
    queryKey: ["gateway", "t3code-web", "releases"],
    queryFn: listT3CodeWebReleases,
    enabled: open,
  });
  const [updateChannel, setUpdateChannel] = useState<T3CodeWebChannel>("nightly");
  const [autoUpdate, setAutoUpdate] = useState(false);
  const [autoGc, setAutoGc] = useState(false);
  const [keepRecent, setKeepRecent] = useState({ stable: 2, nightly: 2 });
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
    },
    onError: (cause) => {
      toastManager.add({
        type: "error",
        title: "Could not save update settings",
        description: cause instanceof Error ? cause.message : "The update settings were not saved.",
      });
    },
  });

  const checkMutation = useMutation({
    mutationFn: checkT3CodeWebUpdates,
    onError: (cause) => {
      toastManager.add({
        type: "error",
        title: "Could not check for updates",
        description: cause instanceof Error ? cause.message : "The update check failed.",
      });
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
    },
  });

  const activateMutation = useMutation({
    mutationFn: activateT3CodeWebVersion,
    onSuccess: (nextStatus) => {
      applyStatus(nextStatus);
    },
    onError: (cause) => {
      toastManager.add({
        type: "error",
        title: "Could not activate version",
        description: cause instanceof Error ? cause.message : "The version could not be activated.",
      });
    },
  });

  const installMutation = useMutation({
    mutationFn: installT3CodeWebRelease,
    onSuccess: (nextStatus) => {
      applyStatus(nextStatus);
      void releasesQuery.refetch();
    },
    onError: (cause) => {
      toastManager.add({
        type: "error",
        title: "Could not install release",
        description: cause instanceof Error ? cause.message : "The release could not be installed.",
      });
    },
  });

  const pinMutation = useMutation({
    mutationFn: setT3CodeWebVersionPin,
    onSuccess: (nextStatus) => {
      applyStatus(nextStatus);
    },
    onError: (cause) => {
      toastManager.add({
        type: "error",
        title: "Could not update version pin",
        description:
          cause instanceof Error ? cause.message : "The version pin could not be updated.",
      });
    },
  });

  const removeMutation = useMutation({
    mutationFn: removeT3CodeWebVersion,
    onSuccess: (nextStatus) => {
      applyStatus(nextStatus);
      setRemoveCandidate(null);
    },
    onError: (cause) => {
      toastManager.add({
        type: "error",
        title: "Could not remove version",
        description: cause instanceof Error ? cause.message : "The version could not be removed.",
      });
    },
  });

  const gcMutation = useMutation({
    mutationFn: garbageCollectT3CodeWebVersions,
    onSuccess: (nextStatus) => {
      applyStatus(nextStatus);
    },
    onError: (cause) => {
      toastManager.add({
        type: "error",
        title: "Could not run garbage collection",
        description: cause instanceof Error ? cause.message : "Garbage collection failed.",
      });
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
            setUpdateResult(null);
          }
          onOpenChange(nextOpen);
        }}
      >
        <DialogPopup className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>T3 Code Versions</DialogTitle>
            <DialogDescription>
              Manage bundled and downloaded versions, pins, and automatic updates.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Version</TableHead>
                      <TableHead>Channel</TableHead>
                      <TableHead>Pinned</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(settings?.versions.length ?? 0) === 0 &&
                    (releasesQuery.data?.filter((release) => !release.installed).length ?? 0) ===
                      0 ? (
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
                          <div className="flex flex-wrap gap-1">
                            <Badge variant="outline">{version.channel}</Badge>
                            {version.forcedPinned ? (
                              <Badge variant="secondary">Bundled</Badge>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={version.pinned}
                            disabled={version.forcedPinned || pinMutation.isPending}
                            aria-label={`Pin ${version.version}`}
                            onCheckedChange={(checked) =>
                              pinMutation.mutate({
                                channel: version.channel,
                                version: checked ? version.version : null,
                              })
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button
                              size="xs"
                              variant={version.active ? "default" : "outline"}
                              disabled={version.active || activateMutation.isPending}
                              onClick={() =>
                                activateMutation.mutate({
                                  channel: version.channel,
                                  version: version.version,
                                })
                              }
                            >
                              <PlayIcon data-icon="inline-start" />
                              {version.active ? "Active" : "Activate"}
                            </Button>
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
                    {(releasesQuery.data ?? [])
                      .filter((release) => !release.installed)
                      .map((release) => (
                        <TableRow key={`release:${release.channel}:${release.version}`}>
                          <TableCell className="font-mono text-xs">{release.version}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{release.channel}</Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">—</TableCell>
                          <TableCell>
                            <div className="flex justify-end">
                              <Button
                                size="xs"
                                variant="outline"
                                disabled={installMutation.isPending}
                                onClick={() =>
                                  installMutation.mutate({
                                    channel: release.channel,
                                    version: release.version,
                                  })
                                }
                              >
                                Install
                              </Button>
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
                  <div className="flex items-center gap-2">
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={checkMutation.isPending}
                      onClick={() => checkMutation.mutate({ channel: updateChannel })}
                    >
                      <RefreshCwIcon data-icon="inline-start" />
                      {checkMutation.isPending
                        ? "Updating..."
                        : updateResult === "updated"
                          ? "Updated"
                          : updateResult === "none"
                            ? "No updates"
                            : "Check now"}
                    </Button>
                    <Switch
                      id="t3code-auto-update"
                      checked={autoUpdate}
                      onCheckedChange={(checked) =>
                        saveDraft(updateChannel, checked, autoGc, keepRecent)
                      }
                    />
                  </div>
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
                  <div className="flex items-center gap-2">
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={gcMutation.isPending}
                      onClick={() => gcMutation.mutate()}
                    >
                      <Trash2Icon data-icon="inline-start" />
                      {gcMutation.isPending ? "Collecting..." : "GC now"}
                    </Button>
                    <Switch
                      id="t3code-auto-gc"
                      checked={autoGc}
                      onCheckedChange={(checked) =>
                        saveDraft(updateChannel, autoUpdate, checked, keepRecent)
                      }
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between gap-4 border-t pt-3">
                  <div className="flex flex-col gap-1">
                    <Label>Keep recent versions</Label>
                    <p className="text-xs text-muted-foreground">
                      Per-channel downloaded versions kept by GC.
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col gap-2">
                    <RetentionInput
                      label="Stable"
                      value={keepRecent.stable}
                      onChange={(value) =>
                        saveDraft(updateChannel, autoUpdate, autoGc, {
                          ...keepRecent,
                          stable: value,
                        })
                      }
                    />
                    <RetentionInput
                      label="Nightly"
                      value={keepRecent.nightly}
                      onChange={(value) =>
                        saveDraft(updateChannel, autoUpdate, autoGc, {
                          ...keepRecent,
                          nightly: value,
                        })
                      }
                    />
                  </div>
                </div>
              </div>
            </div>
          </DialogPanel>
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

function RetentionInput({
  label,
  value,
  onChange,
}: Readonly<{
  label: string;
  value: number;
  onChange: (value: number) => void;
}>) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="min-w-16">{label}</span>
      <div className="flex items-center rounded-md border border-input bg-background">
        <Button
          size="icon"
          variant="ghost"
          className="size-7 rounded-none"
          aria-label={`Decrease ${label} retention`}
          disabled={value === 0}
          onClick={() => onChange(Math.max(0, value - 1))}
        >
          <MinusIcon />
        </Button>
        <Input
          nativeInput
          unstyled
          size="sm"
          type="text"
          inputMode="numeric"
          className="w-16 text-center [&_input]:text-center [&_input]:text-sm"
          value={String(value)}
          aria-label={`${label} versions to keep`}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (Number.isInteger(next) && next >= 0) {
              onChange(next);
            }
          }}
        />
        <Button
          size="icon"
          variant="ghost"
          className="size-7 rounded-none"
          aria-label={`Increase ${label} retention`}
          onClick={() => onChange(value + 1)}
        >
          <PlusIcon />
        </Button>
      </div>
    </div>
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
