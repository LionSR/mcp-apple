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
  const contentExpression = includeContent
    ? `(msg.content() || '').substring(0, ${contentLimit})`
    : `''`;

  return `(function() {
    var recipients = [];
    try {
      var toRecipients = msg.toRecipients();
      for (var k = 0; k < toRecipients.length; k++) {
        recipients.push(toRecipients[k].address());
      }
    } catch (e) {}

    return {
      id: msg.id(),
      subject: msg.subject() || '[No Subject]',
      sender: (msg.sender() || '[Unknown]').toString(),
      recipients: recipients,
      dateSent: msg.dateSent().toISOString(),
      dateReceived: msg.dateReceived().toISOString(),
      content: ${contentExpression},
      isRead: msg.readStatus(),
      isFlagged: msg.flaggedStatus(),
      mailbox: mailbox.name(),
      accountName: mailbox.account().name()
    };
  })()`;
}

/**
 * Get unread emails across all mailboxes
 */
export async function getUnreadMails(limit = 20): Promise<EmailMessage[]> {
  return runJXA<EmailMessage[]>(`
    var Mail = Application('Mail');
    var emails = [];
    var collected = 0;
    var maxEmails = ${limit};

    // Check recent mailboxes first
    var allMailboxes = Mail.mailboxes();
    var checkLimit = Math.min(30, allMailboxes.length);

    for (var i = 0; i < checkLimit && collected < maxEmails; i++) {
      var mailbox = allMailboxes[i];

      try {
        var messages = mailbox.messages();

        // Check from newest (usually at the end)
        for (var j = messages.length - 1; j >= 0 && collected < maxEmails; j--) {
          var msg = messages[j];

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
    var Mail = Application('Mail');
    var allMessages = [];

    // Find account
    var accounts = Mail.accounts();
    var targetAccount = null;

    for (var i = 0; i < accounts.length; i++) {
      if (accounts[i].name() === "${escapedName}") {
        targetAccount = accounts[i];
        break;
      }
    }

    if (!targetAccount) {
      return [];
    }

    var mailboxes = targetAccount.mailboxes();
    var accountName = "${escapedName}";

    // Prioritize INBOX and common mailboxes for recent emails
    var priorityNames = ${JSON.stringify(DEFAULT_PRIORITY_MAILBOXES)};
    var priorityMailboxes = [];
    var otherMailboxes = [];

    // Sort mailboxes by priority
    for (var i = 0; i < mailboxes.length; i++) {
      var mailbox = mailboxes[i];
      var name = mailbox.name().toUpperCase();

      var isPriority = false;
      for (var j = 0; j < priorityNames.length; j++) {
        if (name === priorityNames[j].toUpperCase() || name.includes(priorityNames[j].toUpperCase())) {
          isPriority = true;
          break;
        }
      }

      if (isPriority) {
        priorityMailboxes.push(mailbox);
      } else {
        otherMailboxes.push(mailbox);
      }
    }

    // Check priority mailboxes first, then others
    var orderedMailboxes = priorityMailboxes.concat(otherMailboxes);
    var checkLimit = Math.min(10, orderedMailboxes.length);

    for (var i = 0; i < checkLimit; i++) {
      var mailbox = orderedMailboxes[i];

      try {
        var messages = mailbox.messages();

        // Get recent messages from the end (check more messages for better coverage)
        var checkCount = Math.min(50, messages.length);
        var startIdx = Math.max(0, messages.length - checkCount);

        for (var j = messages.length - 1; j >= startIdx; j--) {
          var msg = messages[j];
          allMessages.push(${createMessageJXA(true, 500)});
        }
      } catch (e) {
        // Skip problematic mailboxes
      }
    }

    // Sort ALL collected messages by date (newest first)
    allMessages.sort(function(a, b) {
      return new Date(b.dateReceived).getTime() - new Date(a.dateReceived).getTime();
    });

    // Return only the requested number of most recent emails
    return allMessages.slice(0, ${limit});
  `, { timeout: 60000 });
}