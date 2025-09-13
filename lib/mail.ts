/**
 * Complete Mail implementation using JXA
 * NO STRING PARSING - Returns proper JavaScript objects!
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';

const execAsync = promisify(exec);

// Type definitions
export interface MailAccount {
  name: string;
  emailAddresses: string[];
  enabled: boolean;
  id: string;
}

export interface MailboxInfo {
  name: string;
  messageCount: number;
  unreadCount: number;
  path: string;
  parent?: string;
  children: string[];
  accountName: string;
}

export interface EmailMessage {
  id: string;
  subject: string;
  sender: string;
  recipients: string[];
  dateSent: string;
  dateReceived: string;
  content: string;
  isRead: boolean;
  isFlagged: boolean;
  mailbox: string;
  accountName?: string;
}

export interface MailboxHierarchy {
  tree: Record<string, MailboxInfo>;
  roots: string[];
  total: number;
}

/**
 * Execute JXA code and return typed result
 */
async function runJXA<T = any>(code: string, timeout = 30000): Promise<T> {
  const wrappedCode = `
    ObjC.import('stdlib');
    ObjC.import('Foundation');

    function run() {
      try {
        const result = (function() {
          ${code}
        })();

        // Convert to JSON for clean transfer
        return JSON.stringify(result);
      } catch (error) {
        return JSON.stringify({
          error: true,
          message: error.toString(),
          stack: error.stack || ''
        });
      }
    }
  `;

  const tempFile = `/tmp/mail-jxa-${Date.now()}.js`;

  try {
    await fs.writeFile(tempFile, wrappedCode, 'utf8');

    const { stdout, stderr } = await execAsync(
      `osascript -l JavaScript "${tempFile}"`,
      { timeout, maxBuffer: 20 * 1024 * 1024 }
    );

    if (stderr && !stderr.includes('warning')) {
      console.error('JXA stderr:', stderr);
    }

    const parsed = JSON.parse(stdout);

    if (parsed?.error) {
      throw new Error(parsed.message || 'JXA execution failed');
    }

    return parsed;
  } finally {
    try {
      await fs.unlink(tempFile);
    } catch {}
  }
}

/**
 * Get all email accounts
 */
export async function getAccounts(): Promise<MailAccount[]> {
  return runJXA<MailAccount[]>(`
    const Mail = Application('Mail');
    const accounts = [];

    const allAccounts = Mail.accounts();

    for (let i = 0; i < allAccounts.length; i++) {
      try {
        const account = allAccounts[i];
        const emailAddresses = [];

        try {
          const addresses = account.emailAddresses();
          for (let j = 0; j < addresses.length; j++) {
            emailAddresses.push(addresses[j].toString());
          }
        } catch (e) {
          // No email addresses
        }

        accounts.push({
          name: account.name(),
          emailAddresses: emailAddresses,
          enabled: account.enabled(),
          id: account.id()
        });
      } catch (e) {
        // Skip problematic accounts
      }
    }

    return accounts;
  `);
}

/**
 * Get complete mailbox hierarchy for an account
 */
