import type { EnvironmentRecord, McpAccess } from "@t3code-gateway/contracts/schemas";

import { Label } from "../../components/ui/label.tsx";
import { Radio, RadioGroup } from "../../components/ui/radio-group.tsx";
import { Switch } from "../../components/ui/switch.tsx";
import { cn } from "../../lib/utils.ts";
import { MCP_ACCESS_OPTIONS } from "./mcp-access.ts";

const rowClassName =
  "flex cursor-pointer items-center justify-between gap-3 px-3 py-2.5 transition-colors hover:bg-muted/40";

/** Access level and environments of a relay grant; `environmentIds === null` means all of them. */
export function GrantFields({
  access,
  onAccessChange,
  environmentIds,
  onEnvironmentIdsChange,
  environments,
  disabled,
}: Readonly<{
  access: McpAccess;
  onAccessChange: (access: McpAccess) => void;
  environmentIds: ReadonlyArray<string> | null;
  onEnvironmentIdsChange: (environmentIds: ReadonlyArray<string> | null) => void;
  environments: ReadonlyArray<EnvironmentRecord>;
  disabled: boolean;
}>) {
  const allEnvironments = environmentIds === null;
  const toggleEnvironment = (environmentId: string, checked: boolean) => {
    const current = environmentIds ?? [];
    onEnvironmentIdsChange(
      checked ? [...current, environmentId] : current.filter((id) => id !== environmentId),
    );
  };

  return (
    <>
      <section className="space-y-3">
        <Label>Access</Label>
        <RadioGroup
          className="gap-0 divide-y divide-border/60 rounded-lg border border-input bg-muted/25"
          value={access}
          disabled={disabled}
          onValueChange={(value) => {
            const option = MCP_ACCESS_OPTIONS.find((candidate) => candidate.access === value);
            if (option !== undefined) {
              onAccessChange(option.access);
            }
          }}
        >
          {MCP_ACCESS_OPTIONS.map((option) => (
            <label
              className={cn(
                "flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/40",
                option.access === access && "bg-muted/40",
              )}
              key={option.access}
            >
              <Radio value={option.access} />
              <span className="min-w-0">
                <span className="block text-xs font-medium text-foreground">{option.title}</span>
                <span className="block text-xs leading-snug text-muted-foreground">
                  {option.description}
                </span>
              </span>
            </label>
          ))}
        </RadioGroup>
      </section>
      <section className="space-y-3">
        <Label>Environments</Label>
        <div className="divide-y divide-border/60 rounded-lg border border-input bg-muted/25">
          <label className={rowClassName}>
            <span className="min-w-0">
              <span className="block text-xs font-medium text-foreground">All environments</span>
              <span className="block text-xs leading-snug text-muted-foreground">
                Including ones added later.
              </span>
            </span>
            <Switch
              checked={allEnvironments}
              disabled={disabled}
              onCheckedChange={(checked) =>
                onEnvironmentIdsChange(
                  checked ? null : environments.map((environment) => environment.environmentId),
                )
              }
            />
          </label>
          {environments.map((environment) => (
            <label
              className={cn(rowClassName, allEnvironments && "pointer-events-none opacity-48")}
              key={environment.environmentId}
            >
              <span className="min-w-0">
                <span className="block text-xs font-medium text-foreground">
                  {environment.label}
                </span>
                <span className="block font-mono text-xs leading-snug text-muted-foreground">
                  {environment.slug}
                </span>
              </span>
              <Switch
                checked={allEnvironments || environmentIds.includes(environment.environmentId)}
                disabled={disabled || allEnvironments}
                onCheckedChange={(checked) => toggleEnvironment(environment.environmentId, checked)}
              />
            </label>
          ))}
        </div>
        {environmentIds !== null && environmentIds.length === 0 ? (
          <p className="text-xs text-destructive-foreground">Select at least one environment.</p>
        ) : null}
      </section>
    </>
  );
}
