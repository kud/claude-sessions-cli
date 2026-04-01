import React, { useState, useEffect } from "react"
import { render, Box, Text, useInput, useApp } from "ink"
import TextInput from "ink-text-input"
import { readdir, stat } from "fs/promises"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"
import { spawnSync, execSync } from "child_process"
import { homedir } from "os"

const HOME = homedir()
const CLAUDE_PROJECTS = join(HOME, ".claude", "projects")
const CLAUDE_JSON = join(HOME, ".claude.json")
const CHATS_DIR = join(HOME, ".chats")

const ICON_CHAT = "󰭹"
const ICON_CODE = "\uf121"

type Filter = "all" | "chat" | "code"
type Session = {
  dir: string
  label: string
  path: string
  type: "chat" | "code"
  mtime: number
  ago: string
  claudeProjectDir: string
}
type CleanItem = {
  label: string
  reason: string
  execute: () => void
}

let pendingAction: { type: string; dir: string } | null = null

const slugify = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
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
            const mtime = Math.max(
              ...(await Promise.all(
                jsonlFiles.map((f: string) =>
                  stat(join(claudeProjectDir, f)).then((s) => s.mtimeMs / 1000),
                ),
              )),
            )
            const shortPath = cwd.replace(HOME, "~")
            const type =
              cwd === HOME || cwd.startsWith(CHATS_DIR) ? "chat" : "code"
            sessions.push({
              dir: cwd,
              label: type === "chat" ? humanLabel(cwd) : kebabLabel(cwd),
              path: shortPath,
              type,
              mtime,
              ago: timeAgo(mtime),
              claudeProjectDir,
            })
          } catch {}
        }),
      )
    } catch {}
  }

  const seen = new Set(sessions.map((s) => s.dir))
  if (existsSync(CHATS_DIR)) {
    try {
      for (const dir of await readdir(CHATS_DIR)) {
        try {
          const fullPath = join(CHATS_DIR, dir)
          if (!(await stat(fullPath)).isDirectory() || seen.has(fullPath))
            continue
          const shortPath = fullPath.replace(HOME, "~")
          sessions.push({
            dir: fullPath,
            label: humanLabel(fullPath),
            path: shortPath,
            type: "chat",
            mtime: 0,
            ago: "new",
            claudeProjectDir: "",
          })
        } catch {}
      }
    } catch {}
  }

  const unique = [...new Map(sessions.map((s) => [s.dir, s])).values()]
  return unique.sort((a, b) => b.mtime - a.mtime)
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

const deleteSession = (item: Session) => {
  if (item.claudeProjectDir) {
    try {
      execSync(`trash "${item.claudeProjectDir}"`)
    } catch {}
    removeFromClaudeJson(item.dir)
  }
  if (item.type === "chat" && item.dir !== HOME) {
    try {
      execSync(`trash "${item.dir}"`)
    } catch {}
  }
}