export async function getMailboxHierarchy(accountName: string): Promise<MailboxHierarchy> {
  return runJXA<MailboxHierarchy>(`
    const Mail = Application('Mail');
    const tree = {};
    const roots = [];
    let totalCount = 0;

    // Find the account
    const accounts = Mail.accounts();
    let targetAccount = null;

    for (let i = 0; i < accounts.length; i++) {
      if (accounts[i].name() === "${accountName.replace(/"/g, '\\"')}") {
        targetAccount = accounts[i];
        break;
      }
    }

    if (!targetAccount) {
      return { tree: {}, roots: [], total: 0 };
    }

    // Helper to get parent name
    function getParentName(mailbox) {
      try {
        const container = mailbox.container();
        if (container && container.class() === 'mailbox') {
          return container.name();
        }
      } catch (e) {}
      return null;
    }

    // Process all mailboxes
    const allMailboxes = targetAccount.mailboxes();
    const childrenMap = {};

    for (let i = 0; i < allMailboxes.length; i++) {
      const mb = allMailboxes[i];
      const name = mb.name();
      const parent = getParentName(mb);

      let messageCount = 0;
      let unreadCount = 0;

      try {
        const messages = mb.messages();
        messageCount = messages.length;

        // Count unread (slow but accurate)
        for (let j = 0; j < Math.min(100, messages.length); j++) {
          if (!messages[j].readStatus()) {
            unreadCount++;
          }
        }
        if (messages.length > 100 && unreadCount > 0) {
          // Estimate for large mailboxes
          unreadCount = Math.round(unreadCount * messages.length / 100);
        }
      } catch (e) {}

      const info = {
        name: name,
        messageCount: messageCount,
        unreadCount: unreadCount,
        path: parent ? parent + '/' + name : name,
        parent: parent,
        children: [],
        accountName: "${accountName.replace(/"/g, '\\"')}"
      };

      tree[name] = info;
      totalCount++;

      if (!parent) {
        roots.push(name);
      } else {
        if (!childrenMap[parent]) {
          childrenMap[parent] = [];
        }
        childrenMap[parent].push(name);
      }
    }

    // Build children arrays
    for (const parent in childrenMap) {
      if (tree[parent]) {
        tree[parent].children = childrenMap[parent].sort();
      } else {
        // Virtual parent
        tree[parent] = {
          name: parent,
          messageCount: 0,
          unreadCount: 0,
          path: parent,
          parent: null,
          children: childrenMap[parent].sort(),
          accountName: "${accountName.replace(/"/g, '\\"')}"
        };
        roots.push(parent);
      }
    }

    roots.sort();

    return { tree, roots, total: totalCount };
  `, 60000); // 60 second timeout for large mailbox sets
}

/**
 * Get unread emails across all mailboxes
 */
export async function getUnreadMails(limit = 20): Promise<EmailMessage[]> {
  return runJXA<EmailMessage[]>(`
    const Mail = Application('Mail');
    const emails = [];
    let collected = 0;
    const maxEmails = ${limit};

    // Check recent mailboxes first
    const allMailboxes = Mail.mailboxes();
    const checkLimit = Math.min(30, allMailboxes.length);

    for (let i = 0; i < checkLimit && collected < maxEmails; i++) {
      const mailbox = allMailboxes[i];

      try {
        const messages = mailbox.messages();

        // Check from newest (usually at the end)
        for (let j = messages.length - 1; j >= 0 && collected < maxEmails; j--) {
          const msg = messages[j];

          if (!msg.readStatus()) {
            const recipients = [];
            try {
              const toRecipients = msg.toRecipients();
              for (let k = 0; k < toRecipients.length; k++) {
                recipients.push(toRecipients[k].address());
              }
            } catch (e) {}

            emails.push({
              id: msg.id(),
              subject: msg.subject() || '[No Subject]',
              sender: (msg.sender() || '[Unknown]').toString(),
              recipients: recipients,
              dateSent: msg.dateSent().toISOString(),
              dateReceived: msg.dateReceived().toISOString(),
              content: (msg.content() || '').substring(0, 500),
              isRead: false,
              isFlagged: msg.flaggedStatus(),
              mailbox: mailbox.name()
            });

            collected++;
          }
        }
      } catch (e) {
        // Skip problematic mailboxes
      }
    }

    return emails;
  `);
}

/**
 * Search emails by term
 */
