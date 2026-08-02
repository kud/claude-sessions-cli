import { describe, it, expect, vi, afterEach } from "vitest"
import {
  slugify,
  humanLabel,
  kebabLabel,
  windowed,
  timeAgo,
  toProjectDirName,
  normaliseSessionText,
  parseFirstPromptFromJsonl,
  parseSessionTitleFromJsonl,
  buildSessionLabel,
  analyzeSessionMoveContent,
  rewriteSessionCwd,
  buildDisplayItems,
  contextHints,
  type Session,
} from "./lib.js"

const makeSession = (overrides: Partial<Session> = {}): Session => ({
  dir: "/Users/hal/Projects/todo-app",
  label: "todo-app",
  path: "~/Projects/todo-app",
  type: "code",
  mtime: 1000,
  ago: "1h",
  claudeProjectDir: "/Users/hal/.claude/projects/-Users-hal-Projects-todo-app",
  ...overrides,
})

describe("slugify", () => {
  it("lowercases and hyphenates a normal string", () => {
    expect(slugify("My Cool Project")).toBe("my-cool-project")
  })

  it("strips accents via NFD normalisation", () => {
    expect(slugify("Café Résumé")).toBe("cafe-resume")
  })

  it("collapses runs of non-alphanumeric characters", () => {
    expect(slugify("foo___bar!!!baz")).toBe("foo-bar-baz")
  })

  it("trims leading and trailing hyphens", () => {
    expect(slugify("  --hello world--  ")).toBe("hello-world")
  })

  it("returns an empty string for input with no alphanumerics", () => {
    expect(slugify("***")).toBe("")
  })
})

describe("humanLabel", () => {
  it("title-cases a kebab-case directory name", () => {
    expect(humanLabel("/Users/hal/Projects/todo-app")).toBe("Todo App")
  })

  it("title-cases a snake_case directory name", () => {
    expect(humanLabel("/Users/hal/Projects/robot_butler")).toBe("Robot Butler")
  })

  it("strips leading dots and dashes", () => {
    expect(humanLabel("/Users/hal/Projects/.hidden-dir")).toBe("Hidden Dir")
  })

  it("falls back to the raw base name when nothing but symbols remain", () => {
    expect(humanLabel("/Users/hal/Projects/---")).toBe("---")
  })

  it("falls back to the whole string when there is no slash", () => {
    expect(humanLabel("no-slash-here")).toBe("No Slash Here")
  })
})

describe("kebabLabel", () => {
  it("returns the final path segment", () => {
    expect(kebabLabel("/Users/hal/Projects/todo-app")).toBe("todo-app")
  })

  it("returns the input unchanged when there is no slash", () => {
    expect(kebabLabel("todo-app")).toBe("todo-app")
  })
})

describe("windowed", () => {
  it("centres the cursor within the window when there is room on both sides", () => {
    const arr = Array.from({ length: 20 }, (_, i) => i)
    const { start, items } = windowed(arr, 10, 5)
    expect(start).toBe(8)
    expect(items).toEqual([8, 9, 10, 11, 12])
  })

  it("clamps to the start of the array when the cursor is near the beginning", () => {
    const arr = Array.from({ length: 20 }, (_, i) => i)
    const { start, items } = windowed(arr, 0, 5)
    expect(start).toBe(0)
    expect(items).toEqual([0, 1, 2, 3, 4])
  })

  it("clamps to the end of the array when the cursor is near the end", () => {
    const arr = Array.from({ length: 20 }, (_, i) => i)
    const { start, items } = windowed(arr, 19, 5)
    expect(start).toBe(15)
    expect(items).toEqual([15, 16, 17, 18, 19])
  })

  it("returns the whole array when the window is larger than the array", () => {
    const arr = [1, 2, 3]
    const { start, items } = windowed(arr, 1, 10)
    expect(start).toBe(0)
    expect(items).toEqual([1, 2, 3])
  })
})

describe("timeAgo", () => {
  const NOW_SECONDS = 1_700_000_000

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const mockNow = () =>
    vi.spyOn(Date, "now").mockReturnValue(NOW_SECONDS * 1000)

  it("reports 'just now' for sub-minute durations", () => {
    mockNow()
    expect(timeAgo(NOW_SECONDS - 30)).toBe("just now")
  })

  it("reports minutes for sub-hour durations", () => {
    mockNow()
    expect(timeAgo(NOW_SECONDS - 5 * 60)).toBe("5m")
  })

  it("reports hours for sub-day durations", () => {
    mockNow()
    expect(timeAgo(NOW_SECONDS - 3 * 3600)).toBe("3h")
  })

  it("reports 'yesterday' for exactly one day ago", () => {
    mockNow()
    expect(timeAgo(NOW_SECONDS - 86400)).toBe("yesterday")
  })

  it("reports days for durations under a week", () => {
    mockNow()
    expect(timeAgo(NOW_SECONDS - 3 * 86400)).toBe("3d")
  })

  it("falls back to a date string beyond a week", () => {
    mockNow()
    expect(timeAgo(NOW_SECONDS - 30 * 86400)).toMatch(/^\d{2} \w{3}$/)
  })
})

