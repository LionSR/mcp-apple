/**
 * JXA Executor module - handles JavaScript for Automation execution
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import { JXAError } from './types.js';

const execAsync = promisify(exec);

export interface JXAExecutorOptions {
  timeout?: number;
  maxBuffer?: number;
}

/**
 * Execute JXA code and return typed result
 */
export async function runJXA<T = any>(
  code: string,
  options: JXAExecutorOptions = {}
): Promise<T> {
  const { timeout = 30000, maxBuffer = 20 * 1024 * 1024 } = options;

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
      { timeout, maxBuffer }
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
 * Escape string for safe JXA execution
 */
export function escapeJXAString(str: string): string {
  return str.replace(/"/g, '\\"').replace(/`/g, '\\`');
}