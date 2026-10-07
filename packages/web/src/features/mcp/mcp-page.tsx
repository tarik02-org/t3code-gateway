import type { EnvironmentRecord, McpGrant } from "@t3code-gateway/contracts/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { KeyRoundIcon, PlugIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { AdminShell } from "../../components/admin-shell.tsx";
import { ConfirmDialog } from "../../components/confirm-dialog.tsx";
import { TableToolbar } from "../../components/table-toolbar.tsx";
import { Badge } from "../../components/ui/badge.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Skeleton } from "../../components/ui/skeleton.tsx";
import { toastManager } from "../../components/ui/toast.tsx";
import {
  getCurrentUser,
  getGatewayStatus,
  listEnvironments,
  listMcpGrants,
  revokeMcpGrant,
} from "../../lib/gateway-api.ts";
import {
  CURRENT_USER_QUERY_KEY,
  ENVIRONMENTS_QUERY_KEY,
  GATEWAY_STATUS_QUERY_KEY,
  IS_BROWSER,
} from "../environments/query-keys.ts";
import { ConnectAgentDialog } from "./connect-agent-dialog.tsx";
import { CreateTokenDialog } from "./create-token-dialog.tsx";
import { mcpAccessTitle } from "./mcp-access.ts";
import { MCP_GRANTS_QUERY_KEY } from "./query-keys.ts";

const formatDate = (value: string | null) =>
  value === null
    ? "—"
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
        new Date(value),
      );

const environmentNames = (
  environmentIds: ReadonlyArray<string> | null,
  environments: ReadonlyArray<EnvironmentRecord>,
) => {
  if (environmentIds === null) {
    return "All";
  }
  return environmentIds
    .map((id) => environments.find((environment) => environment.environmentId === id)?.slug ?? id)
    .join(", ");
};

export function McpPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [connectOpen, setConnectOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [revokeCandidate, setRevokeCandidate] = useState<McpGrant | null>(null);
  const mcpUrl = IS_BROWSER ? `${window.location.origin}/mcp` : "/mcp";

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
  const grantsQuery = useQuery({
    queryKey: MCP_GRANTS_QUERY_KEY,
    queryFn: listMcpGrants,
    enabled: signedIn,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (currentUserQuery.isSuccess && currentUserQuery.data === null) {
      void navigate({ to: "/login" });
    }
  }, [currentUserQuery.data, currentUserQuery.isSuccess, navigate]);

  const revokeMutation = useMutation({
    mutationFn: (grant: McpGrant) => revokeMcpGrant(grant.grantId),
    onSuccess: async (_, grant) => {
      setRevokeCandidate(null);
      toastManager.add({ type: "success", title: `Revoked ${grant.label}` });
      await queryClient.invalidateQueries({ queryKey: MCP_GRANTS_QUERY_KEY });
    },
    onError: (cause) => {
      toastManager.add({
        type: "error",
        title: "Could not revoke the connection",
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

  const environments = environmentsQuery.data ?? [];
  const grants = grantsQuery.data ?? [];

  return (
    <AdminShell t3codeWeb={gatewayStatusQuery.data?.t3codeWeb}>
      <TableToolbar title="Connections">
        <Button size="xs" type="button" variant="outline" onClick={() => setCreateOpen(true)}>
          <KeyRoundIcon data-icon="inline-start" />
          Create token
        </Button>
        <Button size="xs" type="button" onClick={() => setConnectOpen(true)}>
          <PlugIcon data-icon="inline-start" />
          Connect agent
        </Button>
      </TableToolbar>

      {grants.length === 0 ? (
        <div className="rounded-2xl border border-border/60 bg-card p-5 text-sm text-muted-foreground">
          {grantsQuery.isLoading ? "Loading…" : "No agents connected."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border/60 bg-card">
          <table className="w-full min-w-[880px] table-fixed text-left text-xs">
            <colgroup>
              <col />
              <col className="w-24" />
              <col className="w-36" />
              <col className="w-[18%]" />
              <col className="w-44" />
              <col className="w-44" />
              <col className="w-24" />
            </colgroup>
            <thead className="border-b border-border/60 bg-foreground/[0.025] text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Sign-in</th>
                <th className="px-4 py-3 font-medium">Access</th>
                <th className="px-4 py-3 font-medium">Environments</th>
                <th className="px-4 py-3 font-medium">Last used</th>
                <th className="px-4 py-3 font-medium">Expires</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {grants.map((grant) => (
                <tr
                  className="border-b border-border/60 transition-colors last:border-b-0 hover:bg-muted/20"
                  key={grant.grantId}
                >
                  <td className="truncate px-4 py-3">{grant.label}</td>
                  <td className="px-4 py-3">
                    <Badge variant="outline">{grant.kind === "oauth" ? "OAuth" : "Token"}</Badge>
                  </td>
                  <td className="truncate px-4 py-3">{mcpAccessTitle(grant.access)}</td>
                  <td className="truncate px-4 py-3 font-mono">
                    {environmentNames(grant.environmentIds, environments)}
                  </td>
                  <td className="px-4 py-3">{formatDate(grant.lastUsedAt)}</td>
                  <td className="px-4 py-3">
                    {grant.kind === "oauth" ? "—" : formatDate(grant.expiresAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      size="xs"
                      type="button"
                      variant="outline"
                      onClick={() => setRevokeCandidate(grant)}
                    >
                      Revoke
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConnectAgentDialog open={connectOpen} onOpenChange={setConnectOpen} mcpUrl={mcpUrl} />
      <CreateTokenDialog open={createOpen} onOpenChange={setCreateOpen} mcpUrl={mcpUrl} />
      <ConfirmDialog
        open={revokeCandidate !== null}
        title="Revoke connection"
        description={`${revokeCandidate?.label ?? "This agent"} loses access to every environment right away.`}
        confirmLabel="Revoke"
        pendingLabel="Revoking..."
        destructive
        pending={revokeMutation.isPending}
        onOpenChange={(open) => {
          if (!open) {
            setRevokeCandidate(null);
          }
        }}
        onConfirm={() => {
          if (revokeCandidate !== null) {
            revokeMutation.mutate(revokeCandidate);
          }
        }}
      />
    </AdminShell>
  );
}
