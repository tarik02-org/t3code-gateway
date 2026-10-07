import { useState } from "react";

import { CopyButton } from "../../components/copy-button.tsx";
import { cn } from "../../lib/utils.ts";
import { agentSnippets } from "./agent-snippets.ts";

/** Renders `code` spans in a caption written with backticks. */
function Caption({ text }: Readonly<{ text: string }>) {
  let offset = 0;
  const parts = text.split("`").map((part, index) => {
    const start = offset;
    offset += part.length + 1;
    return { start, part, code: index % 2 === 1 };
  });
  return (
    <p className="text-xs leading-relaxed text-muted-foreground">
      {parts.map(({ start, part, code }) =>
        code ? (
          <code
            className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground"
            key={start}
          >
            {part}
          </code>
        ) : (
          part
        ),
      )}
    </p>
  );
}

/** Per-agent setup: agents on the left, the selected agent's setup on the right. */
export function AgentSetup({ mcpUrl, token }: Readonly<{ mcpUrl: string; token: string | null }>) {
  const snippets = agentSnippets(mcpUrl, token);
  const [agentId, setAgentId] = useState("generic");
  const snippet = snippets.find((candidate) => candidate.agentId === agentId) ?? snippets[0];

  return (
    <div className="flex min-h-64 gap-4">
      <nav className="flex w-32 shrink-0 flex-col gap-0.5" aria-label="Agent">
        {snippets.map((candidate) => (
          <button
            aria-current={candidate.agentId === snippet?.agentId ? "page" : undefined}
            className={cn(
              "rounded-md px-2.5 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground",
              candidate.agentId === snippet?.agentId && "bg-muted/60 font-medium text-foreground",
            )}
            key={candidate.agentId}
            type="button"
            onClick={() => setAgentId(candidate.agentId)}
          >
            {candidate.title}
          </button>
        ))}
      </nav>
      {snippet === undefined ? null : (
        <div className="min-w-0 flex-1 space-y-2.5">
          <Caption text={snippet.caption} />
          {snippet.fields === undefined ? null : (
            <dl className="divide-y divide-border/60 rounded-lg border border-input bg-muted/25">
              {snippet.fields.map((field) => (
                <div className="flex items-center gap-3 py-1 pr-1 pl-3" key={field.label}>
                  <dt className="w-24 shrink-0 text-xs text-muted-foreground">{field.label}</dt>
                  <dd className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
                    {field.value}
                  </dd>
                  <CopyButton
                    className="shrink-0"
                    label={`Copy ${field.label}`}
                    value={field.value}
                  />
                </div>
              ))}
            </dl>
          )}
          {snippet.code === undefined ? null : (
            <div className="flex items-start gap-1 rounded-lg border border-input bg-muted/25 pr-1">
              <pre className="min-w-0 flex-1 overflow-x-auto p-3 font-mono text-xs leading-relaxed text-foreground">
                {snippet.code}
              </pre>
              <CopyButton
                className="mt-1 shrink-0"
                label={`Copy ${snippet.title} setup`}
                value={snippet.code}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
