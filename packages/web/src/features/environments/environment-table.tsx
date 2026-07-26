import type { EnvironmentRecord } from "@t3code-gateway/contracts/schemas";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { ConfirmDialog } from "../../components/confirm-dialog.tsx";
import { CopyButton } from "../../components/copy-button.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Input } from "../../components/ui/input.tsx";
import { Label } from "../../components/ui/label.tsx";
import { Popover, PopoverPopup, PopoverTrigger } from "../../components/ui/popover.tsx";
import { Skeleton } from "../../components/ui/skeleton.tsx";
import { Switch } from "../../components/ui/switch.tsx";
import { toastManager } from "../../components/ui/toast.tsx";
import {
  createT3CodeCatalogEntry,
  deleteEnvironment,
  updateEnvironment,
} from "../../lib/gateway-api.ts";
import { cn } from "../../lib/utils.ts";
import { ENVIRONMENTS_QUERY_KEY } from "./query-keys.ts";
import { useT3CodeCatalogPopoverStore } from "./t3code-catalog-popover-store.ts";
import { useT3CodeCatalogStore } from "./t3code-catalog-store.ts";

export function EnvironmentTable({
  environments,
  onEdit,
  onPair,
  onSessions,
  showWebColumn,
}: Readonly<{
  environments: ReadonlyArray<EnvironmentRecord>;
  onEdit: (environment: EnvironmentRecord) => void;
  onPair: (environment: EnvironmentRecord) => void;
  onSessions: (environment: EnvironmentRecord) => void;
  showWebColumn: boolean;
}>) {
  if (environments.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
        No environments.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-xs">
      <table
        className={cn(
          "w-full table-fixed text-left text-xs",
          showWebColumn ? "min-w-[1040px]" : "min-w-[976px]",
        )}
      >
        <EnvironmentTableColumns showWebColumn={showWebColumn} />
        <thead className="border-b border-border bg-muted/40 text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">Label</th>
            <th className="px-4 py-3 font-medium">Slug</th>
            <th className="px-4 py-3 font-medium">Public URL</th>
            <th className="px-2 py-3 text-center font-medium">Enabled</th>
            {showWebColumn ? <th className="px-2 py-3 text-center font-medium">Web</th> : null}
            <th className="px-4 py-3 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {environments.map((environment) => (
            <tr className="border-b border-border last:border-b-0" key={environment.environmentId}>
              <td className="truncate px-4 py-3">{environment.label}</td>
              <td className="truncate px-4 py-3 font-mono text-xs">{environment.slug}</td>
              <td className="px-4 py-3">
                <div className="flex min-w-0 items-center gap-1">
                  <a
                    className="min-w-0 [overflow-wrap:anywhere] text-primary hover:underline"
                    href={environment.publicUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {environment.publicUrl}
                  </a>
                  <CopyButton
                    className="size-5 rounded-sm opacity-55 hover:opacity-100 [&_svg]:size-3"
                    label={`${environment.label} public URL`}
                    value={environment.publicUrl}
                  />
                </div>
              </td>
              <td className="px-2 py-3 text-center">
                <EnvironmentEnabledSwitch environment={environment} />
              </td>
              {showWebColumn ? (
                <td className="px-2 py-3 text-center">
                  <T3CodeCatalogSwitch environment={environment} />
                </td>
              ) : null}
              <td className="px-4 py-3">
                <div className="flex justify-end gap-2">
                  <Button size="xs" variant="outline" onClick={() => onPair(environment)}>
                    Pair
                  </Button>
                  <Button size="xs" variant="outline" onClick={() => onSessions(environment)}>
                    Sessions
                  </Button>
                  <Button size="xs" variant="outline" onClick={() => onEdit(environment)}>
                    Edit
                  </Button>
                  <DeleteEnvironmentButton environment={environment} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const errorMessage = (cause: unknown, fallback: string) =>
  cause instanceof Error ? cause.message : fallback;

function EnvironmentEnabledSwitch({
  environment,
}: Readonly<{
  environment: EnvironmentRecord;
}>) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (enabled: boolean) => updateEnvironment(environment.environmentId, { enabled }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ENVIRONMENTS_QUERY_KEY });
    },
    onError: (cause) => {
      toastManager.add({
        type: "error",
        title: "Update failed",
        description: errorMessage(cause, "Could not update environment."),
      });
    },
  });

  return (
    <Switch
      checked={environment.enabled}
      disabled={mutation.isPending}
      onCheckedChange={(checked) => mutation.mutate(checked)}
    />
  );
}

