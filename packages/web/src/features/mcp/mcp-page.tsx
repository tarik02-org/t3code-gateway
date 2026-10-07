import type { EnvironmentRecord, McpGrant } from "@t3code-gateway/contracts/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { KeyRoundIcon, PlugIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { AdminShell } from "../../components/admin-shell.tsx";
import { ConfirmDialog } from "../../components/confirm-dialog.tsx";
import { Badge } from "../../components/ui/badge.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Skeleton } from "../../components/ui/skeleton.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table.tsx";
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
    <AdminShell
      t3codeWeb={gatewayStatusQuery.data?.t3codeWeb}
      actions={
        <>
          <Button size="xs" type="button" variant="outline" onClick={() => setCreateOpen(true)}>
            <KeyRoundIcon data-icon="inline-start" />
            Create token
          </Button>
          <Button size="xs" type="button" onClick={() => setConnectOpen(true)}>
            <PlugIcon data-icon="inline-start" />
            Connect agent
          </Button>
        </>
      }
    >
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Connections</h2>
          <p className="text-xs text-muted-foreground">
            Agents signed in with OAuth and tokens created here. Revoking cuts the agent off at
            once.
          </p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Sign-in</TableHead>
              <TableHead>Access</TableHead>
              <TableHead>Environments</TableHead>
              <TableHead>Last used</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {grants.length === 0 ? (
              <TableRow>
                <TableCell className="text-muted-foreground" colSpan={7}>
                  {grantsQuery.isLoading ? (
                    "Loading…"
                  ) : (
                    <span className="flex items-center gap-3">
                      No agent is connected yet.
                      <Button
                        size="xs"
                        type="button"
                        variant="outline"
                        onClick={() => setConnectOpen(true)}
                      >
                        Connect agent
                      </Button>
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              grants.map((grant) => (
                <TableRow key={grant.grantId}>
                  <TableCell className="font-medium">{grant.label}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{grant.kind === "oauth" ? "OAuth" : "Token"}</Badge>
                  </TableCell>
                  <TableCell>{mcpAccessTitle(grant.access)}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {environmentNames(grant.environmentIds, environments)}
                  </TableCell>
                  <TableCell>{formatDate(grant.lastUsedAt)}</TableCell>
                  <TableCell>
                    {grant.kind === "oauth" ? "—" : formatDate(grant.expiresAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="xs"
                      type="button"
                      variant="outline"
                      onClick={() => setRevokeCandidate(grant)}
                    >
                      Revoke
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </section>

      <ConnectAgentDialog
        open={connectOpen}
        onOpenChange={setConnectOpen}
        mcpUrl={mcpUrl}
        onCreateToken={() => {
          setConnectOpen(false);
          setCreateOpen(true);
        }}
      />
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