export async function searchMails(searchTerm: string, limit = 20): Promise<EmailMessage[]> {
  return runJXA<EmailMessage[]>(`
    const Mail = Application('Mail');
    const emails = [];
    const searchLower = "${searchTerm.toLowerCase().replace(/"/g, '\\"')}";
    let collected = 0;
    const maxEmails = ${limit};

    const allMailboxes = Mail.mailboxes();
    const checkLimit = Math.min(30, allMailboxes.length);

    for (let i = 0; i < checkLimit && collected < maxEmails; i++) {
      const mailbox = allMailboxes[i];

      try {
        const messages = mailbox.messages();

        // Search from newest
        for (let j = messages.length - 1; j >= 0 && collected < maxEmails; j--) {
          const msg = messages[j];

          const subject = (msg.subject() || '').toLowerCase();
          const sender = (msg.sender() || '').toString().toLowerCase();
          const content = (msg.content() || '').toLowerCase();

          if (subject.includes(searchLower) ||
              sender.includes(searchLower) ||
              content.includes(searchLower)) {

            const recipients = [];
            try {
              const toRecipients = msg.toRecipients();
              for (let k = 0; k < toRecipients.length; k++) {
                recipients.push(toRecipients[k].address());
              }
            } catch (e) {}

            emails.push({
              id: msg.id(),
              subject: msg.subject() || '[No Subject]',
              sender: (msg.sender() || '[Unknown]').toString(),
              recipients: recipients,
              dateSent: msg.dateSent().toISOString(),
              dateReceived: msg.dateReceived().toISOString(),
              content: (msg.content() || '').substring(0, 500),
              isRead: msg.readStatus(),
              isFlagged: msg.flaggedStatus(),
              mailbox: mailbox.name()
            });

            collected++;
          }
        }
      } catch (e) {
        // Skip problematic mailboxes
      }
    }

    // Sort by date (newest first)
    emails.sort((a, b) =>
      new Date(b.dateReceived).getTime() - new Date(a.dateReceived).getTime()
    );

    return emails;
  `);
}

/**
 * Get latest emails from specific account
 */
export async function getLatestMails(accountName: string, limit = 10): Promise<EmailMessage[]> {
  return runJXA<EmailMessage[]>(`
    const Mail = Application('Mail');
    const emails = [];

    // Find account
    const accounts = Mail.accounts();
    let targetAccount = null;

    for (let i = 0; i < accounts.length; i++) {
      if (accounts[i].name() === "${accountName.replace(/"/g, '\\"')}") {
        targetAccount = accounts[i];
        break;
      }
    }

    if (!targetAccount) {
      return [];
    }

    const mailboxes = targetAccount.mailboxes();
    let collected = 0;
    const maxEmails = ${limit};

    // Check first few mailboxes
    const checkLimit = Math.min(10, mailboxes.length);

    for (let i = 0; i < checkLimit && collected < maxEmails; i++) {
      const mailbox = mailboxes[i];

      try {
        const messages = mailbox.messages();

        // Get recent messages from the end
        const startIdx = Math.max(0, messages.length - 20);

        for (let j = messages.length - 1; j >= startIdx && collected < maxEmails; j--) {
          const msg = messages[j];

          const recipients = [];
          try {
            const toRecipients = msg.toRecipients();
            for (let k = 0; k < toRecipients.length; k++) {
              recipients.push(toRecipients[k].address());
            }
          } catch (e) {}

          emails.push({
            id: msg.id(),
            subject: msg.subject() || '[No Subject]',
            sender: (msg.sender() || '[Unknown]').toString(),
            recipients: recipients,
            dateSent: msg.dateSent().toISOString(),
            dateReceived: msg.dateReceived().toISOString(),
            content: (msg.content() || '').substring(0, 500),
            isRead: msg.readStatus(),
            isFlagged: msg.flaggedStatus(),
            mailbox: mailbox.name(),
            accountName: "${accountName.replace(/"/g, '\\"')}"
          });

          collected++;
        }
      } catch (e) {
        // Skip problematic mailboxes
      }
    }

    // Sort by date (newest first)
    emails.sort((a, b) =>
      new Date(b.dateReceived).getTime() - new Date(a.dateReceived).getTime()
    );

    return emails.slice(0, maxEmails);
  `);
}

