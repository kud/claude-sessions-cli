<div align="center">

&nbsp;

[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D24-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![npm](https://img.shields.io/badge/npm-%40kud%2Fclaude--sessions--cli-CB3837?style=flat-square&logo=npm&logoColor=white)](https://www.npmjs.com/package/@kud/claude-sessions-cli)
[![MIT](https://img.shields.io/badge/licence-MIT-22C55E?style=flat-square)](LICENSE)

**TUI session manager for Claude Code — browse, resume, organise, and clean up all your sessions from one interactive interface.**

<a href="https://kud.io/projects/claude-sessions-cli">Website</a> · <a href="https://kud.io/projects/claude-sessions-cli/docs">Documentation</a>

</div>

---

A TUI session manager for Claude Code — browse, resume, organise, and clean up all your sessions from one interactive interface.

## ✨ Features

- 🗂 **Three-tab interface** — Code sessions grouped by project, Chat sessions with pins and tag folders, and a Scheduled tab
- ⭐ **Pin & tag chat sessions** — star important chats to the top, group others into collapsible `#tag` folders
- 🔁 **Instant resume** — press `enter` on any session and Claude Code opens right where you left off, using the correct `--resume`, `--continue`, or `--name` flag automatically
- 🪄 **Auto CLAUDE.md creation** — new chat sessions get a `CLAUDE.md` bootstrapped automatically; preview any session's `CLAUDE.md` in-place with `m`
- 🧹 **Clean mode** — interactive cleanup of ghost entries, history-less projects, and orphaned history folders; available as both a key binding (`C`) and a subcommand
- ✨ **Animated banner** — a sparkle ASCII animation plays on first launch while sessions load in the background; skip it with `--no-banner`
- 🔍 **Live search** — filter sessions by name or path as you type with `/`

## 🚀 Install

```sh
npm install -g @kud/claude-sessions-cli@next
```

## 📖 Documentation

Full usage, options, and examples live on the docs site:

**→ [kud.io/projects/claude-sessions-cli/docs](https://kud.io/projects/claude-sessions-cli/docs)**

## 🔧 Development

```sh
git clone git@github.com:kud/claude-sessions-cli.git
cd claude-sessions-cli
npm install
npm run dev
```

## License

MIT © [kud](https://github.com/kud) — Made with ❤️