describe("toProjectDirName", () => {
  it("replaces every non-alphanumeric character with a hyphen", () => {
    expect(toProjectDirName("/Users/hal/Projects/todo-app")).toBe(
      "-Users-hal-Projects-todo-app",
    )
  })
})

describe("normaliseSessionText", () => {
  it("strips markdown heading markers", () => {
    expect(normaliseSessionText("## Add dark mode")).toBe("Add dark mode")
  })

  it("strips list/task markers", () => {
    expect(normaliseSessionText("- [ ] fix the bug")).toBe("fix the bug")
  })

  it("strips emphasis characters", () => {
    expect(normaliseSessionText("**bold** and *italic* and `code`")).toBe(
      "bold and italic and code",
    )
  })

  it("collapses internal whitespace", () => {
    expect(normaliseSessionText("hello   \n\n  world")).toBe("hello world")
  })

  it("truncates to 200 characters", () => {
    const long = "a".repeat(500)
    expect(normaliseSessionText(long)).toHaveLength(200)
  })
})

describe("parseFirstPromptFromJsonl", () => {
  it("returns the first genuine user prompt", () => {
    const content = [
      JSON.stringify({ type: "system", message: { content: "ignored" } }),
      JSON.stringify({ type: "user", message: { content: "fix the bug" } }),
      JSON.stringify({ type: "user", message: { content: "second prompt" } }),
    ].join("\n")
    expect(parseFirstPromptFromJsonl(content)).toBe("fix the bug")
  })

  it("skips tool-result payloads embedded as user messages", () => {
    const content = [
      JSON.stringify({
        type: "user",
        message: { content: '{"tool_use_id":"abc"}' },
      }),
      JSON.stringify({ type: "user", message: { content: "real prompt" } }),
    ].join("\n")
    expect(parseFirstPromptFromJsonl(content)).toBe("real prompt")
  })

  it("skips slash-command bodies starting with '<'", () => {
    const content = [
      JSON.stringify({
        type: "user",
        message: { content: "<command-name>foo</command-name>" },
      }),
      JSON.stringify({ type: "user", message: { content: "actual prompt" } }),
    ].join("\n")
    expect(parseFirstPromptFromJsonl(content)).toBe("actual prompt")
  })

  it("returns an empty string for empty content", () => {
    expect(parseFirstPromptFromJsonl("")).toBe("")
  })

  it("tolerates malformed JSON lines without throwing", () => {
    const content = [
      "not json at all {{{",
      JSON.stringify({ type: "user", message: { content: "still works" } }),
    ].join("\n")
    expect(parseFirstPromptFromJsonl(content)).toBe("still works")
  })

  it("ignores blank lines", () => {
    const content = [
      "",
      "   ",
      JSON.stringify({ type: "user", message: { content: "the prompt" } }),
    ].join("\n")
    expect(parseFirstPromptFromJsonl(content)).toBe("the prompt")
  })

  it("gives up after 200 non-blank lines", () => {
    const filler = Array.from({ length: 200 }, () =>
      JSON.stringify({ type: "assistant", message: { content: "noise" } }),
    )
    const content = [
      ...filler,
      JSON.stringify({ type: "user", message: { content: "too late" } }),
    ].join("\n")
    expect(parseFirstPromptFromJsonl(content)).toBe("")
  })
})

describe("parseSessionTitleFromJsonl", () => {
  it("returns the custom title", () => {
    const content = JSON.stringify({
      type: "custom-title",
      customTitle: "My Session",
    })
    expect(parseSessionTitleFromJsonl(content)).toBe("My Session")
  })

  it("prefers the most recent custom-title entry", () => {
    const content = [
      JSON.stringify({ type: "custom-title", customTitle: "First" }),
      JSON.stringify({ type: "custom-title", customTitle: "Second" }),
    ].join("\n")
    expect(parseSessionTitleFromJsonl(content)).toBe("Second")
  })

  it("falls back through title-field aliases", () => {
    const content = JSON.stringify({ type: "custom-title", title: "Aliased" })
    expect(parseSessionTitleFromJsonl(content)).toBe("Aliased")
  })

  it("returns an empty string when there is no custom-title entry", () => {
    const content = JSON.stringify({ type: "user", message: { content: "hi" } })
    expect(parseSessionTitleFromJsonl(content)).toBe("")
  })

  it("tolerates malformed JSON lines without throwing", () => {
    const content = ["{{{not json", "still no title"].join("\n")
    expect(parseSessionTitleFromJsonl(content)).toBe("")
  })
})

