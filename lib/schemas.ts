/**
 * Zod schemas for input validation
 */

import { z } from 'zod';

// Account operations
export const GetMailboxesSchema = z.object({
  accountName: z.string().min(1, 'Account name is required')
});

// Message retrieval
export const GetUnreadSchema = z.object({
  limit: z.number().int().positive().max(100).default(20).optional()
});

export const GetLatestSchema = z.object({
  accountName: z.string().min(1, 'Account name is required'),
  limit: z.number().int().positive().max(100).default(10).optional()
});

// Search operations
export const SearchMailsSchema = z.object({
  searchTerm: z.string().min(1, 'Search term is required'),
  limit: z.number().int().positive().max(100).default(20).optional()
});

export const SearchInboxSchema = z.object({
  searchTerm: z.string().min(1, 'Search term is required'),
  limit: z.number().int().positive().max(100).default(20).optional()
});

export const SearchInMailboxSchema = z.object({
  mailboxName: z.string().min(1, 'Mailbox name is required'),
  searchTerm: z.string().min(1, 'Search term is required'),
  accountName: z.string().optional(),
  limit: z.number().int().positive().max(100).default(20).optional()
});

// Mail operations
export const SendMailSchema = z.object({
  to: z.string().email('Invalid email address'),
  subject: z.string().min(1, 'Subject is required'),
  body: z.string(),
  from: z.string().optional(),
  cc: z.string().optional(),
  bcc: z.string().optional()
});

export const MarkAsReadSchema = z.object({
  messageIds: z.array(z.string()).min(1, 'At least one message ID is required')
});

export const DeleteEmailsSchema = z.object({
  messageIds: z.array(z.string()).min(1, 'At least one message ID is required')
});

export const MoveEmailsSchema = z.object({
  messageIds: z.array(z.string()).min(1, 'At least one message ID is required'),
  targetMailbox: z.string().min(1, 'Target mailbox is required'),
  targetAccount: z.string().optional(),
  searchInboxOnly: z.boolean().default(false).optional()
});

// Export type inference helpers
export type GetMailboxesInput = z.infer<typeof GetMailboxesSchema>;
export type GetUnreadInput = z.infer<typeof GetUnreadSchema>;
export type GetLatestInput = z.infer<typeof GetLatestSchema>;
export type SearchMailsInput = z.infer<typeof SearchMailsSchema>;
export type SearchInboxInput = z.infer<typeof SearchInboxSchema>;
export type SearchInMailboxInput = z.infer<typeof SearchInMailboxSchema>;
export type SendMailInput = z.infer<typeof SendMailSchema>;
export type MarkAsReadInput = z.infer<typeof MarkAsReadSchema>;
export type DeleteEmailsInput = z.infer<typeof DeleteEmailsSchema>;
export type MoveEmailsInput = z.infer<typeof MoveEmailsSchema>;