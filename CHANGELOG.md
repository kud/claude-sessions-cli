# Changelog

All notable changes to this project are documented here.

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

---

## Unreleased — 2026-06-21

### Highlights

- **Move session** — highlight a session in the Code list and press `M` to relocate it. You land straight in a **filesystem folder browser** rooted at the session's parent directory: navigate with `↑↓`, `→` to open a folder, `←` to go up, and `enter` to drop the session there. Any on-disk folder is a valid destination — it does **not** need to already contain a Claude session — and folders that do are flagged with a dim `sessions` tag. `+ New subfolder here…` and `+ Other path…` cover the cases the browser can't. The move rewrites the session's `cwd` on every line, reconciles `~/.claude.json` to keep the index consistent, and warns you about any embedded path references in the conversation history that are deliberately left untouched (rewriting them blindly would corrupt references to unrelated paths sharing the same prefix). ([2b893b8](https://github.com/kud/claude-sessions-cli/commit/2b893b8b334af472c36964cdc1654159bb93b9e4))

### Documentation

- Docs now live on [kud.io/projects](https://kud.io/projects) rather than GitHub Pages. The README has been slimmed to a front-page entry point, with full content (headings, examples, CLI reference) moved to the dedicated docs site. ([e27b7a8](https://github.com/kud/claude-sessions-cli/commit/e27b7a83f563fe9177ff5f30ef9c8586be0631db))

<details>
<summary>Internal (3 commits)</summary>

- Removed the obsolete GitHub Pages deployment workflow now that docs live on kud.io. ([46f20cc](https://github.com/kud/claude-sessions-cli/commit/46f20cca7d601576bea389ac67e3c6717aa20020))
- Aligned README shape to the canonical kud-site format. ([2d67365](https://github.com/kud/claude-sessions-cli/commit/2d673654a4d5463b2eaf8916a4f5c387d93ae122))
- Added emoji decoration to docs headings. ([6c91617](https://github.com/kud/claude-sessions-cli/commit/6c91617c091faf247948f1e2ba13e53860a4d504))

</details>
