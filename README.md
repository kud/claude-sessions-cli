<div align="center">

&nbsp;

[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D24-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![npm](https://img.shields.io/badge/npm-%40kud%2Fclaude--sessions--cli-CB3837?style=flat-square&logo=npm&logoColor=white)](https://www.npmjs.com/package/@kud/claude-sessions-cli)
[![MIT](https://img.shields.io/badge/licence-MIT-22C55E?style=flat-square)](LICENSE)

**TUI session manager for Claude Code — browse, resume, organise, and clean up all your sessions from one interactive interface.**

[Features](#-features) • [Quick Start](#-quick-start) • [CLI Reference](#-cli-reference) • [Development](#-development)

</div>

---

## 🌟 Features

- 🗂 **Three-tab interface** — Code sessions grouped by project, Chat sessions with pins and tag folders, and a Scheduled tab
- ⭐ **Pin & tag chat sessions** — star important chats to the top, group others into collapsible `#tag` folders
- 🔁 **Instant resume** — press `enter` on any session and Claude Code opens right where you left off, using the correct `--resume`, `--continue`, or `--name` flag automatically
- 🪄 **Auto CLAUDE.md creation** — new chat sessions get a `CLAUDE.md` bootstrapped automatically; preview any session's `CLAUDE.md` in-place with `m`
- 🧹 **Clean mode** — interactive cleanup of ghost entries, history-less projects, and orphaned history folders; available as both a key binding (`C`) and a subcommand
- ✨ **Animated banner** — a sparkle ASCII animation plays on first launch while sessions load in the background; skip it with `--no-banner`
- 🔍 **Live search** — filter sessions by name or path as you type with `/`

---

## 🚀 Quick Start

Install the prerelease:

```sh
npm install -g @kud/claude-sessions-cli@next
```

Launch the TUI:

```sh
claude-sessions
```

You will see a brief animated banner followed by the session browser:

```
  ✻ Claude

   Code   Chat   Scheduled

  / search…

  › + New chat

  › + my-api        (3)             2h
    + my-site        (1)         yesterday
    + dotfiles       (2)              5d
```

Pick a session with `↑` / `↓` and press `enter`. Claude Code opens immediately, resuming that exact conversation.

---

## 📖 CLI Reference

### Subcommands

| Command                       | Description                                |
| ----------------------------- | ------------------------------------------ |
| `claude-sessions`             | Open the TUI session browser               |
| `claude-sessions clean`       | Run the standalone clean-up wizard         |
| `claude-sessions --no-banner` | Open the TUI, skipping the intro animation |

### Tab overview

| Tab           | Contents                                                                         |
| ------------- | -------------------------------------------------------------------------------- |
| **Code**      | Sessions from project directories, grouped by project, expand/collapse per group |
| **Chat**      | Sessions from `~/.claude-sessions/chats/`, with pin stars and `#tag` folders     |
| **Scheduled** | Placeholder for scheduled tasks (coming soon)                                    |

### Key bindings

| Key         | Context         | Action                                     |
| ----------- | --------------- | ------------------------------------------ |
| `↑` `↓`     | Anywhere        | Navigate the list                          |
| `←` `→`     | Anywhere        | Switch tabs                                |
| `tab`       | Anywhere        | Cycle to the next tab                      |
| `enter`     | Session / group | Open or resume the session in Claude Code  |
| `space`     | Group header    | Expand or collapse the project / tag group |
| `d`         | Session         | Delete session (with confirmation)         |
| `d`         | Project header  | Delete all sessions for that project       |
| `r`         | Code session    | Rename the session label                   |
| `p`         | Chat session    | Pin or unpin (★) the session               |
| `t`         | Chat session    | Set or remove a `#tag` for the session     |
| `m`         | Chat session    | Preview the session's `CLAUDE.md` inline   |
| `f`         | Chat session    | Open the session folder in Finder          |
| `/`         | List            | Enter search mode — filter by name or path |
| `C`         | List            | Open clean mode                            |
| `q` / `esc` | Anywhere        | Quit                                       |

### Clean mode

Scans `~/.claude.json` and `~/.claude/projects/` for stale data and groups issues by type. Select which categories to remove before confirming — nothing is deleted without an explicit `y`.

| Type             | Meaning                                                                  | Action                       |
| ---------------- | ------------------------------------------------------------------------ | ---------------------------- |
| ghost            | In `~/.claude.json` but the project directory no longer exists           | Remove from `~/.claude.json` |
| no history       | In `~/.claude.json` with no conversation history                         | Remove from `~/.claude.json` |
| orphaned history | History in `~/.claude/projects/` with no matching `~/.claude.json` entry | Trash the history folder     |

Clean mode is available as the `C` key inside the TUI and as the standalone `claude-sessions clean` subcommand.

---

## 🔧 Development

### Project structure

```
claude-sessions-cli/
├── src/
│   └── index.tsx        # entire application — TUI, banner, session logic
├── dist/                # compiled output (generated)
├── package.json
└── tsup.config.ts
```

### Scripts

| Script                 | Description                        |
| ---------------------- | ---------------------------------- |
| `npm run dev`          | Run directly from source via `tsx` |
| `npm run build`        | Compile to `dist/` with `tsup`     |
| `npm run build:watch`  | Watch mode compilation             |
| `npm run typecheck`    | Type-check without emitting        |
| `npm run clean`        | Remove `dist/`                     |
| `npm run publish:next` | Publish to the `next` tag on npm   |

### Clone and run locally

```sh
git clone git@github.com:kud/claude-sessions-cli.git
cd claude-sessions-cli
npm install
npm run dev
```

---

## 🏗 Tech Stack

| Package          | Role                                    |
| ---------------- | --------------------------------------- |
| `ink`            | React renderer for the terminal         |
| `ink-text-input` | Controlled text input component for Ink |
| `ink-spinner`    | Spinner component for loading states    |
| `react`          | UI component model                      |
| `tsup`           | TypeScript bundler                      |
| `tsx`            | Direct TypeScript execution for dev     |
| `typescript`     | Static typing                           |

---

MIT © [kud](https://github.com/kud) — Made with ❤️
