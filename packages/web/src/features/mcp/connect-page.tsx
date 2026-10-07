import type {
  McpAccess,
  McpAuthorizationDecision,
  McpAuthorizationRequest,
} from "@t3code-gateway/contracts/schemas";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { T3Logo } from "../../components/logo.tsx";
import { Button } from "../../components/ui/button.tsx";
import {
  decideMcpAuthorization,
  describeMcpAuthorization,
  listEnvironments,
} from "../../lib/gateway-api.ts";
import { Field } from "../environments/field.tsx";
import { ENVIRONMENTS_QUERY_KEY, IS_BROWSER } from "../environments/query-keys.ts";
import { GrantFields } from "./grant-fields.tsx";
import { DEFAULT_MCP_ACCESS } from "./mcp-access.ts";

const AUTHORIZATION_PARAMS = [
  "response_type",
  "client_id",
  "redirect_uri",
  "code_challenge",
  "code_challenge_method",
  "state",
  "resource",
  "scope",
] as const;

/** The agent's authorization request, as `/oauth/authorize` forwarded it. */
const readAuthorization = (): McpAuthorizationRequest => {
  const search = new URLSearchParams(IS_BROWSER ? window.location.search : "");
  const request: Record<string, string> = {};
  for (const key of AUTHORIZATION_PARAMS) {
    const value = search.get(key);
    if (value !== null) {
      request[key] = value;
    }
  }
  return request;
};

const errorMessage = (cause: unknown, fallback: string) =>
  cause instanceof Error ? cause.message : fallback;

export function ConnectPage() {
  const [authorization] = useState(readAuthorization);
  const [label, setLabel] = useState<string | null>(null);
  const [access, setAccess] = useState<McpAccess>(DEFAULT_MCP_ACCESS);
  const [environmentIds, setEnvironmentIds] = useState<ReadonlyArray<string> | null>(null);

  const detailsQuery = useQuery({
    queryKey: ["gateway", "mcp", "authorization", authorization],
    queryFn: () => describeMcpAuthorization(authorization),
    enabled: IS_BROWSER,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const environmentsQuery = useQuery({
    queryKey: ENVIRONMENTS_QUERY_KEY,
    queryFn: listEnvironments,
    enabled: IS_BROWSER,
  });

  const details = detailsQuery.data;
  useEffect(() => {
    if (details?.["_tag"] === "Redirect") {
      window.location.replace(details.redirectTo);
    }
  }, [details]);

  const decideMutation = useMutation({
    mutationFn: (decision: McpAuthorizationDecision) =>
      decideMcpAuthorization(authorization, decision),
    onSuccess: ({ redirectTo }) => window.location.assign(redirectTo),
  });

  const pending = details?.["_tag"] === "Pending" ? details : null;
  const grantLabel = label ?? pending?.clientName ?? "";
  const busy = decideMutation.isPending || decideMutation.isSuccess;
  const canApprove =
    pending !== null &&
    grantLabel.trim().length > 0 &&
    (environmentIds === null || environmentIds.length > 0);

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-8 text-foreground">
      <section className="dialog-glass w-full max-w-lg rounded-2xl border p-5 text-card-foreground">
        <div className="mb-5 flex items-center gap-3">
          <T3Logo className="h-3" />
          <h1 className="text-base font-semibold leading-5">Connect an agent</h1>
        </div>

        {detailsQuery.isPending || details?.["_tag"] === "Redirect" ? (
          <p className="text-sm text-muted-foreground">Checking the request…</p>
        ) : detailsQuery.isError ? (
          <p className="text-sm text-destructive-foreground">
            {errorMessage(detailsQuery.error, "This sign-in request is not valid.")}
          </p>
        ) : pending !== null ? (
          <form
            className="flex flex-col gap-5"
            onSubmit={(event) => {
              event.preventDefault();
              if (canApprove && !busy) {
                decideMutation.mutate({
                  _tag: "Approve",
                  label: grantLabel.trim(),
                  access,
                  environmentIds,
                });
              }
            }}
          >
            <p className="text-sm leading-relaxed">
              <span className="font-medium">{pending.clientName}</span>{" "}
              <span className="text-muted-foreground">
                (it names itself) wants to use your T3 Code environments through this gateway. It
                will return to{" "}
              </span>
              <span className="break-all font-mono text-xs">
                {new URL(pending.redirectUri).origin}
              </span>
              <span className="text-muted-foreground">.</span>
            </p>
            <Field label="Name" value={grantLabel} onChange={setLabel} />
            <GrantFields
              access={access}
              onAccessChange={setAccess}
              environmentIds={environmentIds}
              onEnvironmentIdsChange={setEnvironmentIds}
              environments={environmentsQuery.data ?? []}
              disabled={busy}
            />
            {decideMutation.isError ? (
              <p className="text-sm text-destructive-foreground">
                {errorMessage(decideMutation.error, "Could not record the decision")}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button
                size="xs"
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => decideMutation.mutate({ _tag: "Deny" })}
              >
                Deny
              </Button>
              <Button size="xs" type="submit" disabled={busy || !canApprove}>
                {busy ? "Connecting..." : "Allow"}
              </Button>
            </div>
          </form>
        ) : null}
      </section>
    </main>
  );
}
