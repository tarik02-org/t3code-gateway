---
"@t3code-gateway/web": patch
---

Show a notification when creating a pairing link fails. The error was only rendered at the bottom
of the dialog's scrollable permissions panel, so a rejected request looked like a spinner that
silently stopped.
