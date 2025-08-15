/**
 * Messages Index
 * Central export point for all message modules
 */

export { appMessages } from './appMessages';
export { installMessages } from './installMessages';
export { uninstallMessages } from './uninstallMessages';
export { updateMessages } from './updateMessages';

// Message formatting utilities
export const formatMessage = {
  error: (message: string, action: string, code?: string) => {
    const codeStr = code ? ` [${code}]` : '';
    return `❌ ${message}${codeStr}\n\n💡 ${action}`;
  },

  success: (message: string) => {
    return `✅ ${message}`;
  },

  info: (message: string) => {
    return `ℹ️  ${message}`;
  },

  warning: (message: string) => {
    return `⚠️  ${message}`;
  },

  // Template string replacement
  template: (template: string, values: Record<string, string | number>) => {
    return template.replace(/\{(\w+)\}/g, (match, key) => {
      return values[key]?.toString() || match;
    });
  },
};

// Common message types
export type MessageType = 'error' | 'success' | 'info' | 'warning';

export interface ErrorMessage {
  message: string;
  action: string;
  code: string;
}

export interface MessageConfig {
  type: MessageType;
  content: string;
  code?: string;
}
