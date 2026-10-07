import type { CreatedMcpToken } from "@t3code-gateway/contracts/schemas";
import { KeyRoundIcon } from "lucide-react";
import { useState } from "react";

import { CopyButton } from "../../components/copy-button.tsx";
import { Button } from "../../components/ui/button.tsx";
import {
  Dialog,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../../components/ui/dialog.tsx";
import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group.tsx";
import { AgentSetup } from "./agent-setup.tsx";
import { CreateTokenDialog } from "./create-token-dialog.tsx";

type SignIn = "oauth" | "token";

const TOKEN_PLACEHOLDER = "<token>";

export function ConnectAgentDialog({
  open,
  onOpenChange,
  mcpUrl,
}: Readonly<{ open: boolean; onOpenChange: (open: boolean) => void; mcpUrl: string }>) {
  const [signIn, setSignIn] = useState<SignIn>("oauth");
  const [createOpen, setCreateOpen] = useState(false);
  const [created, setCreated] = useState<CreatedMcpToken | null>(null);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={(nextOpen) => {
        if (!nextOpen) {
          setSignIn("oauth");
          setCreated(null);
        }
      }}
    >
      <DialogPopup className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Connect an agent</DialogTitle>
        </DialogHeader>
        <DialogPanel className="space-y-4">
          <div className="flex items-center gap-3">
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={signIn}
              onValueChange={(value) => {
                if (value === "oauth" || value === "token") {
                  setSignIn(value);
                }
              }}
              aria-label="Sign-in"
            >
              <ToggleGroupItem value="oauth">OAuth</ToggleGroupItem>
              <ToggleGroupItem value="token">Token</ToggleGroupItem>
            </ToggleGroup>
            {signIn === "token" ? (
              created === null ? (
                <Button
                  className="ml-auto"
                  size="xs"
                  type="button"
                  variant="outline"
                  onClick={() => setCreateOpen(true)}
                >
                  <KeyRoundIcon data-icon="inline-start" />
                  Create token
                </Button>
              ) : (
                <div className="ml-auto flex min-w-0 items-center gap-1 rounded-lg border border-input bg-muted/25 py-0.5 pr-0.5 pl-2.5">
                  <code className="min-w-0 truncate font-mono text-xs">{created.token}</code>
                  <CopyButton className="shrink-0" label="Copy token" value={created.token} />
                </div>
              )
            ) : null}
          </div>
          {signIn === "token" && created !== null ? (
            <p className="text-xs text-muted-foreground">
              Copy it now: the gateway cannot show {created.grant.label}'s token again.
            </p>
          ) : null}
          <AgentSetup
            mcpUrl={mcpUrl}
            token={signIn === "oauth" ? null : (created?.token ?? TOKEN_PLACEHOLDER)}
          />
        </DialogPanel>
        <CreateTokenDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          mcpUrl={mcpUrl}
          onCreated={setCreated}
        />
      </DialogPopup>
    </Dialog>
  );
}
