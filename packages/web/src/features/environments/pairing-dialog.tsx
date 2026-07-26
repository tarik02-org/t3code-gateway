import { useMutation } from "@tanstack/react-query";

import { CopyButton } from "../../components/copy-button.tsx";
import { Button } from "../../components/ui/button.tsx";
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../../components/ui/dialog.tsx";
import { Input } from "../../components/ui/input.tsx";
import { Label } from "../../components/ui/label.tsx";
import { QRCodeSvg } from "../../components/ui/qr-code.tsx";
import { Switch } from "../../components/ui/switch.tsx";
import { createEnvironmentPairingLink } from "../../lib/gateway-api.ts";
import { cn } from "../../lib/utils.ts";
import { Field } from "./field.tsx";
import { usePairingDialogStore } from "./pairing-dialog-store.ts";
import { PAIRING_SCOPE_OPTIONS } from "./pairing-scopes.ts";

export function PairingDialog() {
  const open = usePairingDialogStore((state) => state.open);
  const environment = usePairingDialogStore((state) => state.environment);
  const clientLabel = usePairingDialogStore((state) => state.clientLabel);
  const scopes = usePairingDialogStore((state) => state.scopes);
  const pairingLink = usePairingDialogStore((state) => state.pairingLink);
  const pairingResultView = usePairingDialogStore((state) => state.pairingResultView);
  const error = usePairingDialogStore((state) => state.error);
  const setOpen = usePairingDialogStore((state) => state.setOpen);
  const setClientLabel = usePairingDialogStore((state) => state.setClientLabel);
  const setReadOnlyScopes = usePairingDialogStore((state) => state.setReadOnlyScopes);
  const setStandardScopes = usePairingDialogStore((state) => state.setStandardScopes);
  const toggleScope = usePairingDialogStore((state) => state.toggleScope);
  const setPairingLink = usePairingDialogStore((state) => state.setPairingLink);
  const togglePairingResultView = usePairingDialogStore((state) => state.togglePairingResultView);
  const setError = usePairingDialogStore((state) => state.setError);
  const reset = usePairingDialogStore((state) => state.reset);
  const canSubmit = environment !== null && clientLabel.length > 0 && scopes.length > 0;
  const isShowingQrResult = pairingLink !== null && pairingResultView === "qr";

  const createMutation = useMutation({
    mutationFn: () => {
      if (environment === null) {
        throw new Error("Environment is not selected");
      }
      return createEnvironmentPairingLink(environment.environmentId, {
        label: clientLabel,
        scopes,
      });
    },
    onSuccess: setPairingLink,
    onError: (cause) => {
      setError(cause instanceof Error ? cause.message : "Create failed");
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      onOpenChangeComplete={(nextOpen) => {
        if (!nextOpen) {
          reset();
        }
      }}
    >
      <DialogPopup
        className={cn(
          "border-border/60",
          isShowingQrResult
            ? "w-[min(calc(100vw-2rem),calc(100dvh-10rem),42rem)] max-w-none"
            : "max-w-xl",
        )}
      >
        <DialogHeader>
          <DialogTitle>{pairingLink === null ? "Create pairing link" : "Pairing link"}</DialogTitle>
        </DialogHeader>
        {pairingLink === null ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (canSubmit === true && createMutation.isPending === false) {
                createMutation.mutate();
              }
            }}
          >
            <DialogPanel className="space-y-5">
              <Field
                label="Client label"
                value={clientLabel}
                onChange={setClientLabel}
                placeholder="MacBook"
              />
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <Label>Permissions</Label>
                  <div className="flex gap-1">
                    <Button
                      size="xs"
                      type="button"
                      variant="outline"
                      disabled={createMutation.isPending}
                      onClick={setReadOnlyScopes}
                    >
                      Read only
                    </Button>
                    <Button
                      size="xs"
                      type="button"
                      variant="outline"
                      disabled={createMutation.isPending}
                      onClick={setStandardScopes}
                    >
                      Standard
                    </Button>
                  </div>
                </div>
                <div className="divide-y divide-border/60 rounded-lg border border-input bg-muted/25">
                  {PAIRING_SCOPE_OPTIONS.map(({ scope, title, description }) => (
                    <label
                      className="flex cursor-pointer items-start justify-between gap-3 px-3 py-2.5 transition-colors hover:bg-muted/40"
                      key={scope}
                    >
                      <span className="min-w-0">
                        <span className="block text-xs font-medium text-foreground">{title}</span>
                        <span className="block text-xs leading-snug text-muted-foreground">
                          {description}
                        </span>
                      </span>
                      <Switch
                        className="mt-0.5"
                        checked={scopes.includes(scope)}
                        disabled={createMutation.isPending}
                        onCheckedChange={(checked) => toggleScope(scope, checked)}
                      />
                    </label>
                  ))}
                </div>
                {scopes.length === 0 ? (
                  <p className="text-xs text-destructive-foreground">
                    Select at least one permission.
                  </p>
                ) : null}
              </section>
              {error !== null ? (
                <p className="text-sm text-destructive-foreground">{error}</p>
              ) : null}
            </DialogPanel>
            <DialogFooter>
              <Button
                size="xs"
                type="button"
                variant="outline"
                disabled={createMutation.isPending}
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button size="xs" type="submit" disabled={createMutation.isPending || !canSubmit}>
                {createMutation.isPending ? "Creating..." : "Create link"}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <>
            <DialogPanel className={isShowingQrResult ? "p-4 sm:p-5" : "space-y-4"}>
              {isShowingQrResult ? (
                <div className="mx-auto aspect-square w-full max-w-80">
                  <QRCodeSvg
                    value={pairingLink.pairingUrl}
                    size={320}
                    level="M"
                    marginSize={2}
                    title="Pairing link"
                    className="size-full"
                  />
                </div>
              ) : (
                <div className="space-y-4">
                  <PairingValue label="Public link" value={pairingLink.pairingUrl} />
                  <PairingValue label="Pairing code" value={pairingLink.pairingCode} />
                </div>
              )}
            </DialogPanel>
            <DialogFooter className="sm:justify-between">
              <Button size="xs" type="button" variant="outline" onClick={togglePairingResultView}>
                {pairingResultView === "qr" ? "Show link" : "Show QR"}
              </Button>
              <div className="flex gap-2">
                <Button
                  size="xs"
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const openedWindow = window.open(pairingLink.pairingUrl, "_blank");
                    if (openedWindow !== null) {
                      openedWindow.opener = null;
                      window.close();
                    }
                  }}
                >
                  Open
                </Button>
                <Button size="xs" type="button" onClick={() => setOpen(false)}>
                  Done
                </Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogPopup>
    </Dialog>
  );
}

function PairingValue({
  label,
  value,
}: Readonly<{
  label: string;
  value: string;
}>) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="relative">
        <Input
          nativeInput
          readOnly
          value={value}
          className="font-mono text-xs [&_[data-slot=input]]:pr-10"
          onClick={(event) => event.currentTarget.select()}
          onFocus={(event) => event.currentTarget.select()}
        />
        <CopyButton
          className="absolute end-1 top-1/2 size-6 -translate-y-1/2 rounded-md"
          label={label}
          value={value}
        />
      </div>
    </div>
  );
}
