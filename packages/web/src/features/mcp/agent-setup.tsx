import { useState } from "react";

import { CopyButton } from "../../components/copy-button.tsx";
import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group.tsx";
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

/** Per-agent setup for the gateway URL; with a token, agents send it instead of signing in. */
export function AgentSetup({ mcpUrl, token }: Readonly<{ mcpUrl: string; token: string | null }>) {
  const snippets = agentSnippets(mcpUrl, token);
  const [agentId, setAgentId] = useState(snippets[0]?.agentId ?? "");
  const snippet = snippets.find((candidate) => candidate.agentId === agentId) ?? snippets[0];

  return (
    <div className="space-y-3">
      <ToggleGroup
        className="flex-wrap"
        type="single"
        variant="outline"
        size="sm"
        value={snippet?.agentId ?? ""}
        onValueChange={(value) => {
          if (value !== "") {
            setAgentId(value);
          }
        }}
        aria-label="Agent"
      >
        {snippets.map((candidate) => (
          <ToggleGroupItem key={candidate.agentId} value={candidate.agentId}>
            {candidate.title}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {snippet === undefined ? null : (
        <div className="space-y-2">
          <Caption text={snippet.caption} />
          <div className="flex items-start gap-1 rounded-lg border border-input bg-muted/25 pr-1.5">
            <pre className="min-w-0 flex-1 overflow-x-auto p-3 font-mono text-xs leading-relaxed text-foreground">
              {snippet.code}
            </pre>
            <CopyButton
              className="mt-1.5 shrink-0"
              label={`Copy ${snippet.title} setup`}
              value={snippet.code}
            />
          </div>
        </div>
      )}
    </div>
  );
}
