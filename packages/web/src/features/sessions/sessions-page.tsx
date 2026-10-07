import type {
  EnvironmentClientSession,
  EnvironmentRecord,
} from "@t3code-gateway/contracts/schemas";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { RefreshCwIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { AdminShell } from "../../components/admin-shell.tsx";
import { ConfirmDialog } from "../../components/confirm-dialog.tsx";
import { TableToolbar } from "../../components/table-toolbar.tsx";
import { Badge } from "../../components/ui/badge.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Input } from "../../components/ui/input.tsx";
import { Skeleton } from "../../components/ui/skeleton.tsx";
import { Switch } from "../../components/ui/switch.tsx";
import { toastManager } from "../../components/ui/toast.tsx";
import {
  getCurrentUser,
  getGatewayStatus,
  listEnvironmentClients,
  listEnvironments,
  revokeEnvironmentClient,
} from "../../lib/gateway-api.ts";
import { cn } from "../../lib/utils.ts";
import {
  CURRENT_USER_QUERY_KEY,
  environmentClientsQueryKey,
  ENVIRONMENTS_QUERY_KEY,
  GATEWAY_STATUS_QUERY_KEY,
  IS_BROWSER,
} from "../environments/query-keys.ts";

interface SessionRow {
  readonly environment: EnvironmentRecord;
  readonly session: EnvironmentClientSession;
}

const formatDate = (value: string | null) =>
  value === null
    ? "Never"
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
        new Date(value),
      );

const sessionLabel = (session: EnvironmentClientSession) =>
  session.client.label ??
  ([session.client.os, session.client.browser].filter(Boolean).join(" · ") || session.subject);

const sessionKind = (session: EnvironmentClientSession) => {
  if (session.gatewayRole === "admin") {
    return "Gateway admin";
  }
  if (session.gatewayRole === "mcp-relay") {
    return "Gateway MCP";
  }
  if (session.subject === "mcp-client") {
    return "MCP agent";
  }
  const deviceType = session.client.deviceType;
  return deviceType === "unknown" ? "Client" : deviceType[0]?.toUpperCase() + deviceType.slice(1);
};

const sessionDetails = (session: EnvironmentClientSession) =>
  [session.client.os, session.client.browser, session.client.ipAddress]
    .filter((part): part is string => part !== undefined && part.length > 0)
    .join(" · ");

const lastSeen = (session: EnvironmentClientSession) =>
  session.connected
    ? Number.POSITIVE_INFINITY
    : Date.parse(session.lastConnectedAt ?? session.issuedAt);

