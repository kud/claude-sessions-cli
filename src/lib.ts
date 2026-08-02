export type Tab = "code" | "chat" | "schedule"
export type CodeFilter = "all" | "named"

export type Session = {
  dir: string
  label: string
  title?: string
  prompt?: string
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

export type DisplayItem =
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

export const slugify = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")

export const humanLabel = (dir: string) => {
  const base = dir.split("/").pop() || dir
  const words = base
    .replace(/^[._-]+/, "")
    .replace(/[-_]+/g, " ")
    .trim()
  return (words || base).replace(/\b\w/g, (c) => c.toUpperCase())
}

export const kebabLabel = (dir: string) => dir.split("/").pop() || dir

export const windowed = <T>(
  arr: T[],
  cursor: number,
  height: number,
): { start: number; items: T[] } => {
  const start = Math.max(
    0,
    Math.min(cursor - Math.floor(height / 2), Math.max(0, arr.length - height)),
  )
  return { start, items: arr.slice(start, start + height) }
}

export const timeAgo = (mtime: number) => {
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

export const toProjectDirName = (absPath: string) =>
  absPath.replace(/[^a-zA-Z0-9]/g, "-")

export const normaliseSessionText = (value: string) =>
  value
    .trim()
    .replace(/^#+\s+/, "")
    .replace(/^[-*+]\s+(?:\[[ xX]\]\s*)?/, "")
    .replace(/[*_`]+/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 200)

/**
 * Parses raw `.jsonl` transcript content and returns the first genuine
 * user prompt (skipping tool-result payloads and slash-command bodies).
 * Only scans the first 200 non-blank lines, matching the CLI's own budget.
 */
export const parseFirstPromptFromJsonl = (content: string): string => {
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
        return normaliseSessionText(obj.message.content)
      }
    } catch {}
  }
  return ""
}

/**
 * Parses raw `.jsonl` transcript content and returns the most recent
 * `custom-title` entry, if any.
 */
export const parseSessionTitleFromJsonl = (content: string): string => {
  const lines = content.split("\n")
  let title = ""
  for (const line of lines) {
    if (!line.trim()) continue
    try {
      const obj = JSON.parse(line)
      if (obj.type !== "custom-title") continue
      const value = obj.customTitle ?? obj.sessionTitle ?? obj.title ?? obj.name
      if (typeof value === "string" && value.trim()) {
        title = normaliseSessionText(value)
      }
    } catch {}
  }
  return title
}

export const buildSessionLabel = (
  sessionTitle: string,
  firstPrompt: string,
  fallback: string,
) => {
  if (sessionTitle && firstPrompt && sessionTitle !== firstPrompt) {
    return `${sessionTitle} — ${firstPrompt}`
  }
  return sessionTitle || firstPrompt || fallback
}

/**
 * Counts transcript lines and estimates how many still contain an
 * embedded reference to `fromDir` beyond the line's own `cwd` field —
 * these won't be rewritten by a session move.
 */
export const analyzeSessionMoveContent = (
  content: string,
  fromDir: string,
): { lineCount: number; embeddedRefs: number } => {
  const lines = content.split("\n").filter((l) => l.trim())
  let embeddedRefs = 0
  for (const line of lines) {
    const occurrences = line.split(fromDir).length - 1
    let cwd: unknown
    try {
      cwd = JSON.parse(line).cwd
    } catch {}
    embeddedRefs += Math.max(0, occurrences - (cwd === fromDir ? 1 : 0))
  }
  return { lineCount: lines.length, embeddedRefs }
}

/**
 * Rewrites every JSONL line's `cwd` field from `fromDir` to `toDir`,
 * leaving malformed lines untouched.
 */
export const rewriteSessionCwd = (
  content: string,
  fromDir: string,
  toDir: string,
): string =>
  content
    .split("\n")
    .map((line) => {
      if (!line.trim()) return line
      try {
        const obj = JSON.parse(line)
        if (obj.cwd === fromDir) obj.cwd = toDir
        return JSON.stringify(obj)
      } catch {
        return line
      }
    })
    .join("\n")

export const buildDisplayItems = (
  tab: Tab,
  sessions: Session[],
  search: string,
  expandedProjects: Set<string>,
  expandedTags: Set<string>,
  codeFilter: CodeFilter = "all",
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

  const filtered = sessions
    .filter((s) => s.type === "code")
    .filter(match)
    .filter((s) => codeFilter === "all" || Boolean(s.title))
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

export const contextHints = (
  item: DisplayItem | undefined,
): [string, string][] => {
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
      pairs.push(["M", "move"])
    }
    if (s.hasClaudeMd) pairs.push(["m", "md"])
    pairs.push(["q", "quit"])
    return pairs
  }
  return [...nav, ["/", "search"], ["q", "quit"]]
}
