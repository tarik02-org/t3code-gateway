import type { EnvironmentClientSession } from "@t3code-gateway/contracts/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { ConfirmDialog } from "../../components/confirm-dialog.tsx";
import { Button } from "../../components/ui/button.tsx";
import {
  Dialog,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../../components/ui/dialog.tsx";
import { Popover, PopoverPopup, PopoverTrigger } from "../../components/ui/popover.tsx";
import { Skeleton } from "../../components/ui/skeleton.tsx";
import { toastManager } from "../../components/ui/toast.tsx";
import { cn } from "../../lib/utils.ts";
import { listEnvironmentClients, revokeEnvironmentClient } from "../../lib/gateway-api.ts";
import { useSessionsDialogStore } from "./sessions-dialog-store.ts";
import { environmentClientsQueryKey, IS_BROWSER } from "./query-keys.ts";

export function SessionsDialog() {
  const queryClient = useQueryClient();
  const open = useSessionsDialogStore((state) => state.open);
  const environment = useSessionsDialogStore((state) => state.environment);
  const clientError = useSessionsDialogStore((state) => state.clientError);
  const revokingSessionId = useSessionsDialogStore((state) => state.revokingSessionId);
  const confirmingRevokeSessionId = useSessionsDialogStore(
    (state) => state.confirmingRevokeSessionId,
  );
  const setOpen = useSessionsDialogStore((state) => state.setOpen);
  const setClientError = useSessionsDialogStore((state) => state.setClientError);
  const setRevokingSessionId = useSessionsDialogStore((state) => state.setRevokingSessionId);
  const setConfirmingRevokeSessionId = useSessionsDialogStore(
    (state) => state.setConfirmingRevokeSessionId,
  );
  const reset = useSessionsDialogStore((state) => state.reset);

  const clientsQuery = useQuery({
    queryKey: environmentClientsQueryKey(environment?.environmentId),
    queryFn: () => {
      if (environment === null) {
        throw new Error("Environment is not selected");
      }
      return listEnvironmentClients(environment.environmentId);
    },
    enabled: IS_BROWSER && open && environment !== null,
  });

  const revokeClientMutation = useMutation({
    mutationFn: (sessionId: string) => {
      if (environment === null) {
        throw new Error("Environment is not selected");
      }
      return revokeEnvironmentClient(environment.environmentId, sessionId);
    },
    onSuccess: async () => {
      setClientError(null);
      setConfirmingRevokeSessionId(null);
      toastManager.add({
        type: "success",
        title: "Client revoked",
        description: "The client session can no longer access this environment.",
      });
      await queryClient.invalidateQueries({
        queryKey: environmentClientsQueryKey(environment?.environmentId),
      });
    },
    onError: (cause) => {
      const message = cause instanceof Error ? cause.message : "Revoke failed";
      setClientError(message);
      toastManager.add({
        type: "error",
        title: "Revoke failed",
        description: message,
      });
    },
    onSettled: () => {
      setRevokingSessionId(null);
    },
  });

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        onOpenChangeComplete={(nextOpen) => {
          if (!nextOpen) {
            reset();
          }
        }}
      >
        <DialogPopup className="h-[min(34rem,calc(100dvh-2rem))] max-w-2xl">
          <DialogHeader>
            <DialogTitle>Authorized clients</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1">
            <DialogPanel>
              <ClientSessionsSection
                clients={clientsQuery.data ?? []}
                error={
                  clientsQuery.error instanceof Error
                    ? clientsQuery.error.message
                    : clientsQuery.error
                      ? "Failed to load client sessions"
                      : clientError
                }
                isLoading={clientsQuery.isLoading}
                isRevoking={revokeClientMutation.isPending}
                revokingSessionId={revokingSessionId}
                onRevoke={setConfirmingRevokeSessionId}
              />
            </DialogPanel>
          </div>
        </DialogPopup>
      </Dialog>
      <ConfirmDialog
        destructive
        open={confirmingRevokeSessionId !== null}
        title="Revoke client session?"
        description="Revoke this client session? The client will need a new pairing link before it can connect again."
        confirmLabel="Revoke"
        pending={revokeClientMutation.isPending}
        pendingLabel="Revoking..."
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setConfirmingRevokeSessionId(null);
          }
        }}
        onConfirm={() => {
          if (confirmingRevokeSessionId !== null) {
            setRevokingSessionId(confirmingRevokeSessionId);
            revokeClientMutation.mutate(confirmingRevokeSessionId);
          }
        }}
      />
    </>
  );
}

