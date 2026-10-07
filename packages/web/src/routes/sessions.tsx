import { createFileRoute } from "@tanstack/react-router";

import { SessionsPage } from "../features/sessions/sessions-page.tsx";

export const Route = createFileRoute("/sessions")({
  component: SessionsPage,
});
