#!/usr/bin/env node
import React, { useState, useEffect, useMemo } from "react"
import { render, Box, Text, useInput, useApp, useStdout } from "ink"
import TextInput from "ink-text-input"
import { readdir, stat } from "fs/promises"
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "fs"
import { join } from "path"
import { spawnSync, execSync } from "child_process"
import { homedir } from "os"
import { randomUUID } from "crypto"

const HOME = homedir()
const CLAUDE_PROJECTS = join(HOME, ".claude", "projects")
const CLAUDE_JSON = join(HOME, ".claude.json")
const CLAUDE_SESSIONS_DIR = join(HOME, ".claude-sessions")
const CHATS_DIR = join(CLAUDE_SESSIONS_DIR, "chats")
const SESSION_LABELS_FILE = join(CLAUDE_SESSIONS_DIR, "session-labels.json")
const SESSION_PINS_FILE = join(CLAUDE_SESSIONS_DIR, "session-pins.json")
const SESSION_TAGS_FILE = join(CLAUDE_SESSIONS_DIR, "session-tags.json")

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
  hasClaudeMd?: boolean
  pinned?: boolean
  tag?: string
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
  | { kind: "tag-header"; label: string; expanded: boolean; count: number }

type CleanItem = {
  label: string
  reason: string
  execute: () => void
}

let pendingAction: {
  type: string
  dir: string
  sessionId?: string
  name?: string
} | null = null
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

const saveSessionLabel = (key: string, label: string) => {
  const labels = loadSessionLabels()
  labels[key] = label
  writeFileSync(SESSION_LABELS_FILE, JSON.stringify(labels, null, 2))
}

const removeSessionLabel = (key: string) => {
  const labels = loadSessionLabels()
  if (!(key in labels)) return
  delete labels[key]
  writeFileSync(SESSION_LABELS_FILE, JSON.stringify(labels, null, 2))
}

const loadSessionPins = (): Set<string> => {
  try {
    return new Set(JSON.parse(readFileSync(SESSION_PINS_FILE, "utf8")))
  } catch {
    return new Set()
  }
}

const toggleSessionPin = (dir: string) => {
  const pins = loadSessionPins()
  if (pins.has(dir)) pins.delete(dir)
  else pins.add(dir)
  writeFileSync(SESSION_PINS_FILE, JSON.stringify([...pins], null, 2))
}

const loadSessionTags = (): Record<string, string> => {
  try {
    return JSON.parse(readFileSync(SESSION_TAGS_FILE, "utf8"))
  } catch {
    return {}
  }
}

const saveSessionTag = (dir: string, tag: string) => {
  const tags = loadSessionTags()
  if (tag.trim()) tags[dir] = tag.trim()
  else delete tags[dir]
  writeFileSync(SESSION_TAGS_FILE, JSON.stringify(tags, null, 2))
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
                  const firstPrompt =
                    type === "code" ? readFirstPrompt(jsonlPath) : ""
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
                    hasClaudeMd:
                      type === "chat" && existsSync(join(cwd, "CLAUDE.md")),
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
            hasClaudeMd: existsSync(join(fullPath, "CLAUDE.md")),
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

  const pins = loadSessionPins()
  const tagOverrides = loadSessionTags()
  for (const s of sessions) {
    if (s.type === "chat") {
      s.pinned = pins.has(s.dir)
      s.tag = tagOverrides[s.dir]
    }
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
      removeSessionLabel(session.dir)
    } catch {}
  }
}

