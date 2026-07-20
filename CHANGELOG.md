# Changelog

All notable changes to this project are documented here.

---

## Unreleased — 2026-07-20

### Highlights

- Session browsing and resuming now follow Claude Code's own `CLAUDE_CONFIG_DIR` convention, so the tool works with whichever profile you're actually running in instead of always reading the default `~/.claude/projects` — resuming a session lands you back in that same profile rather than the default one. ([7fdd383](https://github.com/kud/claude-sessions-cli/commit/7fdd383e1bf6cfd8c1605acb35e6d7bbb67c79ff))

### Fixes

- Fixed a leak where chats, labels, pins, and tags from every profile were listed together regardless of which profile was active — this state is now scoped per profile, matching the session data itself. ([7fdd383](https://github.com/kud/claude-sessions-cli/commit/7fdd383e1bf6cfd8c1605acb35e6d7bbb67c79ff))
- Unrecognised CLI flags are now rejected with an error instead of being silently swallowed and running the tool against the wrong data with no warning. ([7fdd383](https://github.com/kud/claude-sessions-cli/commit/7fdd383e1bf6cfd8c1605acb35e6d7bbb67c79ff))

### Internal

- Consolidated the README's preview screenshots into a single hero image and removed the unused `next`-tag publish workflow. ([353bbdc](https://github.com/kud/claude-sessions-cli/commit/353bbdc5fb17b87f8f3d312dd04f371738726fa5), [64d5c93](https://github.com/kud/claude-sessions-cli/commit/64d5c9347f88bdea6ca64c737652def904cafd4e))

---

## [2.4.0] — 2026-06-23

### Highlights

- **Move session — folder browser replaces wizard** — pressing `M` on a session in the Code list now drops you straight into a live filesystem folder browser instead of a three-step wizard. Navigate with `↑↓`, `←` to go up a level, `→` to enter a subfolder, and `Enter` to confirm the destination. Folders that already contain Claude sessions are flagged with a dim `sessions` tag. Any directory is a valid target — it does not need to be an existing session folder. `+ New subfolder here…` and `+ Other path…` cover edge cases the browser cannot reach. The move rewrites the session's `cwd` throughout the conversation history and reconciles `~/.claude.json`, while warning about any embedded path references that are intentionally left untouched to avoid corrupting unrelated path prefixes. ([5f99ab6](https://github.com/kud/claude-sessions-cli/commit/5f99ab653fa4b9848fb6a60f42bbf8f11298c83d))

---

## [2.3.0] — 2026-06-22

### Added

- **`--mock` flag** — run `claude-sessions --mock` to launch the TUI with a set of pre-populated fake sessions. Useful for screenshots, demos, and testing UI changes without needing real Claude history.
- **Preview screenshot** — `assets/preview.png` added and wired into the README and docs so visitors see what the TUI looks like immediately.

### Changed

- **README feature list** — expanded to surface recently shipped features: named sessions (`name · prompt` display), the named-only filter (`n`), move (`M`), rename (`r`), delete (`d`), and the correct `--resume`/`--continue`/`--name` flag behaviour on resume.
- **Install instruction simplified** — the docs no longer point to `@next`; the stable `@latest` tag is now the default install path (`npm install -g @kud/claude-sessions-cli`).
- **Homepage updated** — `package.json` homepage now points to `kud.io/projects/claude-sessions-cli` instead of the old GitHub Pages URL.
- **Docs quick-start trimmed** — removed the verbose ASCII-art session-browser example from the docs; the preview image replaces it with something more accurate and easier to maintain.

---

## [2.2.0] — 2026-06-22

### Added

- **Session titles in the code tab** — sessions that have a saved title (set by Claude's `custom-title` event) now display it in **cyan** alongside the opening prompt. This makes it much easier to tell sessions apart at a glance without having to open them.
- **Named-only filter (`n`)** — press `n` while on the Code tab to toggle a filter that hides sessions without a title, leaving only the named ones. The current filter state is shown in the status bar and as a hint in the key legend. The filter resets automatically when you switch tabs.
- **Faster startup animation** — the intro sparkle sequence plays roughly twice as fast, reducing the perceived load time before the session list appears.

### Changed

- Session labels are now cleaned more aggressively before display: leading Markdown heading markers (`#`), list bullets (`-`, `*`, `+`), checkbox syntax (`[ ]`/`[x]`), and inline formatting (`*`, `_`, `` ` ``) are all stripped. This means prompts or titles that were authored in Markdown render as clean plain text rather than showing raw syntax.
- When both a title and a first-prompt are available and they differ, the label is displayed as **title · prompt**, giving you the context of the opening message alongside the session name.
- Manual label overrides (set via the rename wizard) now clear the stored `title` and `prompt` fields so the override is displayed without the dual-part format.
