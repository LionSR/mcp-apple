/**
 * TypeScript interfaces for Apple Mail MCP
 */

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

export interface SendMailOptions {
  to: string;
  subject: string;
  body: string;
  accountName?: string;
  cc?: string;
  bcc?: string;
}

export interface SearchOptions {
  searchTerm: string;
  limit?: number;
  accountName?: string;
  mailboxName?: string;
}

export interface MoveEmailResult {
  moved: number;
  errors: string[];
}

export interface JXAError {
  error: boolean;
  message: string;
  stack?: string;
}

export interface MailboxSearchConfig {
  priorityNames: string[];
  maxMailboxes: number;
  messagesPerMailbox: number;
}

export interface EmailSortOptions {
  field: 'dateSent' | 'dateReceived';
  order: 'asc' | 'desc';
}