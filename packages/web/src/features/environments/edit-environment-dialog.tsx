import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "../../components/ui/button.tsx";
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../../components/ui/dialog.tsx";
import { Switch } from "../../components/ui/switch.tsx";
import { updateEnvironment } from "../../lib/gateway-api.ts";
import { Field } from "./field.tsx";
import { useEditEnvironmentDialogStore } from "./edit-environment-store.ts";
import { ENVIRONMENTS_QUERY_KEY } from "./query-keys.ts";

export function EditEnvironmentDialog() {
  const formId = "edit-environment-form";
  const queryClient = useQueryClient();
  const open = useEditEnvironmentDialogStore((state) => state.open);
  const environment = useEditEnvironmentDialogStore((state) => state.environment);
  const label = useEditEnvironmentDialogStore((state) => state.label);
  const slug = useEditEnvironmentDialogStore((state) => state.slug);
  const endpoint = useEditEnvironmentDialogStore((state) => state.endpoint);
  const pairingCode = useEditEnvironmentDialogStore((state) => state.pairingCode);
  const enabled = useEditEnvironmentDialogStore((state) => state.enabled);
  const error = useEditEnvironmentDialogStore((state) => state.error);
  const setOpen = useEditEnvironmentDialogStore((state) => state.setOpen);
  const setLabel = useEditEnvironmentDialogStore((state) => state.setLabel);
  const setSlug = useEditEnvironmentDialogStore((state) => state.setSlug);
  const setEndpoint = useEditEnvironmentDialogStore((state) => state.setEndpoint);
  const setPairingCode = useEditEnvironmentDialogStore((state) => state.setPairingCode);
  const setEnabled = useEditEnvironmentDialogStore((state) => state.setEnabled);
  const setError = useEditEnvironmentDialogStore((state) => state.setError);
  const reset = useEditEnvironmentDialogStore((state) => state.reset);
  const canSubmit =
    environment !== null && label.length > 0 && slug.length > 0 && endpoint.length > 0;

  const updateMutation = useMutation({
    mutationFn: (payload: Parameters<typeof updateEnvironment>[1]) => {
      if (environment === null) {
        throw new Error("Environment is not selected");
      }
      return updateEnvironment(environment.environmentId, payload);
    },
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ENVIRONMENTS_QUERY_KEY });
      setOpen(false);
    },
    onError: (cause) => {
      setError(cause instanceof Error ? cause.message : "Update failed");
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
          <DialogTitle>Edit environment</DialogTitle>
        </DialogHeader>
        <DialogPanel>
          <form
            id={formId}
            onSubmit={(event) => {
              event.preventDefault();
              if (!canSubmit) {
                return;
              }
              updateMutation.mutate({
                slug,
                label,
                endpoint,
                enabled,
                ...(pairingCode.length > 0 ? { pairingCode } : {}),
              });
            }}
          >
            <div className="flex flex-col gap-4">
              <Field label="Label" value={label} onChange={setLabel} />
              <Field label="Slug" value={slug} onChange={setSlug} />
              <Field
                label="Endpoint"
                value={endpoint}
                onChange={setEndpoint}
                placeholder="https://backend.example.com"
              />
              <Field
                label="Pairing code"
                value={pairingCode}
                onChange={setPairingCode}
                placeholder="Leave blank to keep current credentials"
              />
              <label className="flex items-center justify-between gap-3 text-sm">
                <span>Enabled</span>
                <Switch checked={enabled} onCheckedChange={setEnabled} />
              </label>
              {error !== null ? (
                <p className="text-sm text-destructive-foreground">{error}</p>
              ) : null}
            </div>
          </form>
        </DialogPanel>
        <DialogFooter>
          <Button
            form={formId}
            size="xs"
            type="submit"
            disabled={updateMutation.isPending || !canSubmit}
          >
            {updateMutation.isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