function DeleteEnvironmentButton({
  environment,
}: Readonly<{
  environment: EnvironmentRecord;
}>) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => deleteEnvironment(environment.environmentId),
    onSuccess: async () => {
      setConfirmOpen(false);
      toastManager.add({
        type: "success",
        title: "Environment deleted",
        description: environment.label,
      });
      await queryClient.invalidateQueries({ queryKey: ENVIRONMENTS_QUERY_KEY });
    },
    onError: (cause) => {
      toastManager.add({
        type: "error",
        title: "Delete failed",
        description: errorMessage(cause, "Could not delete environment."),
      });
    },
  });

  return (
    <>
      <Button
        size="xs"
        variant="destructive-outline"
        disabled={mutation.isPending}
        onClick={() => setConfirmOpen(true)}
      >
        Delete
      </Button>
      <ConfirmDialog
        destructive
        open={confirmOpen}
        title="Delete environment?"
        description={`Delete ${environment.label} from the gateway? This removes its gateway route and stored token.`}
        confirmLabel="Delete"
        pending={mutation.isPending}
        pendingLabel="Deleting..."
        onOpenChange={setConfirmOpen}
        onConfirm={() => mutation.mutate()}
      />
    </>
  );
}

export function EnvironmentTableSkeleton({ showWebColumn }: Readonly<{ showWebColumn: boolean }>) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
      <table
        className={cn(
          "w-full table-fixed text-left text-xs",
          showWebColumn ? "min-w-[1040px]" : "min-w-[976px]",
        )}
      >
        <EnvironmentTableColumns showWebColumn={showWebColumn} />
        <thead className="border-b border-border bg-muted/40 text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">Label</th>
            <th className="px-4 py-3 font-medium">Slug</th>
            <th className="px-4 py-3 font-medium">Public URL</th>
            <th className="px-2 py-3 text-center font-medium">Enabled</th>
            {showWebColumn ? <th className="px-2 py-3 text-center font-medium">Web</th> : null}
            <th className="px-4 py-3 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {[0, 1, 2].map((row) => (
            <tr className="border-b border-border last:border-b-0" key={row}>
              <td className="px-4 py-3">
                <Skeleton className="h-4 w-32 rounded-full" />
              </td>
              <td className="px-4 py-3">
                <Skeleton className="h-4 w-24 rounded-full" />
              </td>
              <td className="px-4 py-3">
                <Skeleton className="h-4 w-64 max-w-full rounded-full" />
              </td>
              <td className="px-2 py-3">
                <Skeleton className="mx-auto h-5 w-9 rounded-full" />
              </td>
              {showWebColumn ? (
                <td className="px-2 py-3">
                  <Skeleton className="mx-auto h-5 w-9 rounded-full" />
                </td>
              ) : null}
              <td className="px-4 py-3">
                <div className="flex justify-end gap-2">
                  <Skeleton className="h-6 w-10 rounded-md" />
                  <Skeleton className="h-6 w-16 rounded-md" />
                  <Skeleton className="h-6 w-10 rounded-md" />
                  <Skeleton className="h-6 w-12 rounded-md" />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EnvironmentTableColumns({ showWebColumn }: Readonly<{ showWebColumn: boolean }>) {
  return (
    <colgroup>
      <col className="w-[16%]" />
      <col className="w-[13%]" />
      <col />
      <col className="w-18" />
      {showWebColumn ? <col className="w-16" /> : null}
      <col className="w-64" />
    </colgroup>
  );
}

