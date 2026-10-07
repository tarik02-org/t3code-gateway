import { createFileRoute } from "@tanstack/react-router";

import { ConnectPage } from "../features/mcp/connect-page.tsx";

export const Route = createFileRoute("/connect")({
  component: ConnectPage,
});
