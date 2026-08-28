import type { AuthenticatedApiKey, AuthenticatedUser } from '$modules/auth/domain/entities';

declare global {
  namespace App {
    interface Locals {
      user?: AuthenticatedUser | null;
      apiKey?: AuthenticatedApiKey | null;
    }
  }
}

export {};
