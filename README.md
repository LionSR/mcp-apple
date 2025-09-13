# MCP Apple Mail

Clean Apple Mail integration for Model Context Protocol (MCP) using JXA (JavaScript for Automation).

## Features

✨ **No String Parsing** - Uses JXA to return native JavaScript objects
🎯 **Type-Safe** - Full TypeScript support with interfaces
📧 **Complete Mail Support** - Read, search, send, manage emails
🔐 **Account-Specific Sending** - Send from any configured account
📁 **Hierarchical Mailboxes** - Full mailbox tree structure support

## Installation

```bash
# Install dependencies
bun install

# Build
bun run build

# Test
bun run test
```

## Usage with Claude Desktop

Add to your Claude Desktop configuration (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "apple-mail": {
      "command": "node",
      "args": ["/path/to/mcp-apple/dist/index.js"]
    }
  }
}
```

## Available Tools

### `mail_get_accounts`
Get all configured email accounts.

### `mail_get_mailboxes`
Get mailbox hierarchy for a specific account.

### `mail_get_unread`
Get unread emails (with configurable limit).

### `mail_search`
Search emails by text content.

### `mail_get_latest`
Get latest emails from a specific account.

### `mail_send`
Send email from a specific account.

### `mail_mark_read`
Mark emails as read by ID.

### `mail_delete`
Delete emails by ID.

## Technical Details

### JXA Implementation

This implementation uses JavaScript for Automation (JXA) instead of traditional AppleScript, which provides:

- Direct JavaScript object returns (no parsing!)
- Clean error handling
- Type safety with TypeScript
- ISO date formats
- Proper arrays and nested structures

### Example Response

```javascript
// getAccounts() returns:
[
  {
    name: "Work",
    emailAddresses: ["user@company.com"],
    enabled: true,
    id: "ABC-123-DEF"
  },
  // ...
]

// No string parsing needed!
```

## Development

```bash
# Run in development mode
bun run dev

# Run tests
bun run test

# Build for production
bun run build
```

## Requirements

- macOS (for Apple Mail access)
- Node.js or Bun
- Apple Mail configured with at least one account

## License

MIT

## Credits

Clean implementation without string parsing, built with JXA for maximum reliability and performance.