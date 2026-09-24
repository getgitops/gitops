import type { AuthenticatedApiKey, AuthenticatedUser } from '$modules/auth/domain/entities';
import type { Logger } from 'pino';

declare global {
  namespace App {
    interface Locals {
      user?: AuthenticatedUser | null;
      apiKey?: AuthenticatedApiKey | null;
      /** trace-aware request logger, bound by the requestLogger hook */
      logger: Logger;
    }
  }
}

export {};
