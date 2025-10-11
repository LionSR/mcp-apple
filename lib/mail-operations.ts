/**
 * Mail Operations module - handle email operations (send, mark, delete, move)
 */

import { runJXA, escapeJXAString } from './jxa-executor.js';
import { SendMailOptions, MoveEmailResult } from './types.js';

/**
 * Send email using JXA
 */
export async function sendMail(options: SendMailOptions): Promise<string> {
  const { to, subject, body, accountName, cc, bcc } = options;
  const escapedSubject = escapeJXAString(subject);
  const escapedBody = body.replace(/`/g, '\\`');
  const escapedTo = escapeJXAString(to);
  const escapedAccount = accountName ? escapeJXAString(accountName) : '';
  const escapedCc = cc ? escapeJXAString(cc) : '';
  const escapedBcc = bcc ? escapeJXAString(bcc) : '';

  return runJXA<string>(`
    const Mail = Application('Mail');
    Mail.activate();

    // Find sender email if account specified
    let senderEmail = null;

    if ("${escapedAccount}") {
      const accounts = Mail.accounts();

      for (let i = 0; i < accounts.length; i++) {
        if (accounts[i].name() === "${escapedAccount}") {
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
      subject: "${escapedSubject}",
      content: \`${escapedBody}\`,
      visible: true
    });

    Mail.outgoingMessages.push(msg);

    // Add recipients
    msg.toRecipients.push(
      Mail.Recipient({ address: "${escapedTo}" })
    );

    ${cc ? `msg.ccRecipients.push(
      Mail.Recipient({ address: "${escapedCc}" })
    );` : ''}

    ${bcc ? `msg.bccRecipients.push(
      Mail.Recipient({ address: "${escapedBcc}" })
    );` : ''}

    // Set sender if specified
    if (senderEmail) {
      msg.sender = senderEmail;
    }

    // Send the message
    msg.send();

    return "Email sent successfully to ${escapedTo}";
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

    const accounts = Mail.accounts();

    for (let a = 0; a < accounts.length; a++) {
      const account = accounts[a];
      const mailboxes = account.mailboxes();

      for (let i = 0; i < mailboxes.length; i++) {
        const mailbox = mailboxes[i];

        try {
          const messages = mailbox.messages();

          for (let j = 0; j < messages.length; j++) {
            const msg = messages[j];

            if (targetIds.includes(msg.messageId())) {
              msg.readStatus = true;
              markedCount++;

              // Remove from list once found
              const idx = targetIds.indexOf(msg.messageId());
              targetIds.splice(idx, 1);

              if (targetIds.length === 0) {
                return markedCount;
              }
            }
          }
        } catch (e) {}
      }
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

    const accounts = Mail.accounts();

    for (let a = 0; a < accounts.length; a++) {
      const account = accounts[a];
      const mailboxes = account.mailboxes();

      for (let i = 0; i < mailboxes.length; i++) {
        const mailbox = mailboxes[i];

        try {
          const messages = mailbox.messages();

          for (let j = messages.length - 1; j >= 0; j--) {
            const msg = messages[j];

            if (targetIds.includes(msg.messageId())) {
              msg.delete();
              deletedCount++;

              const idx = targetIds.indexOf(msg.messageId());
              targetIds.splice(idx, 1);

              if (targetIds.length === 0) {
                return deletedCount;
              }
            }
          }
        } catch (e) {}
      }
    }

    return deletedCount;
  `);
}

/**
 * Move emails to a different mailbox
 * @param searchInboxOnly - When true, only searches INBOX mailboxes for performance (default: false)
 */
export async function moveEmails(
  messageIds: string[],
  targetMailbox: string,
  targetAccount?: string,
  searchInboxOnly: boolean = false
): Promise<MoveEmailResult> {
  const escapedMailbox = escapeJXAString(targetMailbox);
  const escapedAccount = targetAccount ? escapeJXAString(targetAccount) : null;

  return runJXA<MoveEmailResult>(`
    const Mail = Application('Mail');
    let movedCount = 0;
    const errors = [];
    const targetIds = ${JSON.stringify(messageIds)};
    const destMailboxName = "${escapedMailbox}";
    const destAccountName = ${escapedAccount ? `"${escapedAccount}"` : 'null'};
    const searchInboxOnly = ${searchInboxOnly};

    // Find the target mailbox
    let targetMbox = null;

    if (destAccountName) {
      // Look for mailbox in specific account
      const accounts = Mail.accounts();
      for (let i = 0; i < accounts.length; i++) {
        if (accounts[i].name() === destAccountName) {
          const mailboxes = accounts[i].mailboxes();
          for (let j = 0; j < mailboxes.length; j++) {
            if (mailboxes[j].name() === destMailboxName) {
              targetMbox = mailboxes[j];
              break;
            }
          }
          break;
        }
      }
    } else {
      // Search all mailboxes
      const allMailboxes = Mail.mailboxes();
      for (let i = 0; i < allMailboxes.length; i++) {
        if (allMailboxes[i].name() === destMailboxName) {
          targetMbox = allMailboxes[i];
          break;
        }
      }
    }

    if (!targetMbox) {
      return {
        moved: 0,
        errors: ["Target mailbox '" + destMailboxName + "' not found" +
                 (destAccountName ? " in account '" + destAccountName + "'" : "")]
      };
    }

    // Find and move messages - optionally search only INBOX mailboxes for performance
    const searchAccounts = Mail.accounts();
    const inboxNames = ['INBOX', 'Inbox'];

    for (let a = 0; a < searchAccounts.length; a++) {
      const searchAccount = searchAccounts[a];
      const searchMailboxes = searchAccount.mailboxes();

      for (let i = 0; i < searchMailboxes.length; i++) {
        const mailbox = searchMailboxes[i];

        // Skip non-INBOX mailboxes if searchInboxOnly is enabled
        if (searchInboxOnly && !inboxNames.includes(mailbox.name())) {
          continue;
        }

        try {
          const messages = mailbox.messages();

          for (let j = messages.length - 1; j >= 0; j--) {
            const msg = messages[j];

            if (targetIds.includes(msg.messageId())) {
              try {
                // Move the message
                Mail.move(msg, {to: targetMbox});
                movedCount++;

                const idx = targetIds.indexOf(msg.messageId());
                targetIds.splice(idx, 1);

                if (targetIds.length === 0) {
                  return { moved: movedCount, errors: errors };
                }
              } catch (e) {
                errors.push("Failed to move message " + msg.id() + ": " + e.toString());
              }
            }
          }
        } catch (e) {}
      }
    }

    if (targetIds.length > 0) {
      errors.push("Could not find messages: " + targetIds.join(", "));
    }

    return { moved: movedCount, errors: errors };
  `);
}