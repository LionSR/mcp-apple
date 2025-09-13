/**
 * Mail Accounts module - handle account operations
 */

import { runJXA } from './jxa-executor.js';
import { MailAccount, MailboxHierarchy, MailboxInfo } from './types.js';

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
  const escapedName = accountName.replace(/"/g, '\\"');

  return runJXA<MailboxHierarchy>(`
    const Mail = Application('Mail');
    const tree = {};
    const roots = [];
    let totalCount = 0;

    // Find the account
    const accounts = Mail.accounts();
    let targetAccount = null;

    for (let i = 0; i < accounts.length; i++) {
      if (accounts[i].name() === "${escapedName}") {
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

        // Count unread (limit to first 100 for performance)
        for (let j = 0; j < Math.min(100, messages.length); j++) {
          if (!messages[j].readStatus()) {
            unreadCount++;
          }
        }

        // Estimate for large mailboxes
        if (messages.length > 100 && unreadCount > 0) {
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
        accountName: "${escapedName}"
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
          accountName: "${escapedName}"
        };
        roots.push(parent);
      }
    }

    roots.sort();

    return { tree, roots, total: totalCount };
  `, { timeout: 60000 }); // 60 second timeout for large mailbox sets
}