describe("buildSessionLabel", () => {
  it("combines title and prompt when both exist and differ", () => {
    expect(buildSessionLabel("Title", "prompt text", "fallback")).toBe(
      "Title — prompt text",
    )
  })

  it("uses the title alone when title and prompt are identical", () => {
    expect(buildSessionLabel("same", "same", "fallback")).toBe("same")
  })

  it("falls back to the prompt when there is no title", () => {
    expect(buildSessionLabel("", "prompt text", "fallback")).toBe("prompt text")
  })

  it("falls back to the fallback when neither title nor prompt exist", () => {
    expect(buildSessionLabel("", "", "fallback")).toBe("fallback")
  })
})

describe("analyzeSessionMoveContent", () => {
  it("counts non-blank lines", () => {
    const content = ["{}", "", '{"cwd":"/a"}', "   "].join("\n")
    expect(analyzeSessionMoveContent(content, "/a").lineCount).toBe(2)
  })

  it("does not count the line's own cwd field as an embedded reference", () => {
    const content = JSON.stringify({ cwd: "/a/b" })
    expect(analyzeSessionMoveContent(content, "/a/b").embeddedRefs).toBe(0)
  })

  it("counts additional embedded occurrences beyond the cwd field", () => {
    const content = JSON.stringify({
      cwd: "/a/b",
      message: { content: "see /a/b/file.ts and /a/b/other.ts" },
    })
    expect(analyzeSessionMoveContent(content, "/a/b").embeddedRefs).toBe(2)
  })

  it("returns zero counts for empty content", () => {
    expect(analyzeSessionMoveContent("", "/a")).toEqual({
      lineCount: 0,
      embeddedRefs: 0,
    })
  })
})

describe("rewriteSessionCwd", () => {
  it("rewrites the cwd field on matching lines", () => {
    const content = JSON.stringify({ cwd: "/old", other: 1 })
    const result = rewriteSessionCwd(content, "/old", "/new")
    expect(JSON.parse(result)).toEqual({ cwd: "/new", other: 1 })
  })

  it("leaves lines with a different cwd untouched", () => {
    const content = JSON.stringify({ cwd: "/unrelated" })
    const result = rewriteSessionCwd(content, "/old", "/new")
    expect(JSON.parse(result)).toEqual({ cwd: "/unrelated" })
  })

  it("leaves malformed lines untouched instead of throwing", () => {
    const content = ["not json", JSON.stringify({ cwd: "/old" })].join("\n")
    const result = rewriteSessionCwd(content, "/old", "/new")
    const [first, second] = result.split("\n")
    expect(first).toBe("not json")
    expect(JSON.parse(second)).toEqual({ cwd: "/new" })
  })

  it("preserves blank lines", () => {
    const content = [JSON.stringify({ cwd: "/old" }), ""].join("\n")
    const result = rewriteSessionCwd(content, "/old", "/new")
    expect(result.endsWith("\n")).toBe(true)
  })
})

