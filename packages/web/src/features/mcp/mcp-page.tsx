import type {
  EnvironmentRecord,
  McpGrant,
  McpUpstreamCredentialStatus,
} from "@t3code-gateway/contracts/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { KeyRoundIcon } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

import { AdminShell } from "../../components/admin-shell.tsx";
import { ConfirmDialog } from "../../components/confirm-dialog.tsx";
import { CopyButton } from "../../components/copy-button.tsx";
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
  listMcpUpstreamCredentials,
  revokeMcpGrant,
} from "../../lib/gateway-api.ts";
import {
  CURRENT_USER_QUERY_KEY,
  ENVIRONMENTS_QUERY_KEY,
  GATEWAY_STATUS_QUERY_KEY,
  IS_BROWSER,
} from "../environments/query-keys.ts";
import { AgentSetup } from "./agent-setup.tsx";
import { CreateTokenDialog } from "./create-token-dialog.tsx";
import { mcpAccessTitle } from "./mcp-access.ts";
import { MCP_GRANTS_QUERY_KEY, MCP_UPSTREAM_QUERY_KEY } from "./query-keys.ts";

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

function Section({
  title,
  description,
  action,
  children,
}: Readonly<{ title: string; description: string; action?: ReactNode; children: ReactNode }>) {
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function McpPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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
  const upstreamQuery = useQuery({
    queryKey: MCP_UPSTREAM_QUERY_KEY,
    queryFn: listMcpUpstreamCredentials,
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
  const upstream = upstreamQuery.data ?? [];

  return (
    <AdminShell
      t3codeWeb={gatewayStatusQuery.data?.t3codeWeb}
      actions={
        <Button size="xs" type="button" onClick={() => setCreateOpen(true)}>
          <KeyRoundIcon data-icon="inline-start" />
          Create token
        </Button>
      }
    >
      <Section
        title="Connect an agent"
        description="One MCP server for every environment. Agents that support OAuth sign in through this gateway."
      >
        <div className="space-y-4 rounded-xl border bg-card/40 p-4">
          <div className="flex items-center gap-2 rounded-lg border border-input bg-muted/25 px-3 py-2">
            <code className="min-w-0 flex-1 truncate font-mono text-xs">{mcpUrl}</code>
            <CopyButton label="Copy MCP URL" value={mcpUrl} />
          </div>
          <AgentSetup mcpUrl={mcpUrl} token={null} />
        </div>
      </Section>

      <Section
        title="Connections"
        description="Agents signed in with OAuth and tokens created here. Revoking cuts the agent off at once."
      >
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
                  {grantsQuery.isLoading ? "Loading…" : "No agent is connected yet."}
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
      </Section>

      <Section
        title="Gateway sign-ins"
        description="The gateway's own MCP sign-in to each environment, one per access level in use. It renews a week before expiry."
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Environment</TableHead>
              <TableHead>Access</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {upstream.length === 0 ? (
              <TableRow>
                <TableCell className="text-muted-foreground" colSpan={4}>
                  The gateway signs in to an environment the first time an agent uses it.
                </TableCell>
              </TableRow>
            ) : (
              upstream.map((credential) => (
                <UpstreamRow
                  credential={credential}
                  environments={environments}
                  key={`${credential.environmentId}:${credential.access}`}
                />
              ))
            )}
          </TableBody>
        </Table>
      </Section>

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

function UpstreamRow({
  credential,
  environments,
}: Readonly<{
  credential: McpUpstreamCredentialStatus;
  environments: ReadonlyArray<EnvironmentRecord>;
}>) {
  const environment = environments.find((row) => row.environmentId === credential.environmentId);
  return (
    <TableRow>
      <TableCell className="font-medium">
        {environment?.label ?? credential.environmentId}
      </TableCell>
      <TableCell>{mcpAccessTitle(credential.access)}</TableCell>
      <TableCell>{formatDate(credential.expiresAt)}</TableCell>
      <TableCell>
        {credential.lastFailure === null ? (
          <Badge variant="secondary">Signed in</Badge>
        ) : (
          <span className="text-xs text-destructive-foreground">
            {credential.expiresAt === null ? "Not signed in: " : "Renewal failed: "}
            {credential.lastFailure}
          </span>
        )}
      </TableCell>
    </TableRow>
  );
}
