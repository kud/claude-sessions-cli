<div align="center">

[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D24-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![npm](https://img.shields.io/npm/v/%40kud%2Fclaude-sessions-cli?style=flat-square&color=CB3837)](https://www.npmjs.com/package/@kud/claude-sessions-cli)
[![MIT](https://img.shields.io/badge/licence-MIT-22C55E?style=flat-square)](LICENSE)

**TUI session manager for Claude Code**

<a href="https://kud.io/projects/claude-sessions-cli">Website</a> · <a href="https://kud.io/projects/claude-sessions-cli/docs">Documentation</a>

</div>

## Features

- **Three-tab interface** — Code sessions grouped by project, Chat sessions with pins and tag folders, and a Scheduled tab.
- **Instant resume** — press `enter` on any session and Claude Code opens right where you left off, using the correct flag automatically.
- **Pin and tag chat sessions** — star important chats to the top, group others into collapsible `#tag` folders.
- **Auto CLAUDE.md creation** — new chat sessions get a `CLAUDE.md` bootstrapped automatically; preview any session's file in-place with `m`.
- **Clean mode** — interactive cleanup of ghost entries, history-less projects, and orphaned history folders.
- **Live search** — filter sessions by name or path as you type with `/`.

## Install

```sh
npm install -g @kud/claude-sessions-cli
```

## Usage

```console
$ claude-sessions
$ claude-sessions clean
$ claude-sessions --no-banner
```

## Development

```sh
git clone https://github.com/kud/claude-sessions-cli.git
cd claude-sessions-cli
npm install
npm run dev
```

📚 **Full documentation → [claude-sessions-cli/docs](https://kud.io/projects/claude-sessions-cli/docs)**
