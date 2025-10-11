/**
 * Mail Search module - handle email search operations
 */

import { runJXA, escapeJXAString } from './jxa-executor.js';
import { EmailMessage } from './types.js';
import { config } from './config.js';

/**
 * Search emails across priority mailboxes (limited scope for performance)
 */
export async function searchMails(searchTerm: string, limit = 20): Promise<EmailMessage[]> {
  const escapedSearch = escapeJXAString(searchTerm.toLowerCase());
  const messagesPerSearch = config.search.messagesPerSearch;
  const contentPreviewLength = config.search.contentPreviewLength;

  return runJXA<EmailMessage[]>(`
    var Mail = Application('Mail');
    var emails = [];
    var searchLower = "${escapedSearch}";
    var collected = 0;
    var maxEmails = ${limit};
    var messagesPerSearch = ${messagesPerSearch};
    var contentPreviewLength = ${contentPreviewLength};

    // Only search in priority mailboxes from first 3 accounts
    var priorityNames = ['INBOX', 'Sent Messages', 'Sent'];
    var accounts = Mail.accounts();
    var maxAccounts = Math.min(3, accounts.length);

    for (var a = 0; a < maxAccounts && collected < maxEmails; a++) {
      try {
        var mailboxes = accounts[a].mailboxes();

        // Find priority mailboxes in this account
        for (var i = 0; i < mailboxes.length && collected < maxEmails; i++) {
          var mailbox = mailboxes[i];
          var mailboxName = mailbox.name().toUpperCase();

          // Only search priority mailboxes
          var isPriority = false;
          for (var p = 0; p < priorityNames.length; p++) {
            if (mailboxName.includes(priorityNames[p].toUpperCase())) {
              isPriority = true;
              break;
            }
          }
          if (!isPriority) {
            continue;
          }

          try {
            var messages = mailbox.messages();
            var messageCount = messages.length;

            // Check configured number of messages per mailbox
            var checkCount = Math.min(messagesPerSearch, messageCount);
            var startIdx = Math.max(0, messageCount - checkCount);

            for (var j = messageCount - 1; j >= startIdx && collected < maxEmails; j--) {
              try {
                var msg = messages[j];

                // Check subject and sender only (skip content for performance)
                var subject = (msg.subject() || '').toLowerCase();
                var sender = (msg.sender() || '').toString().toLowerCase();

                if (subject.includes(searchLower) || sender.includes(searchLower)) {
                  var recipients = [];
                  try {
                    var toRecipients = msg.toRecipients();
                    for (var k = 0; k < Math.min(3, toRecipients.length); k++) {
                      recipients.push(toRecipients[k].address());
                    }
                  } catch (e) {}

                  emails.push({
                    id: String(msg.id()),
                    messageId: msg.messageId(),
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
    emails.sort(function(a, b) {
      return new Date(b.dateReceived).getTime() - new Date(a.dateReceived).getTime();
    });

    return emails;
  `);
}

/**
 * Search emails in inbox only (fast)
 */
export async function searchInbox(searchTerm: string, limit = 20): Promise<EmailMessage[]> {
  const escapedSearch = escapeJXAString(searchTerm.toLowerCase());

  return runJXA<EmailMessage[]>(`
    var Mail = Application('Mail');
    var emails = [];
    var searchLower = "${escapedSearch}";
    var collected = 0;
    var maxEmails = ${limit};

    // Get INBOX from each account
    var accounts = Mail.accounts();
    var inboxes = [];

    for (var i = 0; i < accounts.length; i++) {
      try {
        var mailboxes = accounts[i].mailboxes();
        for (var j = 0; j < mailboxes.length; j++) {
          var name = mailboxes[j].name().toUpperCase();
          if (name === 'INBOX' || name.includes('INBOX')) {
            inboxes.push(mailboxes[j]);
            break; // One inbox per account
          }
        }
      } catch (e) {}
    }

    // Search through inboxes
    for (var i = 0; i < inboxes.length && collected < maxEmails; i++) {
      var inbox = inboxes[i];

      try {
        var messages = inbox.messages();
        var messageCount = messages.length;

        // Check last 100 messages in inbox
        var checkCount = Math.min(100, messageCount);
        var startIdx = Math.max(0, messageCount - checkCount);

        for (var j = messageCount - 1; j >= startIdx && collected < maxEmails; j--) {
          try {
            var msg = messages[j];

            // Check subject and sender
            var subject = (msg.subject() || '').toLowerCase();
            var sender = (msg.sender() || '').toString().toLowerCase();

            if (subject.includes(searchLower) || sender.includes(searchLower)) {
              var recipients = [];
              try {
                var toRecipients = msg.toRecipients();
                for (var k = 0; k < Math.min(5, toRecipients.length); k++) {
                  recipients.push(toRecipients[k].address());
                }
              } catch (e) {}

              emails.push({
                id: String(msg.id()),
                messageId: msg.messageId(),
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
  const messagesPerSearch = config.search.messagesPerSearch;
  const contentPreviewLength = config.search.contentPreviewLength;

  return runJXA<EmailMessage[]>(`
    var Mail = Application('Mail');
    var emails = [];
    var searchLower = "${escapedSearch}";
    var targetMailboxName = "${escapedMailbox}";
    var targetAccountName = ${escapedAccount ? `"${escapedAccount}"` : 'null'};
    var collected = 0;
    var maxEmails = ${limit};
    var messagesPerSearch = ${messagesPerSearch};
    var contentPreviewLength = ${contentPreviewLength};

    // Find the mailbox
    var targetMailbox = null;
    var accounts = Mail.accounts();

    if (targetAccountName) {
      // Search in specific account
      for (var i = 0; i < accounts.length; i++) {
        if (accounts[i].name() === targetAccountName) {
          var mailboxes = accounts[i].mailboxes();
          for (var j = 0; j < mailboxes.length; j++) {
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
      for (var i = 0; i < accounts.length && !targetMailbox; i++) {
        var mailboxes = accounts[i].mailboxes();
        for (var j = 0; j < mailboxes.length; j++) {
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
      var messages = targetMailbox.messages();
      var messageCount = messages.length;

      // Check configured number of messages
      var checkCount = Math.min(messagesPerSearch, messageCount);
      var startIdx = Math.max(0, messageCount - checkCount);

      for (var j = messageCount - 1; j >= startIdx && collected < maxEmails; j--) {
        try {
          var msg = messages[j];

          // Check subject and sender only (skip content for performance)
          var subject = (msg.subject() || '').toLowerCase();
          var sender = (msg.sender() || '').toString().toLowerCase();

          if (subject.includes(searchLower) || sender.includes(searchLower)) {

            var recipients = [];
            try {
              var toRecipients = msg.toRecipients();
              for (var k = 0; k < Math.min(5, toRecipients.length); k++) {
                recipients.push(toRecipients[k].address());
              }
            } catch (e) {}

            emails.push({
              id: String(msg.id()),
              messageId: msg.messageId(),
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