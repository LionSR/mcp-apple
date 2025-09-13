/**
 * Mail Messages module - handle message retrieval operations
 */

import { runJXA, escapeJXAString } from './jxa-executor.js';
import { EmailMessage } from './types.js';

const DEFAULT_PRIORITY_MAILBOXES = ['INBOX', 'Sent Messages', 'Sent', 'Drafts'];

/**
 * Helper to create message object from JXA
 */
function createMessageJXA(includeContent = true, contentLimit = 500): string {
  return `
    const recipients = [];
    try {
      const toRecipients = msg.toRecipients();
      for (let k = 0; k < toRecipients.length; k++) {
        recipients.push(toRecipients[k].address());
      }
    } catch (e) {}

    ({
      id: msg.id(),
      subject: msg.subject() || '[No Subject]',
      sender: (msg.sender() || '[Unknown]').toString(),
      recipients: recipients,
      dateSent: msg.dateSent().toISOString(),
      dateReceived: msg.dateReceived().toISOString(),
      content: ${includeContent ? `(msg.content() || '').substring(0, ${contentLimit})` : `''`},
      isRead: msg.readStatus(),
      isFlagged: msg.flaggedStatus(),
      mailbox: mailbox.name(),
      accountName: ${includeContent ? `mailbox.account().name()` : `accountName`}
    })
  `;
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
            emails.push(${createMessageJXA()});
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
 * Get latest emails from specific account
 * IMPORTANT: Results are sorted by date with newest first
 */
export async function getLatestMails(accountName: string, limit = 10): Promise<EmailMessage[]> {
  const escapedName = escapeJXAString(accountName);

  return runJXA<EmailMessage[]>(`
    const Mail = Application('Mail');
    const allMessages = [];

    // Find account
    const accounts = Mail.accounts();
    let targetAccount = null;

    for (let i = 0; i < accounts.length; i++) {
      if (accounts[i].name() === "${escapedName}") {
        targetAccount = accounts[i];
        break;
      }
    }

    if (!targetAccount) {
      return [];
    }

    const mailboxes = targetAccount.mailboxes();
    const accountName = "${escapedName}";

    // Prioritize INBOX and common mailboxes for recent emails
    const priorityNames = ${JSON.stringify(DEFAULT_PRIORITY_MAILBOXES)};
    const priorityMailboxes = [];
    const otherMailboxes = [];

    // Sort mailboxes by priority
    for (let i = 0; i < mailboxes.length; i++) {
      const mailbox = mailboxes[i];
      const name = mailbox.name().toUpperCase();

      if (priorityNames.some(p => name === p.toUpperCase() || name.includes(p.toUpperCase()))) {
        priorityMailboxes.push(mailbox);
      } else {
        otherMailboxes.push(mailbox);
      }
    }

    // Check priority mailboxes first, then others
    const orderedMailboxes = [...priorityMailboxes, ...otherMailboxes];
    const checkLimit = Math.min(10, orderedMailboxes.length);

    for (let i = 0; i < checkLimit; i++) {
      const mailbox = orderedMailboxes[i];

      try {
        const messages = mailbox.messages();

        // Get recent messages from the end (check more messages for better coverage)
        const checkCount = Math.min(50, messages.length);
        const startIdx = Math.max(0, messages.length - checkCount);

        for (let j = messages.length - 1; j >= startIdx; j--) {
          const msg = messages[j];
          allMessages.push(${createMessageJXA(true, 500)});
        }
      } catch (e) {
        // Skip problematic mailboxes
      }
    }

    // Sort ALL collected messages by date (newest first)
    allMessages.sort((a, b) =>
      new Date(b.dateReceived).getTime() - new Date(a.dateReceived).getTime()
    );

    // Return only the requested number of most recent emails
    return allMessages.slice(0, ${limit});
  `);
}