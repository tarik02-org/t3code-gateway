import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { useEffect } from "react";

import { AdminShell } from "../../components/admin-shell.tsx";
import { Button } from "../../components/ui/button.tsx";
import { getCurrentUser, getGatewayStatus, listEnvironments } from "../../lib/gateway-api.ts";
import { AddEnvironmentDialog } from "./add-environment-dialog.tsx";
import { useAddEnvironmentDialogStore } from "./add-environment-store.ts";
import { EditEnvironmentDialog } from "./edit-environment-dialog.tsx";
import { useEditEnvironmentDialogStore } from "./edit-environment-store.ts";
import { EnvironmentTable, EnvironmentTableSkeleton } from "./environment-table.tsx";
import { PairingDialog } from "./pairing-dialog.tsx";
import { usePairingDialogStore } from "./pairing-dialog-store.ts";
import {
  CURRENT_USER_QUERY_KEY,
  ENVIRONMENTS_QUERY_KEY,
  GATEWAY_STATUS_QUERY_KEY,
  IS_BROWSER,
} from "./query-keys.ts";
import { SessionsDialog } from "./sessions-dialog.tsx";
import { useSessionsDialogStore } from "./sessions-dialog-store.ts";
import { useT3CodeCatalogStore } from "./t3code-catalog-store.ts";

export function EnvironmentPage() {
  const navigate = useNavigate();
  const openAddDialog = useAddEnvironmentDialogStore((state) => state.setOpen);
  const openEditDialog = useEditEnvironmentDialogStore((state) => state.openFor);
  const openPairingDialog = usePairingDialogStore((state) => state.openFor);
  const openSessionsDialog = useSessionsDialogStore((state) => state.openFor);
  const loadT3CodeCatalog = useT3CodeCatalogStore((state) => state.load);

  const currentUserQuery = useQuery({
    queryKey: CURRENT_USER_QUERY_KEY,
    queryFn: getCurrentUser,
    enabled: IS_BROWSER,
  });

  const environmentsQuery = useQuery({
    queryKey: ENVIRONMENTS_QUERY_KEY,
    queryFn: listEnvironments,
    enabled: IS_BROWSER && currentUserQuery.data != null,
  });

  const gatewayStatusQuery = useQuery({
    queryKey: GATEWAY_STATUS_QUERY_KEY,
    queryFn: getGatewayStatus,
    enabled: IS_BROWSER && currentUserQuery.data != null,
  });

  useEffect(() => {
    if (currentUserQuery.isSuccess && currentUserQuery.data === null) {
      void navigate({ to: "/login" });
    }
  }, [currentUserQuery.data, currentUserQuery.isSuccess, navigate]);

  useEffect(() => {
    if (
      currentUserQuery.data !== null &&
      currentUserQuery.data !== undefined &&
      gatewayStatusQuery.data?.t3codeWeb.available === true
    ) {
      void loadT3CodeCatalog();
    }
  }, [currentUserQuery.data, gatewayStatusQuery.data?.t3codeWeb.available, loadT3CodeCatalog]);

  if (
    !IS_BROWSER ||
    currentUserQuery.isLoading ||
    currentUserQuery.data === null ||
    currentUserQuery.data === undefined
  ) {
    return (
      <AdminShell>
        <EnvironmentTableSkeleton showWebColumn={false} />
      </AdminShell>
    );
  }

  return (
    <AdminShell
      actions={
        <Button size="xs" type="button" onClick={() => openAddDialog(true)}>
          <PlusIcon data-icon="inline-start" />
          Add environment
        </Button>
      }
    >
      {environmentsQuery.error ? (
        <p className="text-xs text-destructive-foreground">
          {environmentsQuery.error instanceof Error
            ? environmentsQuery.error.message
            : "Failed to load environments"}
        </p>
      ) : null}

      {environmentsQuery.isLoading ? (
        <EnvironmentTableSkeleton
          showWebColumn={gatewayStatusQuery.data?.t3codeWeb.available === true}
        />
      ) : (
        <EnvironmentTable
          environments={environmentsQuery.data ?? []}
          onEdit={openEditDialog}
          onSessions={openSessionsDialog}
          onPair={openPairingDialog}
          showWebColumn={gatewayStatusQuery.data?.t3codeWeb.available === true}
        />
      )}

      <AddEnvironmentDialog />
      <EditEnvironmentDialog />
      <PairingDialog />
      <SessionsDialog />
    </AdminShell>
  );
}