function ClientSessionsSection({
  clients,
  error,
  isLoading,
  isRevoking,
  revokingSessionId,
  onRevoke,
}: Readonly<{
  clients: ReadonlyArray<EnvironmentClientSession>;
  error: string | null;
  isLoading: boolean;
  isRevoking: boolean;
  revokingSessionId: string | null;
  onRevoke: (sessionId: string) => void;
}>) {
  if (isLoading) {
    return <ClientSessionsSkeleton />;
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card text-card-foreground">
      {error !== null ? (
        <ClientSessionsMessage className="text-destructive-foreground">
          {error}
        </ClientSessionsMessage>
      ) : null}
      {clients.length === 0 ? (
        <ClientSessionsMessage>No client sessions.</ClientSessionsMessage>
      ) : null}
      {clients.map((clientSession) => (
        <ClientSessionRow
          clientSession={clientSession}
          isRevoking={isRevoking}
          key={clientSession.sessionId}
          revokingSessionId={revokingSessionId}
          onRevoke={onRevoke}
        />
      ))}
    </div>
  );
}

function ClientSessionsSkeleton() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card text-card-foreground">
      {[0, 1, 2].map((row) => (
        <div className="border-t border-border/60 px-4 py-3 first:border-t-0 sm:px-5" key={row}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-center gap-1.5">
                <Skeleton className="size-2 rounded-full" />
                <Skeleton className="h-4 w-36 rounded-full" />
              </div>
              <Skeleton className="h-3 w-56 max-w-full rounded-full" />
            </div>
            <Skeleton className="h-6 w-14 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ClientSessionRow({
  clientSession,
  isRevoking,
  revokingSessionId,
  onRevoke,
}: Readonly<{
  clientSession: EnvironmentClientSession;
  isRevoking: boolean;
  revokingSessionId: string | null;
  onRevoke: (sessionId: string) => void;
}>) {
  const details = formatClientDetails(clientSession);
  const label =
    clientSession.client.label ??
    ([clientSession.client.os, clientSession.client.browser].filter(Boolean).join(" · ") ||
      clientSession.subject);

  return (
    <div className="border-t border-border/60 px-4 py-3 transition-colors first:border-t-0 hover:bg-muted/20 sm:px-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex min-h-5 items-center gap-1.5">
            <span
              className={cn(
                "size-2 rounded-full",
                clientSession.connected || clientSession.current
                  ? "bg-success"
                  : "bg-muted-foreground/30",
              )}
            />
            <h3 className="truncate text-sm font-medium tracking-[-0.005em] text-foreground">
              {label}
            </h3>
            {clientSession.current ? <ClientBadge>This device</ClientBadge> : null}
            {clientSession.gatewayRole === "admin" ? <ClientBadge>Admin</ClientBadge> : null}
          </div>
          <p className="truncate text-[13px] leading-[1.45] text-muted-foreground/80">
            {details.length > 0 ? (
              <>
                {details}
                <span aria-hidden> · </span>
              </>
            ) : null}
            <AccessScopeSummary scopes={clientSession.scopes} label="Client scopes" />
          </p>
        </div>
        {!clientSession.current ? (
          <Button
            size="xs"
            variant="destructive-outline"
            type="button"
            disabled={isRevoking}
            onClick={() => onRevoke(clientSession.sessionId)}
          >
            {isRevoking && revokingSessionId === clientSession.sessionId ? "Revoking..." : "Revoke"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function ClientBadge({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <span className="rounded-md border border-border/50 bg-muted/50 px-1 py-0.5 text-[10px] text-muted-foreground/80">
      {children}
    </span>
  );
}

function AccessScopeSummary({
  scopes,
  label,
}: Readonly<{ scopes: ReadonlyArray<string>; label: string }>) {
  const scopeCountLabel = `${scopes.length} ${scopes.length === 1 ? "scope" : "scopes"}`;

  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={250}
        closeDelay={100}
        render={
          <button
            type="button"
            aria-label={`${label}: show ${scopeCountLabel}`}
            className="cursor-help underline decoration-border underline-offset-2 outline-hidden hover:text-foreground focus-visible:text-foreground"
          />
        }
      >
        {scopeCountLabel}
      </PopoverTrigger>
      <PopoverPopup
        side="top"
        align="start"
        tooltipStyle
        className="w-max max-w-80 whitespace-normal"
      >
        <p className="mb-1 font-medium">Granted scopes</p>
        <div className="flex flex-col gap-0.5">
          {scopes.map((scope) => (
            <code key={scope} className="font-mono text-foreground/85">
              {scope}
            </code>
          ))}
        </div>
      </PopoverPopup>
    </Popover>
  );
}

function ClientSessionsMessage({
  children,
  className,
}: Readonly<{ children: ReactNode; className?: string }>) {
  return (
    <div className={cn("px-4 py-3.5 text-xs text-muted-foreground sm:px-5", className)}>
      {children}
    </div>
  );
}

function formatClientDetails(clientSession: EnvironmentClientSession): string {
  const parts = [
    clientSession.client.deviceType,
    clientSession.client.os,
    clientSession.client.browser,
    clientSession.client.ipAddress,
  ].filter((part): part is string => part !== undefined && part.length > 0);

  return parts.join(" · ");
}
