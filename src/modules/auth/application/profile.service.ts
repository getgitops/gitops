import { UserRepository } from '../infrastructure/repositories/user.repository';
import { PasswordService } from './password.service';

export class ProfileService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly passwordService: PasswordService,
  ) {}

  async getAuthenticatedUserProfile(userId: string): Promise<any | null> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      return null;
    }

    return user.toJson();
  }

  async updateEmail(userId: string, email: string | null): Promise<void> {
    await this.userRepository.updateEmail(userId, email);
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<boolean> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      return false;
    }

    if (!this.passwordService.verifyPassword(currentPassword, user.password)) {
      return false;
    }

    await this.userRepository.updatePassword(
      userId,
      this.passwordService.hashPassword(newPassword),
    );
    return true;
  }
}