describe("buildDisplayItems", () => {
  it("groups code sessions by directory under a header, collapsed by default", () => {
    const sessions = [
      makeSession({ dir: "/a", sessionId: "1", projectLabel: "a" }),
      makeSession({ dir: "/a", sessionId: "2", projectLabel: "a" }),
      makeSession({ dir: "/b", sessionId: "3", projectLabel: "b" }),
    ]
    const items = buildDisplayItems("code", sessions, "", new Set(), new Set())
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({ kind: "header", dir: "/a", count: 2 })
    expect(items[1]).toMatchObject({ kind: "header", dir: "/b", count: 1 })
  })

  it("expands a header's sessions when its directory is in expandedProjects", () => {
    const sessions = [
      makeSession({ dir: "/a", sessionId: "1", projectLabel: "a" }),
      makeSession({ dir: "/a", sessionId: "2", projectLabel: "a" }),
    ]
    const items = buildDisplayItems(
      "code",
      sessions,
      "",
      new Set(["/a"]),
      new Set(),
    )
    expect(items.map((i) => i.kind)).toEqual(["header", "session", "session"])
  })

  it("filters code sessions to only named ones when codeFilter is 'named'", () => {
    const sessions = [
      makeSession({ dir: "/a", sessionId: "1", title: "has a title" }),
      makeSession({ dir: "/b", sessionId: "2" }),
    ]
    const items = buildDisplayItems(
      "code",
      sessions,
      "",
      new Set(),
      new Set(),
      "named",
    )
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ dir: "/a" })
  })

  it("applies a case-insensitive search filter across label and path", () => {
    const sessions = [
      makeSession({
        dir: "/a",
        sessionId: "1",
        label: "Todo App",
        path: "~/Projects/todo-app",
      }),
      makeSession({
        dir: "/b",
        sessionId: "2",
        label: "Robot Butler",
        path: "~/Projects/robot-butler",
      }),
    ]
    const items = buildDisplayItems(
      "code",
      sessions,
      "todo",
      new Set(),
      new Set(),
    )
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ dir: "/a" })
  })

  it("puts a 'new chat' entry first in the chat tab, then pinned, tagged, untagged", () => {
    const sessions = [
      makeSession({
        dir: "/c1",
        type: "chat",
        label: "untagged",
      }),
      makeSession({
        dir: "/c2",
        type: "chat",
        label: "tagged",
        tag: "work",
      }),
      makeSession({
        dir: "/c3",
        type: "chat",
        label: "pinned",
        pinned: true,
      }),
    ]
    const items = buildDisplayItems(
      "chat",
      sessions,
      "",
      new Set(),
      new Set(["work"]),
    )
    expect(items[0]).toEqual({ kind: "new" })
    expect(items[1]).toMatchObject({
      kind: "session",
      session: { label: "pinned" },
    })
    expect(items[2]).toMatchObject({ kind: "tag-header", label: "work" })
    expect(items[3]).toMatchObject({
      kind: "session",
      session: { label: "tagged" },
    })
    expect(items[4]).toMatchObject({
      kind: "session",
      session: { label: "untagged" },
    })
  })

  it("collapses a tag group's sessions when the tag is not expanded", () => {
    const sessions = [
      makeSession({ dir: "/c2", type: "chat", label: "tagged", tag: "work" }),
    ]
    const items = buildDisplayItems("chat", sessions, "", new Set(), new Set())
    expect(items).toEqual([
      { kind: "new" },
      { kind: "tag-header", label: "work", expanded: false, count: 1 },
    ])
  })

  it("returns an empty list for the schedule tab", () => {
    expect(
      buildDisplayItems("schedule", [makeSession()], "", new Set(), new Set()),
    ).toEqual([])
  })

  it("returns no sessions for an empty input list", () => {
    expect(buildDisplayItems("code", [], "", new Set(), new Set())).toEqual([])
  })
})

describe("contextHints", () => {
  it("offers 'new chat' and search hints for the 'new' item", () => {
    const hints = contextHints({ kind: "new" })
    expect(hints).toContainEqual(["enter", "new chat"])
    expect(hints).toContainEqual(["/", "search"])
  })

  it("offers expand/collapse and delete-all hints for a header item", () => {
    const hints = contextHints({
      kind: "header",
      label: "a",
      dir: "/a",
      expanded: false,
      count: 2,
      recentSession: makeSession(),
    })
    expect(hints).toContainEqual(["space", "expand"])
    expect(hints).toContainEqual(["d", "delete all"])
  })

  it("offers a 'collapse' hint when the header is already expanded", () => {
    const hints = contextHints({
      kind: "header",
      label: "a",
      dir: "/a",
      expanded: true,
      count: 2,
      recentSession: makeSession(),
    })
    expect(hints).toContainEqual(["space", "collapse"])
  })

  it("offers pin/tag hints for a chat session", () => {
    const hints = contextHints({
      kind: "session",
      session: makeSession({ type: "chat", pinned: false }),
    })
    expect(hints).toContainEqual(["p", "pin"])
    expect(hints).toContainEqual(["t", "tag"])
  })

  it("offers an 'unpin' hint for an already-pinned chat session", () => {
    const hints = contextHints({
      kind: "session",
      session: makeSession({ type: "chat", pinned: true }),
    })
    expect(hints).toContainEqual(["p", "unpin"])
  })

  it("offers rename/move hints for a code session with a sessionId", () => {
    const hints = contextHints({
      kind: "session",
      session: makeSession({ type: "code", sessionId: "abc" }),
    })
    expect(hints).toContainEqual(["r", "rename"])
    expect(hints).toContainEqual(["M", "move"])
  })

  it("offers a 'md' hint when the session has a CLAUDE.md", () => {
    const hints = contextHints({
      kind: "session",
      session: makeSession({ hasClaudeMd: true }),
    })
    expect(hints).toContainEqual(["m", "md"])
  })

  it("falls back to nav and search hints for an undefined item", () => {
    const hints = contextHints(undefined)
    expect(hints).toContainEqual(["/", "search"])
  })
})