export function SessionsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showGateway, setShowGateway] = useState(false);
  // Kept after closing so the dialog's text does not go blank while it animates out.
  const [revokeCandidate, setRevokeCandidate] = useState<SessionRow | null>(null);
  const [revokeOpen, setRevokeOpen] = useState(false);

  const currentUserQuery = useQuery({
    queryKey: CURRENT_USER_QUERY_KEY,
    queryFn: getCurrentUser,
    enabled: IS_BROWSER,
  });
  const signedIn = IS_BROWSER && currentUserQuery.data != null;
  const gatewayStatusQuery = useQuery({
    queryKey: GATEWAY_STATUS_QUERY_KEY,
    queryFn: getGatewayStatus,
    enabled: signedIn,
  });
  const environmentsQuery = useQuery({
    queryKey: ENVIRONMENTS_QUERY_KEY,
    queryFn: listEnvironments,
    enabled: signedIn,
  });
  const environments = (environmentsQuery.data ?? []).filter((environment) => environment.enabled);
  const sessionQueries = useQueries({
    queries: environments.map((environment) => ({
      queryKey: environmentClientsQueryKey(environment.environmentId),
      queryFn: () => listEnvironmentClients(environment.environmentId),
      refetchInterval: 30_000,
    })),
  });

  useEffect(() => {
    if (currentUserQuery.isSuccess && currentUserQuery.data === null) {
      void navigate({ to: "/login" });
    }
  }, [currentUserQuery.data, currentUserQuery.isSuccess, navigate]);

  const revokeMutation = useMutation({
    mutationFn: (row: SessionRow) =>
      revokeEnvironmentClient(row.environment.environmentId, row.session.sessionId),
    onSuccess: async (_, row) => {
      setRevokeOpen(false);
      toastManager.add({
        type: "success",
        title: `Revoked ${sessionLabel(row.session)} on ${row.environment.label}`,
      });
      await queryClient.invalidateQueries({
        queryKey: environmentClientsQueryKey(row.environment.environmentId),
      });
    },
    onError: (cause) => {
      toastManager.add({
        type: "error",
        title: "Revoke failed",
        description: cause instanceof Error ? cause.message : undefined,
      });
    },
  });

  if (!signedIn) {
    return (
      <AdminShell t3codeWeb={undefined}>
        <Skeleton className="h-40 w-full" />
      </AdminShell>
    );
  }

  const needle = search.trim().toLowerCase();
  const rows = environments
    .flatMap((environment, index) =>
      (sessionQueries[index]?.data ?? []).map((session) => ({ environment, session })),
    )
    .filter(({ session }) => showGateway || session.gatewayRole === undefined)
    .filter(
      ({ environment, session }) =>
        needle.length === 0 ||
        [
          sessionLabel(session),
          sessionKind(session),
          sessionDetails(session),
          environment.label,
          environment.slug,
        ]
          .join(" ")
          .toLowerCase()
          .includes(needle),
    )
    .toSorted((left, right) => lastSeen(right.session) - lastSeen(left.session));
  const failures = environments.flatMap((environment, index) => {
    const error = sessionQueries[index]?.error;
    return error == null ? [] : [{ environment, message: error.message }];
  });
  const loading = environmentsQuery.isLoading || sessionQueries.some((query) => query.isLoading);

  return (
    <AdminShell t3codeWeb={gatewayStatusQuery.data?.t3codeWeb}>
      <TableToolbar title="Sessions">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Gateway's own
          <Switch checked={showGateway} onCheckedChange={setShowGateway} />
        </label>
        <Input
          nativeInput
          className="w-56"
          size="sm"
          placeholder="Search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Button
          size="xs"
          type="button"
          variant="outline"
          aria-label="Refresh"
          onClick={() =>
            void queryClient.invalidateQueries({ queryKey: ["gateway", "environments"] })
          }
        >
          <RefreshCwIcon />
        </Button>
      </TableToolbar>

      {failures.map(({ environment, message }) => (
        <p className="text-xs text-destructive-foreground" key={environment.environmentId}>
          {environment.label}: {message}
        </p>
      ))}

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-border/60 bg-card p-5 text-sm text-muted-foreground">
          {loading ? "Loading…" : "No sessions."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border/60 bg-card">
          <table className="w-full min-w-[920px] table-fixed text-left text-xs">
            <colgroup>
              <col />
              <col className="w-[14%]" />
              <col className="w-28" />
              <col className="w-[20%]" />
              <col className="w-40" />
              <col className="w-40" />
              <col className="w-24" />
            </colgroup>
            <thead className="border-b border-border/60 bg-foreground/[0.025] text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="px-4 py-3 font-medium">Environment</th>
                <th className="px-4 py-3 font-medium">Kind</th>
                <th className="px-4 py-3 font-medium">Details</th>
                <th className="px-4 py-3 font-medium">Last connected</th>
                <th className="px-4 py-3 font-medium">Expires</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  className="border-b border-border/60 transition-colors last:border-b-0 hover:bg-muted/20"
                  key={`${row.environment.environmentId}:${row.session.sessionId}`}
                >
                  <td className="px-4 py-3">
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className={cn(
                          "size-2 shrink-0 rounded-full",
                          row.session.connected ? "bg-success" : "bg-muted-foreground/30",
                        )}
                      />
                      <span className="truncate">{sessionLabel(row.session)}</span>
                    </span>
                  </td>
                  <td className="truncate px-4 py-3">{row.environment.label}</td>
                  <td className="px-4 py-3">
                    <Badge variant="outline">{sessionKind(row.session)}</Badge>
                  </td>
                  <td
                    className="truncate px-4 py-3 text-muted-foreground"
                    title={sessionDetails(row.session)}
                  >
                    {sessionDetails(row.session) || "—"}
                  </td>
                  <td className="px-4 py-3">
                    {row.session.connected
                      ? "Connected now"
                      : formatDate(row.session.lastConnectedAt)}
                  </td>
                  <td className="px-4 py-3">{formatDate(row.session.expiresAt)}</td>
                  <td className="px-4 py-3 text-right">
                    {/* The gateway's own sessions: revoking the admin token breaks it; MCP sign-ins follow the environment's MCP switch. */}
                    {row.session.gatewayRole === undefined ? (
                      <Button
                        size="xs"
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setRevokeCandidate(row);
                          setRevokeOpen(true);
                        }}
                      >
                        Revoke
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        destructive
        open={revokeOpen}
        title="Revoke session?"
        description={
          revokeCandidate === null
            ? ""
            : `${sessionLabel(revokeCandidate.session)} loses access to ${revokeCandidate.environment.label} and needs a new pairing to connect again.`
        }
        confirmLabel="Revoke"
        pendingLabel="Revoking..."
        pending={revokeMutation.isPending}
        onOpenChange={setRevokeOpen}
        onConfirm={() => {
          if (revokeCandidate !== null) {
            revokeMutation.mutate(revokeCandidate);
          }
        }}
      />
    </AdminShell>
  );
}
