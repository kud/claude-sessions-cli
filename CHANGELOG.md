# Changelog

All notable changes to this project are documented here.

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
