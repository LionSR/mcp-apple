# MCP Apple Mail Desktop Extension

A desktop extension for Claude that provides seamless Apple Mail integration through the Model Context Protocol (MCP) using JXA (JavaScript for Automation).

## Features

✨ **No String Parsing** - Uses JXA to return native JavaScript objects
🎯 **Type-Safe** - Full TypeScript support with interfaces
📧 **Complete Mail Support** - Read, search, send, manage emails
🔐 **Account-Specific Sending** - Send from any configured account
📁 **Hierarchical Mailboxes** - Full mailbox tree structure support

## Installation

### As a Desktop Extension (Recommended)

1. Download the `apple-mail.mcpb` extension package
2. Double-click to install in Claude Desktop
3. Configure your preferences in the Claude Desktop settings

### Manual Installation

For development or manual setup:

```bash
# Clone the repository
git clone https://github.com/LionSR/mcp-apple-mail
cd mcp-apple-mail

# Install dependencies
npm install

# Build the extension
npm run build

# Create the MCPB package
npm run pack
```

Then add to your Claude Desktop configuration (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "apple-mail": {
      "command": "node",
      "args": ["/path/to/mcp-apple/dist/index.js"],
      "env": {
        "MAIL_ENABLED_ACCOUNTS": "${user_config.enabled_accounts}",
        "MAIL_DISABLED_ACCOUNTS": "${user_config.disabled_accounts}",
        "MAIL_SEARCH_DEFAULT_LIMIT": "${user_config.search_limit}",
        "MAIL_PRIORITY_MAILBOXES": "${user_config.priority_mailboxes}",
        "MAIL_JXA_TIMEOUT": "${user_config.jxa_timeout}",
        "MAIL_MAX_MAILBOXES_CHECK": "${user_config.max_mailboxes_check}",
        "MAIL_MESSAGES_PER_MAILBOX": "${user_config.messages_per_mailbox}"
      }
    }
  }
}
```

## Configuration

When installed as a desktop extension, you can configure the following settings through the Claude Desktop UI:

| Setting | Description | Default |
|---------|-------------|---------|
| **Enabled Accounts** | Comma-separated list of account names to enable | All accounts |
| **Disabled Accounts** | Comma-separated list of account names to disable | None |
| **Search Limit** | Default number of results for search operations | 20 |
| **Priority Mailboxes** | Comma-separated list of priority mailbox names | INBOX, Sent Messages, Sent, Drafts |
| **JXA Timeout** | Timeout for JXA operations (ms) | 30000 |
| **Max Mailboxes** | Maximum mailboxes to check in operations | 10 |
| **Messages per Mailbox** | Messages to check per mailbox | 50 |

**Note:** If both `MAIL_ENABLED_ACCOUNTS` and `MAIL_DISABLED_ACCOUNTS` are specified, only accounts in the enabled list will be active.

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
npm run dev

# Run tests
npm run test

# Build for production
npm run build

# Create MCPB package
npm run pack
```

## Requirements

- macOS (for Apple Mail access)
- Node.js 16+ and npm
- Apple Mail configured with at least one account

## License

MIT

## Credits

Clean implementation without string parsing, built with JXA for maximum reliability and performance.