import crypto from 'crypto';
import { PasswordService } from './password.service';

export class SessionService {
  constructor(private readonly passwordService: PasswordService) {}

  createToken(userId: string): string {
    const salt = this.passwordService.ensureEncryptionKey();
    const signature = crypto.createHmac('sha256', salt).update(userId).digest('hex');
    return `${userId}.${signature}`;
  }

  parseAndVerifyToken(token: string | undefined): string | null {
    if (!token) {
      return null;
    }

    const [userId, signature] = token.split('.');
    if (!userId || !signature) {
      return null;
    }

    const salt = this.passwordService.ensureEncryptionKey();
    const expectedSignature = crypto.createHmac('sha256', salt).update(userId).digest('hex');

    return signature === expectedSignature ? userId : null;
  }
}
