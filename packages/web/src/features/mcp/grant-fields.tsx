import type { EnvironmentRecord, McpAccess } from "@t3code-gateway/contracts/schemas";

import { Label } from "../../components/ui/label.tsx";
import { Switch } from "../../components/ui/switch.tsx";
import { cn } from "../../lib/utils.ts";
import { MCP_ACCESS_OPTIONS } from "./mcp-access.ts";

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
        <div
          className="divide-y divide-border/60 rounded-lg border border-input bg-muted/25"
          role="radiogroup"
        >
          {MCP_ACCESS_OPTIONS.map((option) => (
            <label
              className={cn(
                "flex cursor-pointer items-start gap-3 px-3 py-2.5 transition-colors hover:bg-muted/40",
                option.access === access && "bg-muted/40",
              )}
              key={option.access}
            >
              <input
                className="mt-0.5 accent-primary"
                type="radio"
                name="mcp-access"
                checked={option.access === access}
                disabled={disabled}
                onChange={() => onAccessChange(option.access)}
              />
              <span className="min-w-0">
                <span className="block text-xs font-medium text-foreground">{option.title}</span>
                <span className="block text-xs leading-snug text-muted-foreground">
                  {option.description}
                </span>
              </span>
            </label>
          ))}
        </div>
      </section>
      <section className="space-y-3">
        <Label>Environments</Label>
        <div className="divide-y divide-border/60 rounded-lg border border-input bg-muted/25">
          <label className="flex cursor-pointer items-start justify-between gap-3 px-3 py-2.5 transition-colors hover:bg-muted/40">
            <span className="min-w-0">
              <span className="block text-xs font-medium text-foreground">All environments</span>
              <span className="block text-xs leading-snug text-muted-foreground">
                Including ones added later.
              </span>
            </span>
            <Switch
              className="mt-0.5"
              checked={environmentIds === null}
              disabled={disabled}
              onCheckedChange={(checked) => onEnvironmentIdsChange(checked ? null : [])}
            />
          </label>
          {environmentIds === null
            ? null
            : environments.map((environment) => (
                <label
                  className="flex cursor-pointer items-start justify-between gap-3 px-3 py-2.5 transition-colors hover:bg-muted/40"
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
                    className="mt-0.5"
                    checked={environmentIds.includes(environment.environmentId)}
                    disabled={disabled}
                    onCheckedChange={(checked) =>
                      toggleEnvironment(environment.environmentId, checked)
                    }
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
