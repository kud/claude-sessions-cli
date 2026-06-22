# Changelog

All notable changes to this project are documented here.

---

## [Unreleased] — 2026-06-22

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

- **Move session wizard** — press `M` in the session list to interactively relocate a Claude session to a different project folder. The three-step wizard rewrites the session's working directory on disk, reconciles `~/.claude.json` to keep the index consistent, and warns you if the session content contains embedded path references that may still point to the old location. ([2b893b8](https://github.com/kud/claude-sessions-cli/commit/2b893b8b334af472c36964cdc1654159bb93b9e4))

### Documentation

- Docs now live on [kud.io/projects](https://kud.io/projects) rather than GitHub Pages. The README has been slimmed to a front-page entry point, with full content (headings, examples, CLI reference) moved to the dedicated docs site. ([e27b7a8](https://github.com/kud/claude-sessions-cli/commit/e27b7a83f563fe9177ff5f30ef9c8586be0631db))

<details>
<summary>Internal (3 commits)</summary>

- Removed the obsolete GitHub Pages deployment workflow now that docs live on kud.io. ([46f20cc](https://github.com/kud/claude-sessions-cli/commit/46f20cca7d601576bea389ac67e3c6717aa20020))
- Aligned README shape to the canonical kud-site format. ([2d67365](https://github.com/kud/claude-sessions-cli/commit/2d673654a4d5463b2eaf8916a4f5c387d93ae122))
- Added emoji decoration to docs headings. ([6c91617](https://github.com/kud/claude-sessions-cli/commit/6c91617c091faf247948f1e2ba13e53860a4d504))

</details>
