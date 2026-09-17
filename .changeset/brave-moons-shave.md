---
"@t3code-gateway/web": patch
---

Show notifications above open dialogs. The toast viewport shared its stacking level with the
dialog backdrop, so a toast raised while a dialog was open was painted behind the overlay and
appeared dimmed and unclickable.
