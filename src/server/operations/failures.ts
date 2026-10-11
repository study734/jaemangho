import { DiscordRateLimitedError, DiscordRequestError } from '../chat/bot';
import { z } from 'zod';

export function syncErrorCode(error: unknown) {
  if (error instanceof DiscordRequestError) return /^discord_http_[1-5]\d\d$/.test(error.code) || ['discord_timeout', 'discord_network', 'discord_invalid_response'].includes(error.code) ? error.code : 'sync_failed';
  if (error instanceof DiscordRateLimitedError) return error.reason;
  if (error instanceof z.ZodError) return 'discord_invalid_response';
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    if (['42P01', '42703'].includes(error.code)) return 'database_schema';
    if (['40001', '40P01', '53300', '57P01', '57P02', '57P03'].includes(error.code)) return 'database_retryable';
    if (error.code === '57014') return 'database_timeout';
    if (/^08[A-Z0-9]{3}$/.test(error.code) || ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT'].includes(error.code)) return 'database_connection';
    if (/^[0-9A-Z]{5}$/.test(error.code)) return 'database_error';
  }
  return 'sync_failed';
}

