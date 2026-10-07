import type { CreatedMcpToken, McpAccess } from "@t3code-gateway/contracts/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { CopyButton } from "../../components/copy-button.tsx";
import { Button } from "../../components/ui/button.tsx";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../../components/ui/dialog.tsx";
import { Label } from "../../components/ui/label.tsx";
import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group.tsx";
import { createMcpToken, listEnvironments } from "../../lib/gateway-api.ts";
import { Field } from "../environments/field.tsx";
import { ENVIRONMENTS_QUERY_KEY, IS_BROWSER } from "../environments/query-keys.ts";
import { AgentSetup } from "./agent-setup.tsx";
import { GrantFields } from "./grant-fields.tsx";
import { DEFAULT_MCP_ACCESS } from "./mcp-access.ts";
import { MCP_GRANTS_QUERY_KEY } from "./query-keys.ts";

const EXPIRY_OPTIONS = [
  { value: "30", label: "30 days", days: 30 },
  { value: "90", label: "90 days", days: 90 },
  { value: "365", label: "1 year", days: 365 },
  { value: "never", label: "Never", days: null },
] as const;

type ExpiryValue = (typeof EXPIRY_OPTIONS)[number]["value"];

export function CreateTokenDialog({
  open,
  onOpenChange,
  mcpUrl,
}: Readonly<{ open: boolean; onOpenChange: (open: boolean) => void; mcpUrl: string }>) {
  const queryClient = useQueryClient();
  const [label, setLabel] = useState("");
  const [access, setAccess] = useState<McpAccess>(DEFAULT_MCP_ACCESS);
  const [environmentIds, setEnvironmentIds] = useState<ReadonlyArray<string> | null>(null);
  const [expiry, setExpiry] = useState<ExpiryValue>("90");
  const [created, setCreated] = useState<CreatedMcpToken | null>(null);
  const formId = "create-mcp-token-form";

  const environmentsQuery = useQuery({
    queryKey: ENVIRONMENTS_QUERY_KEY,
    queryFn: listEnvironments,
    enabled: IS_BROWSER && open,
  });

  const createMutation = useMutation({
    mutationFn: createMcpToken,
    onSuccess: async (result) => {
      setCreated(result);
      await queryClient.invalidateQueries({ queryKey: MCP_GRANTS_QUERY_KEY });
    },
  });

  const reset = () => {
    setLabel("");
    setAccess(DEFAULT_MCP_ACCESS);
    setEnvironmentIds(null);
    setExpiry("90");
    setCreated(null);
    createMutation.reset();
  };

  const canSubmit =
    label.trim().length > 0 && (environmentIds === null || environmentIds.length > 0);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={(nextOpen) => {
        if (!nextOpen) {
          reset();
        }
      }}
    >
      <DialogPopup className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{created === null ? "Create token" : "Token created"}</DialogTitle>
          {created === null ? (
            <DialogDescription>
              For agents that send a header instead of signing in.
            </DialogDescription>
          ) : (
            <DialogDescription>
              Copy it now: the gateway keeps only its hash and cannot show it again.
            </DialogDescription>
          )}
        </DialogHeader>
        {created === null ? (
          <>
            <DialogPanel>
              <form
                id={formId}
                className="flex flex-col gap-5"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (canSubmit && !createMutation.isPending) {
                    createMutation.mutate({
                      label: label.trim(),
                      access,
                      environmentIds,
                      expiresInDays:
                        EXPIRY_OPTIONS.find((option) => option.value === expiry)?.days ?? null,
                    });
                  }
                }}
              >
                <Field label="Name" value={label} onChange={setLabel} placeholder="Build agent" />
                <GrantFields
                  access={access}
                  onAccessChange={setAccess}
                  environmentIds={environmentIds}
                  onEnvironmentIdsChange={setEnvironmentIds}
                  environments={environmentsQuery.data ?? []}
                  disabled={createMutation.isPending}
                />
                <section className="space-y-3">
                  <Label>Expires</Label>
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    size="sm"
                    value={expiry}
                    onValueChange={(value) => {
                      const option = EXPIRY_OPTIONS.find((candidate) => candidate.value === value);
                      if (option !== undefined) {
                        setExpiry(option.value);
                      }
                    }}
                    aria-label="Expiry"
                  >
                    {EXPIRY_OPTIONS.map((option) => (
                      <ToggleGroupItem key={option.value} value={option.value}>
                        {option.label}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </section>
                {createMutation.isError ? (
                  <p className="text-sm text-destructive-foreground">
                    {createMutation.error instanceof Error
                      ? createMutation.error.message
                      : "Could not create the token"}
                  </p>
                ) : null}
              </form>
            </DialogPanel>
            <DialogFooter>
              <Button size="xs" type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                form={formId}
                size="xs"
                type="submit"
                disabled={!canSubmit || createMutation.isPending}
              >
                {createMutation.isPending ? "Creating..." : "Create token"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogPanel className="space-y-5">
              <div className="space-y-1.5">
                <Label>Token</Label>
                <div className="flex items-center gap-2 rounded-lg border border-input bg-muted/25 px-3 py-2">
                  <code className="min-w-0 flex-1 break-all font-mono text-xs">
                    {created.token}
                  </code>
                  <CopyButton label="Copy token" value={created.token} />
                </div>
              </div>
              <AgentSetup mcpUrl={mcpUrl} token={created.token} />
            </DialogPanel>
            <DialogFooter>
              <Button size="xs" type="button" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogPopup>
    </Dialog>
  );
}
