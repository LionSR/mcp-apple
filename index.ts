#!/usr/bin/env node

/**
 * Apple Mail MCP Server
 * Clean implementation using JXA - no string parsing!
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import mailJXA from "./lib/mail.js";
import {
  GetMailboxesSchema,
  GetUnreadSchema,
  GetLatestSchema,
  SearchMailsSchema,
  SearchInboxSchema,
  SearchInMailboxSchema,
  SendMailSchema,
  MarkAsReadSchema,
  DeleteEmailsSchema,
  MoveEmailsSchema
} from "./lib/schemas.js";
import { config, filterAccounts } from "./lib/config.js";

// Tool definitions
const MAIL_TOOLS: Tool[] = [
  {
    name: "mail_get_accounts",
    description: "Get all email accounts configured in Apple Mail",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "mail_get_mailboxes",
    description: "Get mailbox hierarchy for a specific account",
    inputSchema: {
      type: "object",
      properties: {
        accountName: {
          type: "string",
          description: "Name of the email account",
        },
      },
      required: ["accountName"],
    },
  },
  {
    name: "mail_get_unread",
    description: "Get unread emails across all mailboxes",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Maximum number of unread emails to retrieve",
          default: 20,
        },
      },
    },
  },
  {
    name: "mail_search",
    description: "Quick search in priority mailboxes (Inbox, Sent) - limited scope for performance",
    inputSchema: {
      type: "object",
      properties: {
        searchTerm: {
          type: "string",
          description: "Text to search for in emails",
        },
        limit: {
          type: "number",
          description: "Maximum number of results",
          default: 20,
        },
      },
      required: ["searchTerm"],
    },
  },
  {
    name: "mail_search_inbox",
    description: "Search emails in all inbox folders (fast, focused search)",
    inputSchema: {
      type: "object",
      properties: {
        searchTerm: {
          type: "string",
          description: "Text to search for in inbox emails",
        },
        limit: {
          type: "number",
          description: "Maximum number of results",
          default: 20,
        },
      },
      required: ["searchTerm"],
    },
  },
  {
    name: "mail_search_mailbox",
    description: "Search emails in a specific mailbox (includes content search)",
    inputSchema: {
      type: "object",
      properties: {
        mailboxName: {
          type: "string",
          description: "Name of the mailbox to search in",
        },
        searchTerm: {
          type: "string",
          description: "Text to search for",
        },
        accountName: {
          type: "string",
          description: "Account name (optional - searches all accounts if not specified)",
        },
        limit: {
          type: "number",
          description: "Maximum number of results",
          default: 20,
        },
      },
      required: ["mailboxName", "searchTerm"],
    },
  },
  {
    name: "mail_get_latest",
    description: "Get latest emails from a specific account",
    inputSchema: {
      type: "object",
      properties: {
        accountName: {
          type: "string",
          description: "Name of the email account",
        },
        limit: {
          type: "number",
          description: "Number of emails to retrieve",
          default: 10,
        },
      },
      required: ["accountName"],
    },
  },
  {
    name: "mail_send",
    description: "Send an email from a specific account",
    inputSchema: {
      type: "object",
      properties: {
        to: {
          type: "string",
          description: "Recipient email address",
        },
        subject: {
          type: "string",
          description: "Email subject",
        },
        body: {
          type: "string",
          description: "Email body content",
        },
        from: {
          type: "string",
          description: "Account name to send from (optional)",
        },
        cc: {
          type: "string",
          description: "CC recipients (optional)",
        },
        bcc: {
          type: "string",
          description: "BCC recipients (optional)",
        },
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    name: "mail_mark_read",
    description: "Mark emails as read by their IDs",
    inputSchema: {
      type: "object",
      properties: {
        messageIds: {
          type: "array",
          items: { type: "string" },
          description: "Array of message IDs to mark as read",
        },
      },
      required: ["messageIds"],
    },
  },
  {
    name: "mail_delete",
    description: "Delete emails by their IDs",
    inputSchema: {
      type: "object",
      properties: {
        messageIds: {
          type: "array",
          items: { type: "string" },
          description: "Array of message IDs to delete",
        },
      },
      required: ["messageIds"],
    },
  },
  {
    name: "mail_move",
    description: "Move emails to a different mailbox",
    inputSchema: {
      type: "object",
      properties: {
        messageIds: {
          type: "array",
          items: { type: "string" },
          description: "Array of message IDs to move",
        },
        targetMailbox: {
          type: "string",
          description: "Name of the target mailbox",
        },
        targetAccount: {
          type: "string",
          description: "Name of the target account (optional, searches all if not specified)",
        },
        searchInboxOnly: {
          type: "boolean",
          description: "When true, only searches INBOX mailboxes for performance (default: false)",
          default: false,
        },
      },
      required: ["messageIds", "targetMailbox"],
    },
  },
];

// Create server
const server = new Server(
  {
    name: "mcp-apple",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: MAIL_TOOLS,
}));

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "mail_get_accounts": {
        const allAccounts = await mailJXA.getAccounts();
        const enabledAccounts = filterAccounts(allAccounts, config);

        // Add status to each account
        const accountsWithStatus = allAccounts.map(acc => ({
          ...acc,
          configStatus: enabledAccounts.includes(acc) ? 'enabled' : 'disabled'
        }));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(accountsWithStatus, null, 2),
            },
          ],
        };
      }

      case "mail_get_mailboxes": {
        const validated = GetMailboxesSchema.parse(args);
        const { accountName } = validated;
        const hierarchy = await mailJXA.getMailboxHierarchy(accountName);

        // Format as tree for readability
        let output = `Mailbox Hierarchy for ${accountName}:\n`;
        output += `Total: ${hierarchy.total} mailboxes\n\n`;

        hierarchy.roots.forEach((rootName: string) => {
          const mailbox = hierarchy.tree[rootName];
          output += `📁 ${rootName} (${mailbox.messageCount} messages)\n`;

          mailbox.children.slice(0, 5).forEach((childName: string) => {
            const child = hierarchy.tree[childName];
            if (child) {
              output += `  └─ ${childName} (${child.messageCount} msgs)\n`;
            }
          });

          if (mailbox.children.length > 5) {
            output += `  └─ ... and ${mailbox.children.length - 5} more\n`;
          }
        });

        return {
          content: [{ type: "text", text: output }],
        };
      }

      case "mail_get_unread": {
        const validated = GetUnreadSchema.parse(args);
        const { limit = 20 } = validated;
        const emails = await mailJXA.getUnreadMails(limit);

        if (emails.length === 0) {
          return {
            content: [{ type: "text", text: "No unread emails found." }],
          };
        }

        const output = emails.map((email: any) =>
          `📧 ${email.subject}\n` +
          `   From: ${email.sender}\n` +
          `   Date: ${new Date(email.dateSent).toLocaleString()}\n` +
          `   Mailbox: ${email.mailbox}\n`
        ).join('\n');

        return {
          content: [{ type: "text", text: `Found ${emails.length} unread emails:\n\n${output}` }],
        };
      }

      case "mail_search": {
        const validated = SearchMailsSchema.parse(args);
        const { searchTerm, limit = 20 } = validated;
        const emails = await mailJXA.searchMails(searchTerm, limit);

        if (emails.length === 0) {
          return {
            content: [{ type: "text", text: `No emails found containing "${searchTerm}" in priority mailboxes` }],
          };
        }

        const output = emails.map((email: any) =>
          `📨 ${email.subject}\n` +
          `   From: ${email.sender}\n` +
          `   Date: ${new Date(email.dateReceived).toLocaleString()}\n` +
          `   Read: ${email.isRead ? '✓' : '✗'}\n`
        ).join('\n');

        return {
          content: [{ type: "text", text: `Found ${emails.length} emails:\n\n${output}` }],
        };
      }

      case "mail_search_inbox": {
        const validated = SearchInboxSchema.parse(args);
        const { searchTerm, limit = 20 } = validated;
        const emails = await mailJXA.searchInbox(searchTerm, limit);

        if (emails.length === 0) {
          return {
            content: [{ type: "text", text: `No emails found containing "${searchTerm}" in inbox` }],
          };
        }

        const output = emails.map((email: any) =>
          `📧 ${email.subject}\n` +
          `   From: ${email.sender}\n` +
          `   Date: ${new Date(email.dateReceived).toLocaleString()}\n` +
          `   Read: ${email.isRead ? '✓' : '✗'}\n`
        ).join('\n');

        return {
          content: [{ type: "text", text: `Found ${emails.length} emails in inbox:\n\n${output}` }],
        };
      }

      case "mail_search_mailbox": {
        const validated = SearchInMailboxSchema.parse(args);
        const { mailboxName, searchTerm, accountName, limit = 20 } = validated;
        const emails = await mailJXA.searchInMailbox(mailboxName, searchTerm, accountName, limit);

        if (emails.length === 0) {
          const location = accountName ? `${mailboxName} in ${accountName}` : mailboxName;
          return {
            content: [{ type: "text", text: `No emails found containing "${searchTerm}" in ${location}` }],
          };
        }

        const output = emails.map((email: any) =>
          `📨 ${email.subject}\n` +
          `   From: ${email.sender}\n` +
          `   Date: ${new Date(email.dateReceived).toLocaleString()}\n` +
          `   Account: ${email.accountName}\n` +
          `   Message-ID: ${email.messageId}\n` +
          `   Numeric ID: ${email.id}\n`
        ).join('\n');

        const location = accountName ? `${mailboxName} (${accountName})` : mailboxName;
        return {
          content: [{ type: "text", text: `Found ${emails.length} emails in ${location}:\n\n${output}` }],
        };
      }

      case "mail_get_latest": {
        const validated = GetLatestSchema.parse(args);
        const { accountName, limit = 10 } = validated;
        const emails = await mailJXA.getLatestMails(accountName, limit);

        const output = emails.map((email: any, i: number) =>
          `${i + 1}. ${email.subject}\n` +
          `   From: ${email.sender}\n` +
          `   Date: ${new Date(email.dateReceived).toLocaleString()}\n`
        ).join('\n');

        return {
          content: [{ type: "text", text: `Latest emails from ${accountName}:\n\n${output}` }],
        };
      }

      case "mail_send": {
        const validated = SendMailSchema.parse(args);
        const { to, subject, body, from, cc, bcc } = validated;

        const result = await mailJXA.sendMail({
          to,
          subject,
          body,
          accountName: from,
          cc,
          bcc
        });
        return {
          content: [{ type: "text", text: result }],
        };
      }

      case "mail_mark_read": {
        const validated = MarkAsReadSchema.parse(args);
        const { messageIds } = validated;
        const count = await mailJXA.markAsRead(messageIds);
        return {
          content: [{ type: "text", text: `Marked ${count} emails as read.` }],
        };
      }

      case "mail_delete": {
        const validated = DeleteEmailsSchema.parse(args);
        const { messageIds } = validated;
        const count = await mailJXA.deleteEmails(messageIds);
        return {
          content: [{ type: "text", text: `Deleted ${count} emails.` }],
        };
      }

      case "mail_move": {
        const validated = MoveEmailsSchema.parse(args);
        const { messageIds, targetMailbox, targetAccount, searchInboxOnly = false } = validated;
        const result = await mailJXA.moveEmails(messageIds, targetMailbox, targetAccount, searchInboxOnly);

        let message = `Moved ${result.moved} email${result.moved !== 1 ? 's' : ''}`;
        if (targetAccount) {
          message += ` to ${targetMailbox} in ${targetAccount}`;
        } else {
          message += ` to ${targetMailbox}`;
        }

        if (result.errors.length > 0) {
          message += `\nErrors:\n${result.errors.join('\n')}`;
        }

        return {
          content: [{ type: "text", text: message }],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Apple Mail MCP Server running...");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});