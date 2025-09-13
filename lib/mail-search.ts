/**
 * Mail Search module - handle email search operations
 */

import { runJXA, escapeJXAString } from './jxa-executor.js';
import { EmailMessage } from './types.js';

/**
 * Search emails across priority mailboxes (limited scope for performance)
 */
export async function searchMails(searchTerm: string, limit = 20): Promise<EmailMessage[]> {
  const escapedSearch = escapeJXAString(searchTerm.toLowerCase());

  return runJXA<EmailMessage[]>(`
    const Mail = Application('Mail');
    const emails = [];
    const searchLower = "${escapedSearch}";
    let collected = 0;
    const maxEmails = ${limit};

    // Only search in priority mailboxes from first 3 accounts
    const priorityNames = ['INBOX', 'Sent Messages', 'Sent'];
    const accounts = Mail.accounts();
    const maxAccounts = Math.min(3, accounts.length);

    for (let a = 0; a < maxAccounts && collected < maxEmails; a++) {
      try {
        const mailboxes = accounts[a].mailboxes();

        // Find priority mailboxes in this account
        for (let i = 0; i < mailboxes.length && collected < maxEmails; i++) {
          const mailbox = mailboxes[i];
          const mailboxName = mailbox.name().toUpperCase();

          // Only search priority mailboxes
          if (!priorityNames.some(p => mailboxName.includes(p.toUpperCase()))) {
            continue;
          }

          try {
            const messages = mailbox.messages();
            const messageCount = messages.length;

            // Only check last 50 messages per mailbox
            const checkCount = Math.min(50, messageCount);
            const startIdx = Math.max(0, messageCount - checkCount);

            for (let j = messageCount - 1; j >= startIdx && collected < maxEmails; j--) {
              try {
                const msg = messages[j];

                // Quick check on subject and sender only
                const subject = (msg.subject() || '').toLowerCase();
                const sender = (msg.sender() || '').toString().toLowerCase();

                if (subject.includes(searchLower) || sender.includes(searchLower)) {
                  const recipients = [];
                  try {
                    const toRecipients = msg.toRecipients();
                    for (let k = 0; k < Math.min(3, toRecipients.length); k++) {
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
                    content: '', // Skip content for performance
                    isRead: msg.readStatus(),
                    isFlagged: msg.flaggedStatus(),
                    mailbox: mailbox.name(),
                    accountName: accounts[a].name()
                  });

                  collected++;
                }
              } catch (e) {
                // Skip problematic messages
              }
            }
          } catch (e) {
            // Skip problematic mailboxes
          }
        }
      } catch (e) {
        // Skip problematic accounts
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
 * Search emails in inbox only (fast)
 */
export async function searchInbox(searchTerm: string, limit = 20): Promise<EmailMessage[]> {
  const escapedSearch = escapeJXAString(searchTerm.toLowerCase());

  return runJXA<EmailMessage[]>(`
    const Mail = Application('Mail');
    const emails = [];
    const searchLower = "${escapedSearch}";
    let collected = 0;
    const maxEmails = ${limit};

    // Get INBOX from each account
    const accounts = Mail.accounts();
    const inboxes = [];

    for (let i = 0; i < accounts.length; i++) {
      try {
        const mailboxes = accounts[i].mailboxes();
        for (let j = 0; j < mailboxes.length; j++) {
          const name = mailboxes[j].name().toUpperCase();
          if (name === 'INBOX' || name.includes('INBOX')) {
            inboxes.push(mailboxes[j]);
            break; // One inbox per account
          }
        }
      } catch (e) {}
    }

    // Search through inboxes
    for (let i = 0; i < inboxes.length && collected < maxEmails; i++) {
      const inbox = inboxes[i];

      try {
        const messages = inbox.messages();
        const messageCount = messages.length;

        // Check last 100 messages in inbox
        const checkCount = Math.min(100, messageCount);
        const startIdx = Math.max(0, messageCount - checkCount);

        for (let j = messageCount - 1; j >= startIdx && collected < maxEmails; j--) {
          try {
            const msg = messages[j];

            // Check subject and sender
            const subject = (msg.subject() || '').toLowerCase();
            const sender = (msg.sender() || '').toString().toLowerCase();

            if (subject.includes(searchLower) || sender.includes(searchLower)) {
              const recipients = [];
              try {
                const toRecipients = msg.toRecipients();
                for (let k = 0; k < Math.min(5, toRecipients.length); k++) {
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
                content: (msg.content() || '').substring(0, 200),
                isRead: msg.readStatus(),
                isFlagged: msg.flaggedStatus(),
                mailbox: inbox.name(),
                accountName: inbox.account().name()
              });

              collected++;
            }
          } catch (e) {}
        }
      } catch (e) {}
    }

    return emails;
  `);
}

/**
 * Search emails in a specific mailbox
 */
export async function searchInMailbox(
  mailboxName: string,
  searchTerm: string,
  accountName?: string,
  limit = 20
): Promise<EmailMessage[]> {
  const escapedSearch = escapeJXAString(searchTerm.toLowerCase());
  const escapedMailbox = escapeJXAString(mailboxName);
  const escapedAccount = accountName ? escapeJXAString(accountName) : null;

  return runJXA<EmailMessage[]>(`
    const Mail = Application('Mail');
    const emails = [];
    const searchLower = "${escapedSearch}";
    const targetMailboxName = "${escapedMailbox}";
    const targetAccountName = ${escapedAccount ? `"${escapedAccount}"` : 'null'};
    let collected = 0;
    const maxEmails = ${limit};

    // Find the mailbox
    let targetMailbox = null;
    const accounts = Mail.accounts();

    if (targetAccountName) {
      // Search in specific account
      for (let i = 0; i < accounts.length; i++) {
        if (accounts[i].name() === targetAccountName) {
          const mailboxes = accounts[i].mailboxes();
          for (let j = 0; j < mailboxes.length; j++) {
            if (mailboxes[j].name() === targetMailboxName) {
              targetMailbox = mailboxes[j];
              break;
            }
          }
          break;
        }
      }
    } else {
      // Search across all accounts
      for (let i = 0; i < accounts.length && !targetMailbox; i++) {
        const mailboxes = accounts[i].mailboxes();
        for (let j = 0; j < mailboxes.length; j++) {
          if (mailboxes[j].name() === targetMailboxName) {
            targetMailbox = mailboxes[j];
            break;
          }
        }
      }
    }

    if (!targetMailbox) {
      return [];
    }

    // Search in the specific mailbox
    try {
      const messages = targetMailbox.messages();
      const messageCount = messages.length;

      // Check last 50 messages (reduced for performance)
      const checkCount = Math.min(50, messageCount);
      const startIdx = Math.max(0, messageCount - checkCount);

      for (let j = messageCount - 1; j >= startIdx && collected < maxEmails; j--) {
        try {
          const msg = messages[j];

          // Check subject and sender only (skip content for performance)
          const subject = (msg.subject() || '').toLowerCase();
          const sender = (msg.sender() || '').toString().toLowerCase();

          if (subject.includes(searchLower) || sender.includes(searchLower)) {

            const recipients = [];
            try {
              const toRecipients = msg.toRecipients();
              for (let k = 0; k < Math.min(5, toRecipients.length); k++) {
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
              content: '', // Skip content for performance
              isRead: msg.readStatus(),
              isFlagged: msg.flaggedStatus(),
              mailbox: targetMailbox.name(),
              accountName: targetMailbox.account().name()
            });

            collected++;
          }
        } catch (e) {}
      }
    } catch (e) {}

    return emails;
  `);
}