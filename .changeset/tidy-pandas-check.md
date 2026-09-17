---
"@t3code-gateway/contracts": minor
"@t3code-gateway/screenshots": minor
"@t3code-gateway/server": minor
"@t3code-gateway/web": minor
---

Support a GitHub token for T3 Code Web update checks. Set it in the admin UI (T3 Code Versions)
or with `T3_GATEWAY_GITHUB_TOKEN` during deployment; the UI value wins when both are set. The UI
value is encrypted at rest with the gateway secret key, like environment tokens. A token
with no scopes is enough and raises the GitHub API quota from 60 to 5,000 requests per hour.
