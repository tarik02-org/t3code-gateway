import type { EnvironmentPairingLink, EnvironmentRecord } from "@t3code-gateway/contracts/schemas";
import { create } from "zustand";

import { AUTH_ORCHESTRATION_READ_SCOPE, AUTH_STANDARD_CLIENT_SCOPES } from "./pairing-scopes.ts";

const pairingClientLabelStorageKey = "t3code-gateway:pairing-client-label";

interface PairingDialogState {
  readonly open: boolean;
  readonly environment: EnvironmentRecord | null;
  readonly clientLabel: string;
  readonly scopes: ReadonlyArray<string>;
  readonly pairingLink: EnvironmentPairingLink | null;
  readonly pairingResultView: "qr" | "details";
  readonly error: string | null;
  readonly openFor: (environment: EnvironmentRecord) => void;
  readonly setOpen: (open: boolean) => void;
  readonly setClientLabel: (clientLabel: string) => void;
  readonly setScopes: (scopes: ReadonlyArray<string>) => void;
  readonly setReadOnlyScopes: () => void;
  readonly setStandardScopes: () => void;
  readonly toggleScope: (scope: string, checked: boolean) => void;
  readonly setPairingLink: (pairingLink: EnvironmentPairingLink) => void;
  readonly setPairingResultView: (pairingResultView: "qr" | "details") => void;
  readonly togglePairingResultView: () => void;
  readonly setError: (error: string | null) => void;
  readonly reset: () => void;
}

export const usePairingDialogStore = create<PairingDialogState>((set) => ({
  open: false,
  environment: null,
  clientLabel: "",
  scopes: AUTH_STANDARD_CLIENT_SCOPES,
  pairingLink: null,
  pairingResultView: "details",
  error: null,
  openFor: (environment) =>
    set({
      open: true,
      environment,
      clientLabel: window.localStorage.getItem(pairingClientLabelStorageKey) ?? "",
      scopes: AUTH_STANDARD_CLIENT_SCOPES,
      pairingLink: null,
      pairingResultView: "details",
      error: null,
    }),
  setOpen: (open) => set({ open }),
  setClientLabel: (clientLabel) => {
    window.localStorage.setItem(pairingClientLabelStorageKey, clientLabel);
    set({ clientLabel });
  },
  setScopes: (scopes) => set({ scopes }),
  setReadOnlyScopes: () => set({ scopes: [AUTH_ORCHESTRATION_READ_SCOPE] }),
  setStandardScopes: () => set({ scopes: AUTH_STANDARD_CLIENT_SCOPES }),
  toggleScope: (scope, checked) =>
    set((state) => ({
      scopes: checked
        ? state.scopes.includes(scope)
          ? state.scopes
          : [...state.scopes, scope]
        : state.scopes.filter((currentScope) => currentScope !== scope),
    })),
  setPairingLink: (pairingLink) => set({ pairingLink, pairingResultView: "details", error: null }),
  setPairingResultView: (pairingResultView) => set({ pairingResultView }),
  togglePairingResultView: () =>
    set((state) => ({
      pairingResultView: state.pairingResultView === "qr" ? "details" : "qr",
    })),
  setError: (error) => set({ error }),
  reset: () =>
    set({
      open: false,
      environment: null,
      clientLabel: "",
      scopes: AUTH_STANDARD_CLIENT_SCOPES,
      pairingLink: null,
      pairingResultView: "details",
      error: null,
    }),
}));