const SectionHeader = ({ label }: { label: string }) => {
  return (
    <Box paddingX={2} marginTop={1}>
      <Text dimColor>── {label} ────────────────────────</Text>
    </Box>
  )
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

const FilterBar = ({ filter }: { filter: Filter }) => {
  const opts: Filter[] = ["all", "chat", "code"]
  return (
    <Box gap={1}>
      {opts.map((o) => (
        <Text
          key={o}
          color={filter === o ? "cyan" : "gray"}
          bold={filter === o}
        >
          {filter === o ? `[${o}]` : o}
        </Text>
      ))}
    </Box>
  )
}

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
                <Text color={sel ? "cyan" : "gray"}>{sel ? "▶" : " "}</Text>
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
  const [sessions, setSessions] = useState<Session[] | null>(null)
  const [cursor, setCursor] = useState(0)
  const [mode, setMode] = useState("list")
  const [newName, setNewName] = useState("")
  const [filter, setFilter] = useState<Filter>("all")
  const [search, setSearch] = useState("")
  const [cleanItems, setCleanItems] = useState<CleanItem[] | null>(null)

  useEffect(() => {
    loadSessions().then(setSessions)
  }, [])

  const chatSessions = sessions?.filter((s) => s.type === "chat") ?? []
  const codeSessions = sessions?.filter((s) => s.type === "code") ?? []
  const grouped =
    filter === "chat"
      ? chatSessions
      : filter === "code"
        ? codeSessions
        : [...chatSessions, ...codeSessions]
  const filtered = search
    ? grouped.filter(
        (s) =>
          s.label.toLowerCase().includes(search.toLowerCase()) ||
          s.path.toLowerCase().includes(search.toLowerCase()),
      )
    : grouped
  const items: (null | Session)[] = sessions ? [null, ...filtered] : []

  const doExit = (action: { type: string; dir: string }) => {
    pendingAction = action
    exit()
  }
  const cycleFilter = () => {
    setFilter((f) => (f === "all" ? "chat" : f === "chat" ? "code" : "all"))
    setCursor(0)
  }

  useInput(
    (input, key) => {
      if (key.upArrow) setCursor((c) => Math.max(0, c - 1))
      if (key.downArrow) setCursor((c) => Math.min(items.length - 1, c + 1))
      if (key.tab) cycleFilter()
      if (input === "/") {
        setMode("search")
        setSearch("")
        setCursor(0)
      }
      if (key.return) {
        if (cursor === 0) {
          setMode("new")
          setNewName("")
        } else if (items[cursor]) {
          const s = items[cursor]!
          doExit({ type: s.claudeProjectDir ? "open" : "new", dir: s.dir })
        }
      }
      if (input === "d" && cursor > 0) setMode("confirm-delete")
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
      if (key.upArrow) setCursor((c) => Math.max(0, c - 1))
      if (key.downArrow) setCursor((c) => Math.min(items.length - 1, c + 1))
      if (key.return) {
        if (cursor === 0) {
          setSearch("")
          setMode("new")
          setNewName("")
        } else if (items[cursor]) {
          const s = items[cursor]!
          doExit({ type: s.claudeProjectDir ? "open" : "new", dir: s.dir })
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
        const item = items[cursor]!
        deleteSession(item)
        setSessions((s) => s!.filter((x) => x.dir !== item.dir))
        setCursor((c) => Math.min(c, items.length - 2))
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
    { isActive: mode === "new" },
  )

  if (!sessions) return <Text dimColor> loading…</Text>

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
              doExit({ type: "new", dir: join(CHATS_DIR, slugify(val.trim())) })
            }}
          />
        </Box>
        <Box marginTop={1}>
          <Hint pairs={[["esc", "cancel"]]} />
        </Box>
      </Box>
    )

  if (mode === "confirm-delete") {
    const item = items[cursor]!
    const toDelete = [
      ...(item.type === "chat" ? [item.dir] : []),
      ...(item.claudeProjectDir ? [item.claudeProjectDir] : []),
    ]
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Text>
          Remove{" "}
          <Text color="red" bold>
            {item.label}
          </Text>
          ?
        </Text>
        <Box flexDirection="column" marginTop={1}>
          {toDelete.map((p) => (
            <Text key={p} dimColor>
              {" "}
              {p.replace(HOME, "~")}
            </Text>
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

  return (
    <Box flexDirection="column" paddingY={1}>
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

      {items.map((item, i) => {
        const sel = i === cursor
        const prev = items[i - 1]
        const showChatHeader =
          !search &&
          filter === "all" &&
          item?.type === "chat" &&
          prev?.type !== "chat"
        const showCodeHeader =
          !search &&
          filter === "all" &&
          item?.type === "code" &&
          prev?.type !== "code"

        if (!item)
          return (
            <Box key="new" paddingX={2}>
              <Text color={sel ? "cyan" : "gray"}>{sel ? "▶ " : "  "}</Text>
              <Text color="white" bold={sel}>
                + New chat
              </Text>
            </Box>
          )

        return (
          <React.Fragment key={item.dir}>
            {showChatHeader && <SectionHeader label="chat" />}
            {showCodeHeader && <SectionHeader label="code" />}
            <Box paddingX={2} gap={2}>
              <Text color={sel ? "cyan" : "gray"}>{sel ? "▶" : " "}</Text>
              <Text
                color={item.type === "chat" ? "magenta" : "green"}
                bold={sel}
              >
                {item.type === "chat" ? ICON_CHAT : ICON_CODE}
              </Text>
              <Text color="white" bold={sel}>
                {item.label}
              </Text>
              <Text color="gray" bold={sel}>
                {item.path}
              </Text>
              <Text color="yellow" bold={sel} dimColor={!sel}>
                {item.ago}
              </Text>
              {item.dir === HOME && (
                <Text color="red" dimColor={!sel}>
                  ⚠ not recommended
                </Text>
              )}
            </Box>
          </React.Fragment>
        )
      })}

      <Box marginTop={1} paddingX={2} gap={3}>
        <Hint
          pairs={[
            ["↑↓", "nav"],
            ["enter", "open"],
            ["d", "remove"],
            ["/", "search"],
            ["tab", "filter"],
            ["C", "clean"],
            ["q", "quit"],
          ]}
        />
        <FilterBar filter={filter} />
      </Box>
    </Box>
  )
}

mkdirSync(CHATS_DIR, { recursive: true })

if (process.argv[2] === "clean") {
  const { waitUntilExit } = render(<CleanApp />, { exitOnCtrlC: true })
  await waitUntilExit()
} else {
  const { waitUntilExit } = render(<App />, { exitOnCtrlC: true })
  await waitUntilExit()

  if (pendingAction) {
    const { type, dir } = pendingAction
    mkdirSync(dir, { recursive: true })
    process.chdir(dir)
    spawnSync("claude", type === "open" ? ["--continue"] : [], {
      stdio: "inherit",
    })
  }
}