/**
 * Send email using JXA
 */
export async function sendMail(
  to: string,
  subject: string,
  body: string,
  accountName?: string,
  cc?: string,
  bcc?: string
): Promise<string> {
  return runJXA<string>(`
    const Mail = Application('Mail');
    Mail.activate();

    // Find sender email if account specified
    let senderEmail = null;

    if ("${accountName || ''}") {
      const accounts = Mail.accounts();

      for (let i = 0; i < accounts.length; i++) {
        if (accounts[i].name() === "${accountName?.replace(/"/g, '\\"') || ''}") {
          const addresses = accounts[i].emailAddresses();
          if (addresses.length > 0) {
            senderEmail = addresses[0].toString();
          }
          break;
        }
      }

      if (!senderEmail) {
        throw new Error("Account not found or has no email addresses");
      }
    }

    // Create outgoing message
    const msg = Mail.OutgoingMessage({
      subject: "${subject.replace(/"/g, '\\"')}",
      content: \`${body.replace(/`/g, '\\`')}\`,
      visible: true
    });

    Mail.outgoingMessages.push(msg);

    // Add recipients
    msg.toRecipients.push(
      Mail.Recipient({ address: "${to.replace(/"/g, '\\"')}" })
    );

    ${cc ? `msg.ccRecipients.push(
      Mail.Recipient({ address: "${cc.replace(/"/g, '\\"')}" })
    );` : ''}

    ${bcc ? `msg.bccRecipients.push(
      Mail.Recipient({ address: "${bcc.replace(/"/g, '\\"')}" })
    );` : ''}

    // Set sender if specified
    if (senderEmail) {
      msg.sender = senderEmail;
    }

    // Send the message
    msg.send();

    return "Email sent successfully to ${to.replace(/"/g, '\\"')}";
  `);
}

/**
 * Mark emails as read
 */
export async function markAsRead(messageIds: string[]): Promise<number> {
  return runJXA<number>(`
    const Mail = Application('Mail');
    let markedCount = 0;
    const targetIds = ${JSON.stringify(messageIds)};

    const allMailboxes = Mail.mailboxes();

    for (let i = 0; i < allMailboxes.length; i++) {
      const mailbox = allMailboxes[i];

      try {
        const messages = mailbox.messages();

        for (let j = 0; j < messages.length; j++) {
          const msg = messages[j];

          if (targetIds.includes(msg.id())) {
            msg.readStatus = true;
            markedCount++;

            // Remove from list once found
            const idx = targetIds.indexOf(msg.id());
            targetIds.splice(idx, 1);

            if (targetIds.length === 0) {
              return markedCount;
            }
          }
        }
      } catch (e) {}
    }

    return markedCount;
  `);
}

/**
 * Delete emails
 */
export async function deleteEmails(messageIds: string[]): Promise<number> {
  return runJXA<number>(`
    const Mail = Application('Mail');
    let deletedCount = 0;
    const targetIds = ${JSON.stringify(messageIds)};

    const allMailboxes = Mail.mailboxes();

    for (let i = 0; i < allMailboxes.length; i++) {
      const mailbox = allMailboxes[i];

      try {
        const messages = mailbox.messages();

        for (let j = messages.length - 1; j >= 0; j--) {
          const msg = messages[j];

          if (targetIds.includes(msg.id())) {
            msg.delete();
            deletedCount++;

            const idx = targetIds.indexOf(msg.id());
            targetIds.splice(idx, 1);

            if (targetIds.length === 0) {
              return deletedCount;
            }
          }
        }
      } catch (e) {}
    }

    return deletedCount;
  `);
}

export default {
  getAccounts,
  getMailboxHierarchy,
  getUnreadMails,
  searchMails,
  getLatestMails,
  sendMail,
  markAsRead,
  deleteEmails
};