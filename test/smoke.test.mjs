import { test } from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const bin = fileURLToPath(new URL("../dist/index.js", import.meta.url))

// The CLI has no --help; an unknown flag is the cheapest non-interactive path
// that still requires the bundle and all its imports to load.
test("built CLI loads and rejects unknown options", () => {
  const result = spawnSync(process.execPath, [bin, "--bogus"], {
    encoding: "utf8",
  })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /Unknown option: --bogus/)
})
