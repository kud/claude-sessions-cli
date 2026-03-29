# claude-sessions

<p align="center">
  <b>TUI session manager for Claude Code</b><br/>
  Browse, open, create, and clean up your Claude sessions from a single interactive interface.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@kud/claude-sessions-cli"><img alt="npm version" src="https://img.shields.io/npm/v/%40kud%2Fclaude-sessions-cli?color=brightgreen" /></a>
  <a href="https://www.npmjs.com/package/@kud/claude-sessions-cli"><img alt="downloads" src="https://img.shields.io/npm/dm/%40kud%2Fclaude-sessions-cli" /></a>
  <a href="LICENSE"><img alt="license" src="https://img.shields.io/npm/l/%40kud%2Fclaude-sessions-cli" /></a>
  <a href="https://nodejs.org"><img alt="node version" src="https://img.shields.io/node/v/%40kud%2Fclaude-sessions-cli" /></a>
</p>

> TL;DR: Run `claude-sessions`, pick a session, press `enter`. Claude Code opens right where you left off.

---

## Table of Contents

- [Why](#why)
- [Features](#features)
- [Install](#install)
- [Usage](#usage)
- [Key Bindings](#key-bindings)
- [Clean Mode](#clean-mode)
- [Requirements](#requirements)

## Why

Claude Code stores sessions per directory but gives you no way to navigate them. This tool:

- Lists all your sessions (chat + code) sorted by last activity
- Lets you jump straight back into any session with `enter`
- Separates chat sessions (`~/.chats/`) from code sessions (project dirs)
- Keeps your session data clean with an interactive cleanup mode

## Features

| Category   | Highlights                                                          |
| ---------- | ------------------------------------------------------------------- |
| Navigation | Sorted by last activity, grouped by type (chat / code)              |
| Search     | Fuzzy filter by name or path with `/`                               |
| Filter     | Toggle between all / chat / code views with `tab`                   |
| New chat   | Create a named chat session and open it immediately                 |
| Delete     | Remove a session's history and directory with confirmation          |
| Clean mode | Interactive cleanup of ghost entries, stale pointers, orphaned dirs |

## Install

```sh
npm install -g @kud/claude-sessions-cli
```

## Usage

```sh
claude-sessions         # open the TUI
claude-sessions clean   # clean up stale session data
```

### TUI

```
/ search…

  + New chat

── chat ────────────────────────
▶ 󰭹  Hey         ~/.chats/hey           just now
  󰭹  Planning    ~/.chats/planning      2h

── code ────────────────────────
  󰏗  my-project  ~/Projects/my-project  yesterday
  󰏗  api         ~/Projects/api         3d

↑↓ nav  enter open  d remove  / search  tab filter  C clean  q quit   [all] chat code
```

## Key Bindings

| Key         | Action                             |
| ----------- | ---------------------------------- |
| `↑` `↓`     | Navigate                           |
| `enter`     | Open session in Claude Code        |
| `d`         | Remove session (with confirmation) |
| `/`         | Search by name or path             |
| `tab`       | Cycle filter: all → chat → code    |
| `C`         | Open clean mode                    |
| `q` / `esc` | Quit                               |

## Clean Mode

Scans `~/.claude.json` and `~/.claude/projects/` for stale data. Issues are grouped by type — select which categories to clean before confirming. Nothing is deleted without confirmation.

| Type             | Meaning                                                                  | Action                       |
| ---------------- | ------------------------------------------------------------------------ | ---------------------------- |
| ghost            | Entry in `~/.claude.json` but the project directory no longer exists     | Remove from `~/.claude.json` |
| no history       | Entry in `~/.claude.json` with no conversation history                   | Remove from `~/.claude.json` |
| orphaned history | History in `~/.claude/projects/` with no matching `~/.claude.json` entry | Trash the history folder     |

Available as both a TUI mode (`C` key) and a standalone subcommand (`claude-sessions clean`).

## Requirements

- Node.js ≥ 24
- [Claude Code](https://claude.ai/code) installed (`claude` in `PATH`)
- [`trash`](https://github.com/sindresorhus/trash-cli) for safe deletes (`npm install -g trash-cli`)
