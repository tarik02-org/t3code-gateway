import { QueryClientProvider } from "@tanstack/react-query";
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { ToastProvider } from "../components/ui/toast.tsx";
import appCss from "../styles/app.css?url";

export interface RouterContext {
  readonly queryClient: import("@tanstack/react-query").QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "T3 Code Gateway" },
      { name: "application-name", content: "T3 Code Gateway" },
      { name: "apple-mobile-web-app-title", content: "T3 Code Gateway" },
      { name: "description", content: "T3 Code Gateway admin console" },
      { name: "theme-color", content: "#0a0a0a" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/admin/favicon.svg", type: "image/svg+xml" },
      { rel: "manifest", href: "/admin/site.webmanifest" },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <RootDocument>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <Outlet />
        </ToastProvider>
      </QueryClientProvider>
    </RootDocument>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html className="dark" lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
