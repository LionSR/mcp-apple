/**
 * Configuration module - reads settings from environment variables
 * Following the Desktop Extension pattern where user_config from manifest
 * is automatically mapped to environment variables
 */

export interface MailConfig {
  accounts: {
    enabled?: string[];
    disabled?: string[];
  };
  search: {
    defaultLimit: number;
    maxLimit: number;
    priorityMailboxes: string[];
    messagesPerSearch: number;
    contentPreviewLength: number;
  };
  performance: {
    jxaTimeout: number;
    maxMailboxesToCheck: number;
    messagesPerMailboxCheck: number;
  };
}

/**
 * Parse comma-separated environment variable into array
 */
function parseEnvArray(envVar: string | undefined): string[] | undefined {
  if (!envVar) return undefined;
  return envVar.split(',').map(s => s.trim()).filter(s => s.length > 0);
}

/**
 * Parse environment variable as number with fallback
 */
function parseEnvNumber(envVar: string | undefined, defaultValue: number): number {
  if (!envVar) return defaultValue;
  const parsed = parseInt(envVar, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Load configuration from environment variables
 */
export function loadConfig(): MailConfig {
  return {
    accounts: {
      enabled: parseEnvArray(process.env.MAIL_ENABLED_ACCOUNTS),
      disabled: parseEnvArray(process.env.MAIL_DISABLED_ACCOUNTS)
    },
    search: {
      defaultLimit: parseEnvNumber(process.env.MAIL_SEARCH_DEFAULT_LIMIT, 20),
      maxLimit: parseEnvNumber(process.env.MAIL_SEARCH_MAX_LIMIT, 100),
      priorityMailboxes: parseEnvArray(process.env.MAIL_PRIORITY_MAILBOXES) ||
        ['INBOX', 'Sent Messages', 'Sent', 'Drafts'],
      messagesPerSearch: parseEnvNumber(process.env.MAIL_MESSAGES_PER_SEARCH, 50),
      contentPreviewLength: parseEnvNumber(process.env.MAIL_CONTENT_PREVIEW_LENGTH, 200)
    },
    performance: {
      jxaTimeout: parseEnvNumber(process.env.MAIL_JXA_TIMEOUT, 30000),
      maxMailboxesToCheck: parseEnvNumber(process.env.MAIL_MAX_MAILBOXES_CHECK, 10),
      messagesPerMailboxCheck: parseEnvNumber(process.env.MAIL_MESSAGES_PER_MAILBOX, 50)
    }
  };
}

/**
 * Check if an account is enabled based on configuration
 */
export function isAccountEnabled(accountName: string, config: MailConfig): boolean {
  // If enabled list is specified, account must be in it
  if (config.accounts.enabled && config.accounts.enabled.length > 0) {
    return config.accounts.enabled.includes(accountName);
  }

  // If disabled list is specified, account must not be in it
  if (config.accounts.disabled && config.accounts.disabled.length > 0) {
    return !config.accounts.disabled.includes(accountName);
  }

  // By default, all accounts are enabled
  return true;
}

/**
 * Filter accounts based on configuration
 */
export function filterAccounts<T extends { name: string }>(
  accounts: T[],
  config: MailConfig
): T[] {
  return accounts.filter(account => isAccountEnabled(account.name, config));
}

// Export singleton config instance
export const config = loadConfig();