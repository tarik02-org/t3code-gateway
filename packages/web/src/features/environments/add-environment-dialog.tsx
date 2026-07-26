import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";

import { Button } from "../../components/ui/button.tsx";
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../../components/ui/dialog.tsx";
import { createEnvironment } from "../../lib/gateway-api.ts";
import { Field } from "./field.tsx";
import { useAddEnvironmentDialogStore } from "./add-environment-store.ts";
import { ENVIRONMENTS_QUERY_KEY } from "./query-keys.ts";

export function AddEnvironmentDialog() {
  const formId = "add-environment-form";
  const queryClient = useQueryClient();
  const open = useAddEnvironmentDialogStore((state) => state.open);
  const label = useAddEnvironmentDialogStore((state) => state.label);
  const slug = useAddEnvironmentDialogStore((state) => state.slug);
  const endpoint = useAddEnvironmentDialogStore((state) => state.endpoint);
  const pairingCode = useAddEnvironmentDialogStore((state) => state.pairingCode);
  const error = useAddEnvironmentDialogStore((state) => state.error);
  const setOpen = useAddEnvironmentDialogStore((state) => state.setOpen);
  const setLabel = useAddEnvironmentDialogStore((state) => state.setLabel);
  const setSlug = useAddEnvironmentDialogStore((state) => state.setSlug);
  const setEndpoint = useAddEnvironmentDialogStore((state) => state.setEndpoint);
  const setPairingCode = useAddEnvironmentDialogStore((state) => state.setPairingCode);
  const setError = useAddEnvironmentDialogStore((state) => state.setError);
  const applyPairingFields = useAddEnvironmentDialogStore((state) => state.applyPairingFields);
  const reset = useAddEnvironmentDialogStore((state) => state.reset);
  const canSubmit =
    label.length > 0 && slug.length > 0 && endpoint.length > 0 && pairingCode.length > 0;

  const createMutation = useMutation({
    mutationFn: createEnvironment,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ENVIRONMENTS_QUERY_KEY });
      setOpen(false);
    },
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
      <DialogPopup className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Add environment</DialogTitle>
        </DialogHeader>
        <DialogPanel>
          <form
            id={formId}
            onSubmit={(event) => {
              event.preventDefault();
              if (!canSubmit) {
                return;
              }
              createMutation.mutate({
                slug,
                label,
                endpoint,
                pairingCode,
              });
            }}
          >
            <div className="flex flex-col gap-4">
              <Field label="Label" value={label} onChange={setLabel} placeholder="Desktop" />
              <Field label="Slug" value={slug} onChange={setSlug} placeholder="desktop" />
              <Field
                label="Endpoint"
                value={endpoint}
                onChange={setEndpoint}
                onPaste={applyPairingFields}
                placeholder="https://backend.example.com"
              />
              <Field
                label="Pairing code"
                value={pairingCode}
                onChange={setPairingCode}
                onPaste={applyPairingFields}
                placeholder="PAIRCODE"
              />
              {error !== null ? (
                <p className="text-sm text-destructive-foreground">{error}</p>
              ) : null}
            </div>
          </form>
        </DialogPanel>
        <DialogFooter>
          <Button
            size="xs"
            variant="outline"
            type="button"
            disabled={createMutation.isPending}
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button
            form={formId}
            size="xs"
            type="submit"
            disabled={createMutation.isPending || !canSubmit}
          >
            <PlusIcon data-icon="inline-start" />
            {createMutation.isPending ? "Adding..." : "Add environment"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
