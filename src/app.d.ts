declare global {
  namespace App {
    interface Locals {
      user?: {
        id: string;
        username: string;
        email: string | null;
        role: string;
      } | null;
    }
  }
}

export {};
