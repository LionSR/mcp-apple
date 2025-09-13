# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands
- `bun run dev` - Start the development server (runs index.ts directly)
- `bun run build` - Build production bundle to dist/index.js with minification
- `bun run test` - Run test suite (test/test-mail.ts)

## Project Architecture

### Core Structure
This is an MCP (Model Context Protocol) server for Apple Mail integration using JXA (JavaScript for Automation). The architecture avoids string parsing by using JXA to return native JavaScript objects directly.

**Key Components:**
- `index.ts` - MCP server entry point that defines 9 mail tools and handles tool execution
- `lib/mail.ts` - JXA implementation layer that wraps Apple Mail automation with TypeScript interfaces
- Tool handlers in index.ts map MCP requests to mail.ts functions and format responses

### JXA Execution Pattern
The `runJXA()` function in lib/mail.ts:
1. Wraps JXA code in error handling and JSON serialization
2. Writes to temporary file to avoid command-line escaping issues
3. Executes via osascript with timeout protection (default 30s)
4. Returns parsed JavaScript objects, not strings

### MCP Tool Implementation
Each tool follows this pattern:
1. Define in MAIL_TOOLS array with name, description, and Zod-compatible input schema
2. Handle in CallToolRequestSchema switch statement
3. Call corresponding mailJXA function from lib/mail.ts
4. Format response with appropriate content type

## Code Style

### TypeScript Configuration
- Target: ESNext with bundler module resolution
- Strict mode enabled
- ESM modules with .js extensions for imports

### Naming Conventions
- PascalCase: types, interfaces, tool constant arrays (e.g., `MAIL_TOOLS`)
- camelCase: variables, functions
- Tool names: snake_case with `mail_` prefix (e.g., `mail_get_accounts`)

### Error Handling
- JXA execution wrapped in try/catch with JSON error serialization
- Tool handlers return isError: true with error message in content
- Timeout protection on all JXA operations (configurable, default 30s)

## Mail-Specific Implementation Details

### Available Tools
- `mail_get_accounts` - List all email accounts
- `mail_get_mailboxes` - Get mailbox hierarchy for an account
- `mail_get_unread` - Retrieve unread emails
- `mail_search` - Search emails by text
- `mail_get_latest` - Get recent emails from specific account
- `mail_send` - Send email from specific account
- `mail_mark_read` - Mark emails as read by ID
- `mail_delete` - Delete emails by ID
- `mail_move` - Move emails between mailboxes

### JXA Best Practices
- Return JavaScript objects directly, never parse AppleScript strings
- Use timeout protection via Promise.race pattern
- Handle mailbox hierarchy with parent-child relationships
- Limit search results to prevent performance issues (default 20)
- Format dates as ISO strings for consistency



## Design and refactoring

Draw on principles from John Ousterhout's _A Philosophy of Software Design_ when
adding new code or refactoring existing modules:

- Seek out sources of complexity, especially change amplification, cognitive
  load and unknown unknowns. Simplify these areas before adding features.
- Identify shallow modules that merely pass data through. Deepen them by hiding
  implementation details behind well‑defined interfaces.
- Watch for information leakage between modules and other signs of poor
  abstraction. Refactor to combine related functionality and make interfaces
  simpler and more obvious.
- When submitting a PR, describe any design issues found and how the refactoring
  addresses them. Favor deep modules with minimal, clear APIs.
- Most importantly, ideally, when you have finished with each change, the system will have the structure it would have had if you had designed it from the start with that change in mind.
- When your refactoring include a large number of renames, use search tools to make sure you are not missing any files or paths where changes need to be made.