const buildDisplayItems = (
  tab: Tab,
  sessions: Session[],
  search: string,
  expandedProjects: Set<string>,
  expandedTags: Set<string>,
): DisplayItem[] => {
  const match = (s: Session) =>
    !search ||
    s.label.toLowerCase().includes(search.toLowerCase()) ||
    s.path.toLowerCase().includes(search.toLowerCase())

  if (tab === "chat") {
    const filtered = sessions.filter((s) => s.type === "chat").filter(match)
    const pinned = filtered.filter((s) => s.pinned)
    const tagged = filtered.filter((s) => !s.pinned && s.tag)
    const untagged = filtered.filter((s) => !s.pinned && !s.tag)

    const items: DisplayItem[] = [{ kind: "new" }]

    for (const s of pinned) items.push({ kind: "session", session: s })

    const tagGroups = new Map<string, Session[]>()
    for (const s of tagged) {
      if (!tagGroups.has(s.tag!)) tagGroups.set(s.tag!, [])
      tagGroups.get(s.tag!)!.push(s)
    }
    for (const [tag, group] of tagGroups) {
      const expanded = expandedTags.has(tag)
      items.push({
        kind: "tag-header",
        label: tag,
        expanded,
        count: group.length,
      })
      if (expanded)
        for (const s of group) items.push({ kind: "session", session: s })
    }

    for (const s of untagged) items.push({ kind: "session", session: s })

    return items
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

const contextHints = (item: DisplayItem | undefined): [string, string][] => {
  const nav: [string, string][] = [
    ["↑↓", "nav"],
    ["←→", "tab"],
  ]
  if (item?.kind === "new")
    return [...nav, ["enter", "new chat"], ["/", "search"], ["q", "quit"]]
  if (item?.kind === "header")
    return [
      ...nav,
      ["enter", "open"],
      ["space", item.expanded ? "collapse" : "expand"],
      ["d", "delete all"],
      ["q", "quit"],
    ]
  if (item?.kind === "tag-header")
    return [
      ...nav,
      ["space", item.expanded ? "collapse" : "expand"],
      ["q", "quit"],
    ]
  if (item?.kind === "session") {
    const s = item.session
    const pairs: [string, string][] = [
      ...nav,
      ["enter", "open"],
      ["d", "delete"],
    ]
    if (s.type === "chat") {
      pairs.push(["p", s.pinned ? "unpin" : "pin"])
      pairs.push(["t", "tag"])
    } else if (s.sessionId) {
      pairs.push(["r", "rename"])
    }
    if (s.hasClaudeMd) pairs.push(["m", "md"])
    pairs.push(["q", "quit"])
    return pairs
  }
  return [...nav, ["/", "search"], ["q", "quit"]]
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
  const [loadingIndex, setLoadingIndex] = useState(0)
  const [tab, setTab] = useState<Tab>(savedState.tab)
  const [cursor, setCursor] = useState(savedState.cursor)
  const [mode, setMode] = useState<
    | "list"
    | "search"
    | "new"
    | "rename"
    | "tag"
    | "confirm-delete"
    | "confirm-delete-all"
    | "clean-confirm"
    | "preview-claude-md"
  >("list")
  const [newName, setNewName] = useState("")
  const [renameValue, setRenameValue] = useState("")
  const [search, setSearch] = useState("")
  const [cleanItems, setCleanItems] = useState<CleanItem[] | null>(null)
  const [deleteAllTarget, setDeleteAllTarget] = useState<{
    dir: string
    label: string
    sessions: Session[]
  } | null>(null)
  const [previewContent, setPreviewContent] = useState<string[]>([])
  const [previewScroll, setPreviewScroll] = useState(0)
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(
    new Set(),
  )
  const [expandedTags, setExpandedTags] = useState<Set<string>>(new Set())
  const [tagValue, setTagValue] = useState("")
  const [scrollOffset, setScrollOffset] = useState(0)

  const LOADING_MESSAGES = [
    "Summoning your sessions…",
    "Reading the scrolls…",
    "Warming up the neurons…",
    "Herding your sessions…",
    "Consulting the oracle…",
    "Charging up…",
    "Loading memories…",
    "Almost there…",
  ]

  useEffect(() => {
    loadSessions().then(setSessions)
  }, [])

  useEffect(() => {
    if (sessions) return
    const id = setInterval(
      () => setLoadingIndex((i) => (i + 1) % LOADING_MESSAGES.length),
      600,
    )
    return () => clearInterval(id)
  }, [sessions])

  const CHROME_ROWS = 10
  const listHeight = Math.max(1, (stdout.rows ?? 24) - CHROME_ROWS)

  const displayItems = useMemo(
    () =>
      sessions
        ? buildDisplayItems(
            tab,
            sessions,
            search,
            expandedProjects,
            expandedTags,
          )
        : [],
    [sessions, tab, search, expandedProjects, expandedTags],
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

  const toggleExpandTag = (tag: string) =>
    setExpandedTags((prev) => {
      if (prev.has(tag)) {
        const n = new Set(prev)
        n.delete(tag)
        return n
      }
      return new Set([...prev, tag])
    })

  const cycleTab = (dir: 1 | -1) => {
    const next = TABS[(TABS.indexOf(tab) + dir + TABS.length) % TABS.length]!
    setTab(next)
    setSearch("")
  }

  const doOpen = (session: Session) => {
    savedState = { tab, cursor }
    const isChat = session.type === "chat"
    pendingAction = {
      type: isChat
        ? session.claudeProjectDir
          ? "open"
          : "new"
        : session.sessionId
          ? "resume"
          : session.claudeProjectDir
            ? "open"
            : "new",
      dir: session.dir,
      sessionId: !isChat ? session.sessionId : undefined,
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
        if (item?.kind === "header") toggleExpand(item.dir)
        if (item?.kind === "tag-header") toggleExpandTag(item.label)
      }
      if (input === "d") {
        const item = displayItems[cursor]
        if (item?.kind === "session") setMode("confirm-delete")
        if (item?.kind === "header") {
          const groupSessions = sessions!.filter((s) => s.dir === item.dir)
          setDeleteAllTarget({
            dir: item.dir,
            label: item.label,
            sessions: groupSessions,
          })
          setMode("confirm-delete-all")
        }
      }
      if (input === "r") {
        const item = displayItems[cursor]
        if (
          item?.kind === "session" &&
          (item.session.type === "chat" || item.session.sessionId)
        ) {
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
      if (input === "m") {
        const item = displayItems[cursor]
        if (item?.kind === "session" && item.session.hasClaudeMd) {
          try {
            const content = readFileSync(
              join(item.session.dir, "CLAUDE.md"),
              "utf8",
            )
            setPreviewContent(content.split("\n"))
            setPreviewScroll(0)
            setMode("preview-claude-md")
          } catch {}
        }
      }
      if (input === "p") {
        const item = displayItems[cursor]
        if (item?.kind === "session" && item.session.type === "chat") {
          toggleSessionPin(item.session.dir)
          setSessions((prev) =>
            prev
              ? prev.map((s) =>
                  s.dir === item.session.dir ? { ...s, pinned: !s.pinned } : s,
                )
              : prev,
          )
        }
      }
      if (input === "t") {
        const item = displayItems[cursor]
        if (item?.kind === "session" && item.session.type === "chat") {
          setTagValue(item.session.tag ?? "")
          setMode("tag")
        }
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
    (input, key) => {
      if (input === "y" && deleteAllTarget) {
        const claudeProjectDir = deleteAllTarget.sessions[0]?.claudeProjectDir
        for (const s of deleteAllTarget.sessions) deleteSession(s)
        if (claudeProjectDir && existsSync(claudeProjectDir))
          try {
            execSync(`trash "${claudeProjectDir}"`)
          } catch {}
        removeFromClaudeJson(deleteAllTarget.dir)
        removeSessionLabel(deleteAllTarget.dir)
        setSessions((s) => s!.filter((x) => x.dir !== deleteAllTarget.dir))
        setCursor((c) => Math.max(0, c - 1))
        setDeleteAllTarget(null)
        setMode("list")
      }
      if (input === "n" || key.escape) {
        setDeleteAllTarget(null)
        setMode("list")
      }
    },
    { isActive: mode === "confirm-delete-all" },
  )

  useInput(
    (_, key) => {
      if (key.escape) setMode("list")
    },
    { isActive: mode === "new" || mode === "rename" || mode === "tag" },
  )

  useInput(
    (_, key) => {
      if (key.upArrow) setPreviewScroll((s) => Math.max(0, s - 1))
      if (key.downArrow)
        setPreviewScroll((s) =>
          Math.min(Math.max(0, previewContent.length - listHeight), s + 1),
        )
      if (key.escape) setMode("list")
    },
    { isActive: mode === "preview-claude-md" },
  )

  const isSearching = mode === "search"
  const visibleItems =
    mode === "list" || mode === "search"
      ? displayItems.slice(scrollOffset, scrollOffset + listHeight)
      : []

  const renderContent = () => {
    if (!sessions)
      return (
        <Box paddingX={2} gap={1}>
          <Text color={SEL_COLOR}>✻</Text>
          <Text dimColor>{LOADING_MESSAGES[loadingIndex]}</Text>
        </Box>
      )

    if (mode === "new")
      return (
        <Box flexDirection="column" paddingX={2}>
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
                const dir = join(CHATS_DIR, randomUUID())
                saveSessionLabel(dir, val.trim())
                savedState = { tab, cursor }
                pendingAction = { type: "new", dir, name: val.trim() }
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
        <Box flexDirection="column" paddingX={2}>
          <Text bold>Rename</Text>
          {session && <Text dimColor>{session.path}</Text>}
          <Box marginTop={1} gap={1}>
            <Text color="cyan">›</Text>
            <TextInput
              value={renameValue}
              onChange={setRenameValue}
              onSubmit={(val) => {
                if (!val.trim() || !session) {
                  setMode("list")
                  return
                }
                const key =
                  session.type === "chat" ? session.dir : session.sessionId
                if (!key) {
                  setMode("list")
                  return
                }
                saveSessionLabel(key, val.trim())
                setSessions((prev) =>
                  prev
                    ? prev.map((s) =>
                        (
                          session.type === "chat"
                            ? s.dir === session.dir
                            : s.sessionId === session.sessionId
                        )
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

    if (mode === "tag") {
      const item = displayItems[cursor]
      const session = item?.kind === "session" ? item.session : null
      return (
        <Box flexDirection="column" paddingX={2}>
          <Text bold>Tag</Text>
          {session && <Text dimColor>{session.label}</Text>}
          <Box marginTop={1} gap={1}>
            <Text color="cyan">›</Text>
            <TextInput
              value={tagValue}
              onChange={setTagValue}
              onSubmit={(val) => {
                if (!session) {
                  setMode("list")
                  return
                }
                saveSessionTag(session.dir, val)
                setSessions((prev) =>
                  prev
                    ? prev.map((s) =>
                        s.dir === session.dir
                          ? { ...s, tag: val.trim() || undefined }
                          : s,
                      )
                    : prev,
                )
                setMode("list")
              }}
            />
          </Box>
          <Box marginTop={1}>
            <Text dimColor>
              enter to save · empty to remove · esc to cancel
            </Text>
          </Box>
        </Box>
      )
    }

    if (mode === "confirm-delete") {
      const item = displayItems[cursor]
      const session = item?.kind === "session" ? item.session : null
      return (
        <Box flexDirection="column" paddingX={2}>
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

    if (mode === "confirm-delete-all" && deleteAllTarget)
      return (
        <Box flexDirection="column" paddingX={2}>
          <Text>
            Delete all{" "}
            <Text color="red" bold>
              {deleteAllTarget.sessions.length}
            </Text>{" "}
            sessions for{" "}
            <Text color="red" bold>
              {deleteAllTarget.label}
            </Text>
            ?
          </Text>
          {deleteAllTarget.sessions[0]?.sessionId && (
            <Text dimColor>
              session history only — project folder is untouched
            </Text>
          )}
          <Box flexDirection="column" marginTop={1}>
            {deleteAllTarget.sessions.map((s) => (
              <Box key={s.sessionId ?? s.label} gap={1}>
                <Text color="gray">·</Text>
                <Box flexGrow={1} flexShrink={1} minWidth={0}>
                  <Text dimColor wrap="truncate-end">
                    {s.label}
                  </Text>
                </Box>
                <Box flexShrink={0} minWidth={9} justifyContent="flex-end">
                  <Text dimColor>{s.ago}</Text>
                </Box>
              </Box>
            ))}
          </Box>
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

    if (mode === "preview-claude-md") {
      const visibleLines = previewContent.slice(
        previewScroll,
        previewScroll + listHeight,
      )
      return (
        <Box flexDirection="column" paddingX={2}>
          <Text bold>CLAUDE.md</Text>
          <Box flexDirection="column" marginTop={1}>
            {visibleLines.map((line, i) => (
              <Text key={previewScroll + i} wrap="truncate-end">
                {line || " "}
              </Text>
            ))}
          </Box>
          <Box marginTop={1}>
            <Hint
              pairs={[
                ["↑↓", "scroll"],
                ["esc", "close"],
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

    return (
      <>
        {tab === "schedule" && displayItems.length === 0 && (
          <Box paddingX={2} gap={1}>
            <Text color="blue">i</Text>
            <Text>no scheduled tasks yet</Text>
          </Box>
        )}
        {visibleItems.map((item, vi) => {
          const i = scrollOffset + vi
          const sel = i === cursor
          if (item.kind === "new") {
            return (
              <Box key="new" flexDirection="column">
                <Box paddingX={2} gap={1}>
                  <Text color={sel ? "green" : "gray"}>{sel ? "›" : " "}</Text>
                  <Text color={sel ? SEL_COLOR : "white"} bold={sel}>
                    + New chat
                  </Text>
                </Box>
                <Text> </Text>
              </Box>
            )
          }
          if (item.kind === "header") {
            return (
              <Box key={`h-${item.dir}`} paddingLeft={2} gap={1}>
                <Text color={sel ? "green" : "gray"}>{sel ? "›" : " "}</Text>
                <Text color="gray">{item.expanded ? "-" : "+"}</Text>
                <Text color={sel ? SEL_COLOR : "green"}>{ICON_CODE}</Text>
                <Box flexGrow={1} flexShrink={1} minWidth={0}>
                  <Text
                    color={sel ? SEL_COLOR : "white"}
                    bold
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
          if (item.kind === "tag-header") {
            return (
              <Box key={`tag-${item.label}`} paddingLeft={2} gap={1}>
                <Text color={sel ? "green" : "gray"}>{sel ? "›" : " "}</Text>
                <Text color="gray">{item.expanded ? "-" : "+"}</Text>
                <Text color={sel ? SEL_COLOR : "blue"}>#</Text>
                <Box flexGrow={1} flexShrink={1} minWidth={0}>
                  <Text
                    color={sel ? SEL_COLOR : "white"}
                    bold
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
              </Box>
            )
          }
          const s = item.session
          const indent = tab === "code" ? 6 : !s.pinned && s.tag ? 4 : 2
          return (
            <Box
              key={`${s.dir}-${s.sessionId ?? s.label}`}
              paddingLeft={indent}
              gap={1}
            >
              {s.type === "chat" ? (
                <>
                  <Text color={sel ? "green" : "gray"}>{sel ? "›" : " "}</Text>
                  <Text color={sel ? SEL_COLOR : "magenta"}>{ICON_CHAT}</Text>
                </>
              ) : (
                <Text color={sel ? "green" : "gray"}>{sel ? "›" : "·"}</Text>
              )}
              <Box flexGrow={1} flexShrink={1} minWidth={0}>
                <Text
                  color={sel ? SEL_COLOR : "white"}
                  bold={s.type === "chat"}
                  wrap="truncate-end"
                >
                  {s.label}
                </Text>
              </Box>
              {s.pinned && (
                <Box flexShrink={0} marginRight={1}>
                  <Text color={sel ? "yellow" : "gray"} dimColor={!sel}>
                    ★
                  </Text>
                </Box>
              )}
              {s.hasClaudeMd && (
                <Box flexShrink={0} marginRight={1}>
                  <Text color={sel ? "cyan" : "gray"} dimColor={!sel}>
                    md
                  </Text>
                </Box>
              )}
              <Box flexShrink={0} minWidth={9} justifyContent="flex-end">
                <Text dimColor>{s.ago}</Text>
              </Box>
            </Box>
          )
        })}
        <Box marginTop={1} paddingX={2}>
          <Hint pairs={contextHints(displayItems[cursor])} />
        </Box>
      </>
    )
  }

  return (
    <Box flexDirection="column" paddingY={1} width={stdout.columns}>
      <Box paddingX={2} gap={1} marginBottom={1}>
        <Text color={SEL_COLOR}>✻</Text>
        <Text bold>Claude</Text>
      </Box>
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
      {renderContent()}
    </Box>
  )
}

mkdirSync(CHATS_DIR, { recursive: true })

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

const runBanner = async () => {
  const cols = process.stdout.columns ?? 80

  const O = "\x1b[38;5;208m"
  const G = "\x1b[90m"
  const D = "\x1b[2m"
  const R = "\x1b[0m"

  const c = (text: string, vis: number) => {
    const pad = Math.max(0, Math.floor((cols - vis) / 2))
    return " ".repeat(pad) + text
  }

  const frames: Array<[string[], number]> = [
    [["", "", c(`${D}${O}✻${R}`, 1), "", ""], 80],
    [
      [
        "",
        c(`${G}· · ·${R}`, 5),
        c(`${G}· ✻ ·${R}`, 5),
        c(`${G}· · ·${R}`, 5),
        "",
      ],
      80,
    ],
    [
      [
        "",
        c(`${G}✦ · ✦${R}`, 5),
        c(`${G}· ${O}✻${G} ·${R}`, 5),
        c(`${G}✦ · ✦${R}`, 5),
        "",
      ],
      80,
    ],
    [
      [
        "",
        c(`${G}· ${O}✦${G} ·${R}`, 5),
        c(`${O}✦ · ✻ · ✦${R}`, 9),
        c(`${G}· ${O}✦${G} ·${R}`, 5),
        "",
        c(`${D}claude sessions${R}`, 15),
      ],
      100,
    ],
    [
      [
        "",
        c(`${G}· ${O}✦${G} ·${R}`, 5),
        c(`${O}✦ · ✻ · ✦${R}`, 9),
        c(`${G}· ${O}✦${G} ·${R}`, 5),
        "",
        c(`${O}claude sessions${R}`, 15),
      ],
      160,
    ],
  ]

  for (const [lines, ms] of frames) {
    process.stdout.write("\x1b[H\x1b[J" + lines.join("\n"))
    await sleep(ms)
  }

  process.stdout.write("\x1b[H\x1b[J")
}

if (process.argv[2] === "clean") {
  const { waitUntilExit } = render(<CleanApp />, { exitOnCtrlC: true })
  await waitUntilExit()
} else {
  let firstLaunch = true
  while (true) {
    process.stdout.write("\x1b[?1049h\x1b[2J\x1b[H\x1b[?25l")
    pendingAction = null

    if (firstLaunch && !process.argv.includes("--no-banner")) {
      await runBanner()
      firstLaunch = false
    }

    const { waitUntilExit } = render(<App />, { exitOnCtrlC: true })
    await waitUntilExit()

    process.stdout.write("\x1b[2J\x1b[H\x1b[?1049l\x1b[2J\x1b[H\x1b[?25h")

    if (!pendingAction) break

    const { type, dir, sessionId, name } = pendingAction
    mkdirSync(dir, { recursive: true })
    if (type === "new" && name) {
      const claudeMdPath = join(dir, "CLAUDE.md")
      if (!existsSync(claudeMdPath)) writeFileSync(claudeMdPath, `# ${name}\n`)
    }
    process.chdir(dir)
    const args =
      type === "resume" && sessionId
        ? ["--resume", sessionId]
        : type === "open"
          ? ["--continue"]
          : name
            ? ["--name", name]
            : []
    spawnSync("claude", args, { stdio: "inherit" })

    if (type === "new") {
      const claudeProjectDir = join(CLAUDE_PROJECTS, toProjectDirName(dir))
      const hasConversation =
        existsSync(claudeProjectDir) &&
        readdirSync(claudeProjectDir)
          .filter((f) => f.endsWith(".jsonl"))
          .some((f) => readFirstPrompt(join(claudeProjectDir, f)) !== "")
      if (!hasConversation) {
        try {
          execSync(`trash "${dir}"`)
        } catch {}
        removeSessionLabel(dir)
      }
    }
  }
}
