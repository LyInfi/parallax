# gemini-webapi — NOTICE

This directory is a trimmed TypeScript port of the unofficial Gemini Web API client.

## Upstream credits

- **Original Python implementation**: [HanaokaYuzu/Gemini-API](https://github.com/HanaokaYuzu/Gemini-API) (MIT License)
- **TypeScript port**: [JimLiu/baoyu-skills — `skills/baoyu-danger-gemini-web/scripts/gemini-webapi/`](https://github.com/JimLiu/baoyu-skills) (MIT License)

## What was kept

- Protocol constants (endpoints, GRPC IDs, model hashes, headers)
- Core request/response flow for `generate_content` (text + image generation)
- Reference image upload via `content-push.googleapis.com/upload`
- `RotateCookies` one-shot refresh of `__Secure-1PSIDTS`
- Exception classes

## What was removed for Parallax

- Local filesystem cookie persistence (`cookie-file.ts`, `paths.ts`)
- Chrome/Chromium profile scanning via CDP (`load-browser-cookies.ts`)
- Background auto-refresh timer + global `rotate_tasks` map
- `GemMixin` + Gem CRUD (`components/`)
- `ChatSession` multi-turn state (not needed for single-shot image generation)
- `decorators.ts`

The streamlined client takes `__Secure-1PSID` + `__Secure-1PSIDTS` directly from Parallax Settings (via `localStorage` BYOK) and returns the refreshed `__Secure-1PSIDTS` to the caller so the adapter can emit a `credential-refresh` SSE event and the browser can update its stored value.

## Liability

This is **reverse-engineered** usage of the unofficial `gemini.google.com` Web frontend. It **violates Google's Terms of Service**. Users opt in via an explicit consent gate in the Parallax Settings UI. Parallax and its authors are not liable for account suspensions, IP blocks, or other consequences.
