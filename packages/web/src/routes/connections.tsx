import { createFileRoute } from "@tanstack/react-router";

import { McpPage } from "../features/mcp/mcp-page.tsx";

export const Route = createFileRoute("/connections")({
  component: McpPage,
});
