#!/usr/bin/env node
// Static imports hoist above any statement, so the app loads dynamically to
// make React pick its production build.
process.env.NODE_ENV ??= "production"
await import("./app.js")
export {}
