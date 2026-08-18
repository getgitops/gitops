declare global {
  namespace App {
    interface Locals {
      user?: {
        id: string;
        username: string;
        email: string | null;
        role: string;
      } | null;
      /** Set when the request was authenticated via an OIDC bearer token. */
      oidc?: Record<string, unknown>;
    }
  }
}

export {};
