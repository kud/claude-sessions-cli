#!/usr/bin/env node
import React, { useState, useEffect, useMemo } from "react"
import { render, Box, Text, useInput, useApp, useStdout } from "ink"
import TextInput from "ink-text-input"
import { readdir, stat } from "fs/promises"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"
import { spawnSync, execSync } from "child_process"
import { homedir } from "os"

const HOME = homedir()
const CLAUDE_PROJECTS = join(HOME, ".claude", "projects")
const CLAUDE_JSON = join(HOME, ".claude.json")
const CLAUDE_SESSIONS_DIR = join(HOME, ".claude-sessions")
const CHATS_DIR = join(CLAUDE_SESSIONS_DIR, "chats")
const SESSION_LABELS_FILE = join(CLAUDE_SESSIONS_DIR, "session-labels.json")

const ICON_CHAT = "󰭹"
const ICON_CODE = ""
const ICON_SCHEDULE = "󰥔"

const SEL_COLOR = "#FF8C00"
const TABS: Tab[] = ["code", "chat", "schedule"]
const TAB_LABEL: Record<Tab, string> = {
  code: "Code",
  chat: "Chat",
  schedule: "Scheduled",
}
const TAB_ICON: Record<Tab, string> = {
  code: ICON_CODE,
  chat: ICON_CHAT,
  schedule: ICON_SCHEDULE,
}

type Tab = "code" | "chat" | "schedule"

type Session = {
  dir: string
  label: string
  path: string
  type: "chat" | "code"
  mtime: number
  ago: string
  claudeProjectDir: string
  sessionId?: string
  projectLabel?: string
}

type DisplayItem =
  | { kind: "new" }
  | {
      kind: "header"
      label: string
      dir: string
      expanded: boolean
      count: number
      recentSession: Session
    }
  | { kind: "session"; session: Session }

type CleanItem = {
  label: string
  reason: string
  execute: () => void
}

let pendingAction: { type: string; dir: string; sessionId?: string } | null =
  null
let savedState: { tab: Tab; cursor: number } = { tab: "code", cursor: 0 }

const slugify = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")

const humanLabel = (dir: string) => {
  const base = dir.split("/").pop() || dir
  const words = base
    .replace(/^[._-]+/, "")
    .replace(/[-_]+/g, " ")
    .trim()
  return (words || base).replace(/\b\w/g, (c) => c.toUpperCase())
}

const kebabLabel = (dir: string) => dir.split("/").pop() || dir

