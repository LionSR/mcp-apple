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
import { z } from "zod";
import mailJXA from "./lib/mail.js";

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
    description: "Search for emails containing specific text",
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
        const accounts = await mailJXA.getAccounts();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(accounts, null, 2),
            },
          ],
        };
      }

      case "mail_get_mailboxes": {
        const { accountName } = args as { accountName: string };
        const hierarchy = await mailJXA.getMailboxHierarchy(accountName);

        // Format as tree for readability
        let output = `Mailbox Hierarchy for ${accountName}:\n`;
        output += `Total: ${hierarchy.total} mailboxes\n\n`;

        hierarchy.roots.forEach(rootName => {
          const mailbox = hierarchy.tree[rootName];
          output += `📁 ${rootName} (${mailbox.messageCount} messages)\n`;

          mailbox.children.slice(0, 5).forEach(childName => {
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
        const { limit = 20 } = args as { limit?: number };
        const emails = await mailJXA.getUnreadMails(limit);

        if (emails.length === 0) {
          return {
            content: [{ type: "text", text: "No unread emails found." }],
          };
        }

        const output = emails.map(email =>
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
        const { searchTerm, limit = 20 } = args as { searchTerm: string; limit?: number };
        const emails = await mailJXA.searchMails(searchTerm, limit);

        if (emails.length === 0) {
          return {
            content: [{ type: "text", text: `No emails found containing "${searchTerm}"` }],
          };
        }

        const output = emails.map(email =>
          `📨 ${email.subject}\n` +
          `   From: ${email.sender}\n` +
          `   Date: ${new Date(email.dateReceived).toLocaleString()}\n` +
          `   Read: ${email.isRead ? '✓' : '✗'}\n`
        ).join('\n');

        return {
          content: [{ type: "text", text: `Found ${emails.length} emails:\n\n${output}` }],
        };
      }

      case "mail_get_latest": {
        const { accountName, limit = 10 } = args as { accountName: string; limit?: number };
        const emails = await mailJXA.getLatestMails(accountName, limit);

        const output = emails.map((email, i) =>
          `${i + 1}. ${email.subject}\n` +
          `   From: ${email.sender}\n` +
          `   Date: ${new Date(email.dateReceived).toLocaleString()}\n`
        ).join('\n');

        return {
          content: [{ type: "text", text: `Latest emails from ${accountName}:\n\n${output}` }],
        };
      }

      case "mail_send": {
        const { to, subject, body, from, cc, bcc } = args as {
          to: string;
          subject: string;
          body: string;
          from?: string;
          cc?: string;
          bcc?: string;
        };

        const result = await mailJXA.sendMail(to, subject, body, from, cc, bcc);
        return {
          content: [{ type: "text", text: result }],
        };
      }

      case "mail_mark_read": {
        const { messageIds } = args as { messageIds: string[] };
        const count = await mailJXA.markAsRead(messageIds);
        return {
          content: [{ type: "text", text: `Marked ${count} emails as read.` }],
        };
      }

      case "mail_delete": {
        const { messageIds } = args as { messageIds: string[] };
        const count = await mailJXA.deleteEmails(messageIds);
        return {
          content: [{ type: "text", text: `Deleted ${count} emails.` }],
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