import crypto from 'crypto';
import type { AuthConfigRepository } from '../domain/repositories';

export class PasswordService {
  constructor(private readonly configRepository: AuthConfigRepository) {}

  ensureEncryptionKey(): string {
    const existingKey = this.configRepository.findEncryptionKey();
    if (existingKey) {
      return existingKey;
    }

    const newKey = crypto.randomBytes(32).toString('hex');
    this.configRepository.saveEncryptionKey(newKey);

    return newKey;
  }

  hashPassword(password: string): string {
    const salt = this.ensureEncryptionKey();
    return crypto.scryptSync(password, salt, 64).toString('hex');
  }

  verifyPassword(password: string, hash: string): boolean {
    return this.hashPassword(password) === hash;
  }
}