const timeAgo = (mtime: number) => {
  const diff = Date.now() / 1000 - mtime
  const m = Math.floor(diff / 60)
  const h = Math.floor(diff / 3600)
  const d = Math.floor(diff / 86400)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m`
  if (h < 24) return `${h}h`
  if (d === 1) return "yesterday"
  if (d < 7) return `${d}d`
  return new Date(mtime * 1000).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  })
}

const removeFromClaudeJson = (dir: string) => {
  try {
    const json = JSON.parse(readFileSync(CLAUDE_JSON, "utf8"))
    if (json.projects?.[dir]) {
      delete json.projects[dir]
      writeFileSync(CLAUDE_JSON, JSON.stringify(json, null, 2))
    }
  } catch {}
}

const toProjectDirName = (absPath: string) =>
  absPath.replace(/[^a-zA-Z0-9]/g, "-")

const readFirstPrompt = (filePath: string): string => {
  try {
    const content = readFileSync(filePath, "utf8")
    const lines = content.split("\n")
    let count = 0
    for (const line of lines) {
      if (!line.trim()) continue
      if (++count > 200) break
      try {
        const obj = JSON.parse(line)
        if (
          obj.type === "user" &&
          typeof obj.message?.content === "string" &&
          !obj.message.content.startsWith("<") &&
          !obj.message.content.includes("tool_use_id")
        ) {
          return obj.message.content.trim().replace(/\s+/g, " ").slice(0, 200)
        }
      } catch {}
    }
  } catch {}
  return ""
}

const loadSessionLabels = (): Record<string, string> => {
  try {
    return JSON.parse(readFileSync(SESSION_LABELS_FILE, "utf8"))
  } catch {
    return {}
  }
}

const saveSessionLabel = (sessionId: string, label: string) => {
  const labels = loadSessionLabels()
  labels[sessionId] = label
  writeFileSync(SESSION_LABELS_FILE, JSON.stringify(labels, null, 2))
}

const loadSessions = async (): Promise<Session[]> => {
  const sessions: Session[] = []

  if (existsSync(CLAUDE_JSON)) {
    try {
      const projectPaths = Object.keys(
        JSON.parse(readFileSync(CLAUDE_JSON, "utf8")).projects ?? {},
      )
      await Promise.all(
        projectPaths.map(async (cwd) => {
          try {
            const claudeProjectDir = join(
              CLAUDE_PROJECTS,
              toProjectDirName(cwd),
            )
            if (!existsSync(claudeProjectDir)) return
            const jsonlFiles = (await readdir(claudeProjectDir)).filter(
              (f: string) => f.endsWith(".jsonl"),
            )
            if (!jsonlFiles.length) return
            const shortPath = cwd.replace(HOME, "~")
            const type =
              cwd === HOME || cwd.startsWith(CHATS_DIR) ? "chat" : "code"
            const projectLabel =
              type === "chat" ? humanLabel(cwd) : kebabLabel(cwd)
            await Promise.all(
              jsonlFiles.map(async (f: string) => {
                try {
                  const jsonlPath = join(claudeProjectDir, f)
                  const mtime = (await stat(jsonlPath)).mtimeMs / 1000
                  const sessionId = f.replace(".jsonl", "")
                  const firstPrompt = readFirstPrompt(jsonlPath)
                  sessions.push({
                    dir: cwd,
                    label: firstPrompt || projectLabel,
                    path: shortPath,
                    type,
                    mtime,
                    ago: timeAgo(mtime),
                    claudeProjectDir,
                    sessionId,
                    projectLabel,
                  })
                } catch {}
              }),
            )
          } catch {}
        }),
      )
    } catch {}
  }

  if (existsSync(CHATS_DIR)) {
    try {
      const existingDirs = new Set(sessions.map((s) => s.dir))
      for (const dir of await readdir(CHATS_DIR)) {
        try {
          const fullPath = join(CHATS_DIR, dir)
          const dirStat = await stat(fullPath)
          if (!dirStat.isDirectory() || existingDirs.has(fullPath)) continue
          const mtime = dirStat.mtimeMs / 1000
          sessions.push({
            dir: fullPath,
            label: humanLabel(fullPath),
            path: fullPath.replace(HOME, "~"),
            type: "chat",
            mtime,
            ago: timeAgo(mtime),
            claudeProjectDir: "",
            projectLabel: humanLabel(fullPath),
          })
        } catch {}
      }
    } catch {}
  }

  const labelOverrides = loadSessionLabels()
  for (const s of sessions) {
    const override =
      (s.sessionId && labelOverrides[s.sessionId]) || labelOverrides[s.dir]
    if (override) s.label = override
  }

  return sessions.sort((a, b) => b.mtime - a.mtime)
}

const findCleanItems = async (): Promise<CleanItem[]> => {
  const items: CleanItem[] = []

  if (!existsSync(CLAUDE_JSON)) return items

  let projects: Record<string, unknown> = {}
  try {
    projects = JSON.parse(readFileSync(CLAUDE_JSON, "utf8")).projects ?? {}
  } catch {
    return items
  }

  const projectPaths = Object.keys(projects)

  for (const cwd of projectPaths) {
    const projectDir = join(CLAUDE_PROJECTS, toProjectDirName(cwd))
    const shortCwd = cwd.replace(HOME, "~")

    if (!existsSync(cwd)) {
      items.push({
        label: shortCwd,
        reason: "ghost (directory deleted)",
        execute: () => {
          removeFromClaudeJson(cwd)
          if (existsSync(projectDir)) execSync(`trash "${projectDir}"`)
        },
      })
      continue
    }

    if (!existsSync(projectDir)) {
      items.push({
        label: shortCwd,
        reason: "no history",
        execute: () => removeFromClaudeJson(cwd),
      })
      continue
    }

    try {
      const jsonlFiles = (await readdir(projectDir)).filter((f: string) =>
        f.endsWith(".jsonl"),
      )
      if (!jsonlFiles.length)
        items.push({
          label: shortCwd,
          reason: "no history",
          execute: () => {
            removeFromClaudeJson(cwd)
            execSync(`trash "${projectDir}"`)
          },
        })
    } catch {}
  }

  if (existsSync(CLAUDE_PROJECTS)) {
    const knownDirNames = new Set(projectPaths.map(toProjectDirName))
    try {
      for (const dir of await readdir(CLAUDE_PROJECTS)) {
        if (!knownDirNames.has(dir)) {
          const fullPath = join(CLAUDE_PROJECTS, dir)
          items.push({
            label: `~/.claude/projects/${dir}`,
            reason: "orphaned history",
            execute: () => execSync(`trash "${fullPath}"`),
          })
        }
      }
    } catch {}
  }

  return items
}

const deleteSession = (session: Session) => {
  if (session.sessionId) {
    const jsonlPath = join(
      session.claudeProjectDir,
      `${session.sessionId}.jsonl`,
    )
    try {
      execSync(`trash "${jsonlPath}"`)
    } catch {}
  } else if (session.type === "chat") {
    try {
      execSync(`trash "${session.dir}"`)
    } catch {}
  }
}

const buildDisplayItems = (
  tab: Tab,
  sessions: Session[],
  search: string,
  expandedProjects: Set<string>,
): DisplayItem[] => {
  const match = (s: Session) =>
    !search ||
    s.label.toLowerCase().includes(search.toLowerCase()) ||
    s.path.toLowerCase().includes(search.toLowerCase())

  if (tab === "chat") {
    const filtered = sessions.filter((s) => s.type === "chat").filter(match)
    return [
      { kind: "new" },
      ...filtered.map((s) => ({ kind: "session" as const, session: s })),
    ]
  }

  if (tab === "schedule") {
    return []
  }

  const filtered = sessions.filter((s) => s.type === "code").filter(match)
  const groups = new Map<string, Session[]>()
  for (const s of filtered) {
    if (!groups.has(s.dir)) groups.set(s.dir, [])
    groups.get(s.dir)!.push(s)
  }
  const items: DisplayItem[] = []
  for (const [dir, group] of groups) {
    const expanded = expandedProjects.has(dir)
    items.push({
      kind: "header",
      label: group[0].projectLabel ?? group[0].path,
      dir,
      expanded,
      count: group.length,
      recentSession: group[0]!,
    })
    if (expanded) {
      for (const s of group) items.push({ kind: "session", session: s })
    }
  }
  return items
}

const Hint = ({ pairs }: { pairs: [string, string][] }) => (
  <Box gap={2}>
    {pairs.map(([key, desc]) => (
      <Box key={key} gap={1}>
        <Text color="white">{key}</Text>
        <Text dimColor>{desc}</Text>
      </Box>
    ))}
  </Box>
)

const CleanConfirm = ({
  items,
  onConfirm,
  onCancel,
}: {
  items: CleanItem[] | null
  onConfirm: (selected: CleanItem[]) => void
  onCancel: () => void
}) => {
  const groups = items
    ? [...new Map(items.map((item) => [item.reason, item.reason])).keys()]
    : []

  const [cursor, setCursor] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (groups.length) setSelected(new Set(groups))
  }, [items])

  useInput(
    (input, key) => {
      if (!items) return
      if (key.upArrow) setCursor((c) => Math.max(0, c - 1))
      if (key.downArrow) setCursor((c) => Math.min(groups.length - 1, c + 1))
      if (input === " ")
        setSelected((s) => {
          const next = new Set(s)
          const reason = groups[cursor]
          if (next.has(reason)) next.delete(reason)
          else next.add(reason)
          return next
        })
      if (input === "a")
        setSelected((s) =>
          s.size === groups.length ? new Set() : new Set(groups),
        )
      if (input === "y")
        onConfirm(items.filter((item) => selected.has(item.reason)))
      if (input === "n" || key.escape) onCancel()
    },
    { isActive: !!items },
  )

  if (!items) return <Text dimColor> scanning…</Text>

  if (!items.length)
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Text color="green"> nothing to clean</Text>
        <Box marginTop={1}>
          <Hint pairs={[["esc", "back"]]} />
        </Box>
      </Box>
    )

  const REASON_COLOR: Record<string, string> = {
    "ghost (directory deleted)": "red",
    "no history": "yellow",
    "orphaned history": "magenta",
  }

  const countByReason = items.reduce<Record<string, number>>((acc, item) => {
    acc[item.reason] = (acc[item.reason] ?? 0) + 1
    return acc
  }, {})

  const itemsByReason = items.reduce<Record<string, CleanItem[]>>(
    (acc, item) => {
      ;(acc[item.reason] ??= []).push(item)
      return acc
    },
    {},
  )

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Text bold>Clean up</Text>
      <Box flexDirection="column" marginTop={1}>
        {groups.map((reason, i) => {
          const sel = i === cursor
          const checked = selected.has(reason)
          const color = REASON_COLOR[reason] ?? "white"
          return (
            <Box key={reason} flexDirection="column" marginTop={i > 0 ? 1 : 0}>
              <Box gap={2}>
                <Text color={sel ? "cyan" : "gray"}>{sel ? "›" : " "}</Text>
                <Text color={checked ? color : "gray"}>
                  {checked ? "[x]" : "[ ]"}
                </Text>
                <Text color={checked ? color : "gray"} bold={checked}>
                  {reason}
                </Text>
                <Text color={checked ? color : "gray"} dimColor>
                  {countByReason[reason]}
                </Text>
              </Box>
              {itemsByReason[reason].map((item) => (
                <Box key={item.label} paddingLeft={6} gap={1}>
                  <Text color={checked ? color : "gray"} dimColor>
                    │
                  </Text>
                  <Text color={checked ? "white" : "gray"} dimColor={!checked}>
                    {item.label}
                  </Text>
                </Box>
              ))}
            </Box>
          )
        })}
      </Box>
      <Box marginTop={1}>
        <Hint
          pairs={[
            ["↑↓", "nav"],
            ["space", "toggle"],
            ["a", "all"],
            ["y", "confirm"],
            ["n / esc", "cancel"],
          ]}
        />
      </Box>
    </Box>
  )
}

const CleanApp = () => {
  const { exit } = useApp()
  const [items, setItems] = useState<CleanItem[] | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    findCleanItems().then(setItems)
  }, [])

  if (done) return <Text color="green"> done</Text>

  return (
    <CleanConfirm
      items={items}
      onConfirm={(selected) => {
        for (const item of selected) item.execute()
        setDone(true)
        setTimeout(exit, 300)
      }}
      onCancel={exit}
    />
  )
}

const App = () => {
  const { exit } = useApp()
  const { stdout } = useStdout()
  const [sessions, setSessions] = useState<Session[] | null>(null)
  const [tab, setTab] = useState<Tab>(savedState.tab)
  const [cursor, setCursor] = useState(savedState.cursor)
  const [mode, setMode] = useState<
    "list" | "search" | "new" | "rename" | "confirm-delete" | "clean-confirm"
  >("list")
  const [newName, setNewName] = useState("")
  const [renameValue, setRenameValue] = useState("")
  const [search, setSearch] = useState("")
  const [cleanItems, setCleanItems] = useState<CleanItem[] | null>(null)
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(
    new Set(),
  )
  const [scrollOffset, setScrollOffset] = useState(0)

  useEffect(() => {
    loadSessions().then(setSessions)
  }, [])

  const CHROME_ROWS = 9
  const listHeight = Math.max(1, (stdout.rows ?? 24) - CHROME_ROWS)

  const displayItems = useMemo(
    () =>
      sessions
        ? buildDisplayItems(tab, sessions, search, expandedProjects)
        : [],
    [sessions, tab, search, expandedProjects],
  )

  useEffect(() => {
    if (cursor < scrollOffset) setScrollOffset(cursor)
    else if (cursor >= scrollOffset + listHeight)
      setScrollOffset(cursor - listHeight + 1)
  }, [cursor, listHeight])

  useEffect(() => {
    setScrollOffset(0)
  }, [tab, search])

  const moveCursor = (dir: 1 | -1) =>
    setCursor((c) => Math.max(0, Math.min(displayItems.length - 1, c + dir)))

  const toggleExpand = (dir: string) =>
    setExpandedProjects((prev) => {
      if (prev.has(dir)) return new Set()
      return new Set([dir])
    })

  const cycleTab = (dir: 1 | -1) => {
    const next = TABS[(TABS.indexOf(tab) + dir + TABS.length) % TABS.length]!
    setTab(next)
    setSearch("")
  }

  const doOpen = (session: Session) => {
    savedState = { tab, cursor }
    pendingAction = {
      type: session.sessionId
        ? "resume"
        : session.claudeProjectDir
          ? "open"
          : "new",
      dir: session.dir,
      sessionId: session.sessionId,
    }
    exit()
  }

  useEffect(() => {
    setCursor(0)
  }, [tab])

  useInput(
    (input, key) => {
      if (key.upArrow) moveCursor(-1)
      if (key.downArrow) moveCursor(1)
      if (key.leftArrow) cycleTab(-1)
      if (key.rightArrow) cycleTab(1)
      if (key.tab) cycleTab(1)
      if (input === "/") {
        setMode("search")
        setSearch("")
        setCursor(0)
      }

      if (key.return) {
        const item = displayItems[cursor]
        if (!item) return
        if (item.kind === "new") {
          setMode("new")
          setNewName("")
        } else if (item.kind === "header") {
          doOpen(item.recentSession)
        } else if (item.kind === "session") {
          doOpen(item.session)
        }
      }
      if (input === " ") {
        const item = displayItems[cursor]
        if (item?.kind === "header") {
          const expanding = !expandedProjects.has(item.dir)
          toggleExpand(item.dir)
          if (expanding) setCursor(cursor + 1)
        }
      }
      if (input === "d") {
        const item = displayItems[cursor]
        if (item?.kind === "session") setMode("confirm-delete")
      }
      if (input === "r") {
        const item = displayItems[cursor]
        if (item?.kind === "session" && item.session.sessionId) {
          setRenameValue(item.session.label)
          setMode("rename")
        }
      }
      if (input === "f") {
        const item = displayItems[cursor]
        const dir =
          item?.kind === "session" && item.session.type === "chat"
            ? item.session.dir
            : null
        if (dir) spawnSync("open", [dir])
      }
      if (input === "C") {
        setCleanItems(null)
        setMode("clean-confirm")
        findCleanItems().then(setCleanItems)
      }
      if (input === "q" || key.escape) exit()
    },
    { isActive: mode === "list" && !!sessions },
  )

  useInput(
    (input, key) => {
      if (key.upArrow) moveCursor(-1)
      if (key.downArrow) moveCursor(1)
      if (key.return) {
        const item = displayItems[cursor]
        if (!item) return
        if (item.kind === "new") {
          setSearch("")
          setMode("new")
          setNewName("")
        } else if (item.kind === "session") {
          doOpen(item.session)
        }
      }
      if (key.escape) {
        setSearch("")
        setMode("list")
        setCursor(0)
      }
    },
    { isActive: mode === "search" && !!sessions },
  )

  useInput(
    (input, key) => {
      if (input === "y") {
        const item = displayItems[cursor]
        if (item?.kind === "session") {
          deleteSession(item.session)
          setSessions((s) =>
            s!.filter(
              (x) =>
                !(
                  x.dir === item.session.dir &&
                  x.sessionId === item.session.sessionId
                ),
            ),
          )
          setCursor((c) => Math.max(0, c - 1))
        }
        setMode("list")
      }
      if (input === "n" || key.escape) setMode("list")
    },
    { isActive: mode === "confirm-delete" },
  )

  useInput(
    (_, key) => {
      if (key.escape) setMode("list")
    },
    { isActive: mode === "new" || mode === "rename" },
  )

  if (!sessions)
    return (
      <Box paddingX={2} paddingY={1}>
        <Text dimColor>Loading...</Text>
      </Box>
    )

  if (mode === "new")
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Text bold>New chat</Text>
        <Box marginTop={1} gap={1}>
          <Text color="cyan">›</Text>
          <TextInput
            value={newName}
            onChange={setNewName}
            onSubmit={(val) => {
              if (!val.trim()) {
                setMode("list")
                return
              }
              const dir = join(CHATS_DIR, slugify(val.trim()))
              saveSessionLabel(dir, val.trim())
              savedState = { tab, cursor }
              pendingAction = { type: "new", dir }
              exit()
            }}
          />
        </Box>
        <Box marginTop={1}>
          <Hint pairs={[["esc", "cancel"]]} />
        </Box>
      </Box>
    )

  if (mode === "rename") {
    const item = displayItems[cursor]
    const session = item?.kind === "session" ? item.session : null
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Text bold>Rename session</Text>
        {session && <Text dimColor>{session.path}</Text>}
        <Box marginTop={1} gap={1}>
          <Text color="cyan">›</Text>
          <TextInput
            value={renameValue}
            onChange={setRenameValue}
            onSubmit={(val) => {
              if (!val.trim() || !session?.sessionId) {
                setMode("list")
                return
              }
              saveSessionLabel(session.sessionId, val.trim())
              setSessions((prev) =>
                prev
                  ? prev.map((s) =>
                      s.sessionId === session.sessionId
                        ? { ...s, label: val.trim() }
                        : s,
                    )
                  : prev,
              )
              setMode("list")
            }}
          />
        </Box>
        <Box marginTop={1}>
          <Text dimColor>enter to save · esc to cancel</Text>
        </Box>
      </Box>
    )
  }

  if (mode === "confirm-delete") {
    const item = displayItems[cursor]
    const session = item?.kind === "session" ? item.session : null
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Text>
          Remove{" "}
          <Text color="red" bold>
            {session?.label ?? ""}
          </Text>
          ?
        </Text>
        {session && <Text dimColor>{session.path}</Text>}
        <Box marginTop={1}>
          <Hint
            pairs={[
              ["y", "confirm"],
              ["n / esc", "cancel"],
            ]}
          />
        </Box>
      </Box>
    )
  }

  if (mode === "clean-confirm")
    return (
      <CleanConfirm
        items={cleanItems}
        onConfirm={(selected) => {
          for (const item of selected) item.execute()
          setMode("list")
          loadSessions().then(setSessions)
        }}
        onCancel={() => setMode("list")}
      />
    )

  const isSearching = mode === "search"
  const visibleItems = displayItems.slice(
    scrollOffset,
    scrollOffset + listHeight,
  )

  return (
    <Box flexDirection="column" paddingY={1} width={stdout.columns}>
      <Box paddingX={2} gap={3} marginBottom={1}>
        {TABS.map((t) => (
          <Box key={t} gap={1}>
            <Text color={tab === t ? SEL_COLOR : "gray"}>{TAB_ICON[t]}</Text>
            <Text
              color={tab === t ? SEL_COLOR : "gray"}
              bold={tab === t}
              underline={tab === t}
            >
              {TAB_LABEL[t]}
            </Text>
          </Box>
        ))}
      </Box>

      <Box paddingX={2} marginBottom={1} gap={1}>
        <Text dimColor>/</Text>
        {isSearching ? (
          <TextInput
            value={search}
            onChange={(v) => {
              setSearch(v)
              setCursor(0)
            }}
            onSubmit={() => {}}
          />
        ) : (
          <Text dimColor>{search || "search…"}</Text>
        )}
      </Box>

      {tab === "schedule" && displayItems.length === 0 && (
        <Box paddingX={2} paddingY={1}>
          <Text dimColor>no scheduled tasks yet</Text>
        </Box>
      )}

      {visibleItems.map((item, vi) => {
        const i = scrollOffset + vi
        const sel = i === cursor
        if (item.kind === "new") {
          return (
            <Box key="new" paddingX={2} gap={1}>
              <Text color={sel ? "green" : "gray"}>{sel ? "›" : " "}</Text>
              <Text color={sel ? SEL_COLOR : "white"} bold={sel}>
                + New chat
              </Text>
            </Box>
          )
        }
        if (item.kind === "header") {
          return (
            <Box key={`h-${item.dir}`} paddingX={2} gap={1}>
              <Text color={sel ? "green" : "gray"}>
                {item.expanded ? "-" : "+"}
              </Text>
              <Text color={sel ? SEL_COLOR : "green"}>{ICON_CODE}</Text>
              <Box flexGrow={1} flexShrink={1} minWidth={0}>
                <Text
                  color={sel ? SEL_COLOR : "white"}
                  bold={sel}
                  wrap="truncate-end"
                >
                  {item.label}
                  {item.count > 1 && (
                    <Text
                      color={sel ? SEL_COLOR : "gray"}
                    >{` (${item.count})`}</Text>
                  )}
                </Text>
              </Box>
              {!item.expanded && (
                <Box flexShrink={0} minWidth={9} justifyContent="flex-end">
                  <Text dimColor>{item.recentSession.ago}</Text>
                </Box>
              )}
            </Box>
          )
        }
        const s = item.session
        const indent = tab === "code" ? 4 : 2
        return (
          <Box
            key={`${s.dir}-${s.sessionId ?? s.label}`}
            paddingX={indent}
            gap={1}
          >
            {s.type === "chat" ? (
              <Text color={sel ? SEL_COLOR : "magenta"}>{ICON_CHAT}</Text>
            ) : (
              <Text color={sel ? "green" : "gray"}>{sel ? "›" : "·"}</Text>
            )}
            <Box flexGrow={1} flexShrink={1} minWidth={0}>
              <Text
                color={sel ? SEL_COLOR : "white"}
                bold={sel}
                wrap="truncate-end"
              >
                {s.label}
              </Text>
            </Box>
            <Box flexShrink={0} minWidth={9} justifyContent="flex-end">
              <Text dimColor>{s.ago}</Text>
            </Box>
          </Box>
        )
      })}

      <Box marginTop={1} paddingX={2}>
        <Hint
          pairs={[
            ["↑↓", "nav"],
            ["←→", "tab"],
            ["enter", "open"],
            ["space", "expand"],
            ["/", "search"],
            ["d", "delete"],
            ["r", "rename"],
            ["f", "finder"],
            ["C", "clean"],
            ["q", "quit"],
          ]}
        />
      </Box>
    </Box>
  )
}

mkdirSync(CHATS_DIR, { recursive: true })

if (process.argv[2] === "clean") {
  const { waitUntilExit } = render(<CleanApp />, { exitOnCtrlC: true })
  await waitUntilExit()
} else {
  while (true) {
    process.stdout.write("\x1b[?1049h\x1b[2J\x1b[H\x1b[?25l")
    pendingAction = null

    const { waitUntilExit } = render(<App />, { exitOnCtrlC: true })
    await waitUntilExit()

    process.stdout.write("\x1b[2J\x1b[H\x1b[?1049l\x1b[2J\x1b[H\x1b[?25h")

    if (!pendingAction) break

    const { type, dir, sessionId } = pendingAction
    mkdirSync(dir, { recursive: true })
    process.chdir(dir)
    const args =
      type === "resume" && sessionId
        ? ["--resume", sessionId]
        : type === "open"
          ? ["--continue"]
          : []
    spawnSync("claude", args, { stdio: "inherit" })
  }
}
