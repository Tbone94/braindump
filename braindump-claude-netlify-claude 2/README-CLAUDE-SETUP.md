# Braindump + Claude on Netlify

This version keeps Braindump offline-first, but adds a Netlify Function at:

`/.netlify/functions/sort`

The frontend calls that endpoint first. If the function is missing, the API key is missing, Claude is down, or validation fails, the app falls back to the local offline parser.

## Files

- `index.html` — the app UI, offline parser, and review-before-save flow.
- `netlify/functions/sort.js` — server-side Claude API call. Your API key stays here on Netlify, not in the browser.
- `netlify.toml` — tells Netlify where the static site and functions live.
- `package.json` — optional helper scripts for local dev.

## Environment variables needed on Netlify

Required:

`ANTHROPIC_API_KEY=your_api_key_here`

Optional:

`ANTHROPIC_MODEL=claude-haiku-4-5`

If Anthropic changes the alias or you want a specific pinned model version later, update `ANTHROPIC_MODEL` in Netlify instead of editing code.
