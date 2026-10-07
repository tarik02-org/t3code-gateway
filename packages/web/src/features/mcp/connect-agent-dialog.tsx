import { useState } from "react";

import { Button } from "../../components/ui/button.tsx";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../../components/ui/dialog.tsx";
import { Label } from "../../components/ui/label.tsx";
import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group.tsx";
import { AgentSetup } from "./agent-setup.tsx";

type SignIn = "oauth" | "token";

const TOKEN_PLACEHOLDER = "<token>";

export function ConnectAgentDialog({
  open,
  onOpenChange,
  mcpUrl,
  onCreateToken,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mcpUrl: string;
  onCreateToken: () => void;
}>) {
  const [signIn, setSignIn] = useState<SignIn>("oauth");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Connect an agent</DialogTitle>
          <DialogDescription>
            One MCP server for every environment this gateway manages.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-5">
          <section className="space-y-3">
            <Label>Sign-in</Label>
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
            {signIn === "oauth" ? (
              <p className="text-xs leading-relaxed text-muted-foreground">
                The agent signs in through the gateway. You approve it in the browser and choose its
                access and environments there.
              </p>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  For agents that only send a header. Replace{" "}
                  <code className="font-mono text-foreground">{TOKEN_PLACEHOLDER}</code> with a
                  token; creating one shows this setup with it filled in.
                </p>
                <Button size="xs" type="button" variant="outline" onClick={onCreateToken}>
                  Create token
                </Button>
              </div>
            )}
          </section>
          <AgentSetup mcpUrl={mcpUrl} token={signIn === "oauth" ? null : TOKEN_PLACEHOLDER} />
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  );
}
