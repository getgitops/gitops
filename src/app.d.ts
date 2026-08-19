import type { AuthenticatedUser } from './modules/auth/domain/entities';

declare global {
  namespace App {
    interface Locals {
      user?: AuthenticatedUser | null;
    }
  }
}

export {};