function T3CodeCatalogSwitch({
  environment,
}: Readonly<{
  environment: EnvironmentRecord;
}>) {
  const installedEnvironmentIds = useT3CodeCatalogStore((state) => state.installedEnvironmentIds);
  const clientLabel = useT3CodeCatalogStore((state) => state.clientLabel);
  const rememberClientLabel = useT3CodeCatalogStore((state) => state.rememberClientLabel);
  const installEntry = useT3CodeCatalogStore((state) => state.installEntry);
  const removeEnvironment = useT3CodeCatalogStore((state) => state.removeEnvironment);
  const openEnvironmentId = useT3CodeCatalogPopoverStore((state) => state.openEnvironmentId);
  const editingClientLabel = useT3CodeCatalogPopoverStore((state) => state.editingClientLabel);
  const clientLabelInput = useT3CodeCatalogPopoverStore((state) => state.clientLabelInput);
  const openFor = useT3CodeCatalogPopoverStore((state) => state.openFor);
  const close = useT3CodeCatalogPopoverStore((state) => state.close);
  const editClientLabel = useT3CodeCatalogPopoverStore((state) => state.editClientLabel);
  const useRememberedClientLabel = useT3CodeCatalogPopoverStore(
    (state) => state.useRememberedClientLabel,
  );
  const setClientLabelInput = useT3CodeCatalogPopoverStore((state) => state.setClientLabelInput);
  const open = openEnvironmentId === environment.environmentId;
  const installed = installedEnvironmentIds.has(environment.environmentId);
  const installMutation = useMutation({
    mutationFn: async (nextClientLabel: string) => {
      const entry = await createT3CodeCatalogEntry(environment.environmentId, {
        clientLabel: nextClientLabel,
      });
      await installEntry(entry);
    },
    onSuccess: () => {
      toastManager.add({
        type: "success",
        title: "Added to web",
        description: environment.label,
      });
    },
    onError: (cause) => {
      toastManager.add({
        type: "error",
        title: "Add to web failed",
        description: errorMessage(cause, "Could not add environment to web."),
      });
    },
  });
  const removeMutation = useMutation({
    mutationFn: () => removeEnvironment(environment.environmentId),
    onSuccess: () => {
      toastManager.add({
        type: "success",
        title: "Removed from web",
        description: environment.label,
      });
    },
    onError: (cause) => {
      toastManager.add({
        type: "error",
        title: "Remove from web failed",
        description: errorMessage(cause, "Could not remove environment from web."),
      });
    },
  });
  const isPending = installMutation.isPending || removeMutation.isPending;

  if (installed) {
    return (
      <Switch
        aria-label={`Remove ${environment.label} from web`}
        checked
        disabled={isPending}
        onCheckedChange={(checked) => {
          if (!checked) {
            removeMutation.mutate();
          }
        }}
      />
    );
  }

  const rememberAndInstall = (nextClientLabel: string) => {
    rememberClientLabel(nextClientLabel);
    installMutation.mutate(nextClientLabel);
    close();
  };

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          openFor({ environmentId: environment.environmentId, clientLabel });
          return;
        }
        close();
      }}
    >
      <PopoverTrigger
        render={
          <Switch
            aria-label={`Add ${environment.label} to web`}
            checked={false}
            disabled={isPending}
          />
        }
      />
      <PopoverPopup className="w-72" side="bottom" align="end">
        {clientLabel !== null && !editingClientLabel ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium">Client label</p>
              <p className="min-h-4 truncate text-xs text-muted-foreground">
                {clientLabel.length > 0 ? clientLabel : "No label"}
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button size="xs" variant="outline" onClick={editClientLabel}>
                Change
              </Button>
              <Button size="xs" onClick={() => rememberAndInstall(clientLabel)}>
                Add
              </Button>
            </div>
          </div>
        ) : (
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              rememberAndInstall(clientLabelInput);
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label>Client label</Label>
              <Input
                nativeInput
                value={clientLabelInput}
                placeholder={environment.label}
                onChange={(event) => setClientLabelInput(event.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              {clientLabel !== null ? (
                <Button size="xs" variant="outline" onClick={useRememberedClientLabel}>
                  Back
                </Button>
              ) : null}
              <Button size="xs" type="submit">
                Add
              </Button>
            </div>
          </form>
        )}
      </PopoverPopup>
    </Popover>
  );
}
