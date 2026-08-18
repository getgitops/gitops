
import type { AuthUserRepository } from '../domain/repositories';


export class ApiKeysService {
  constructor(
    private readonly userRepository: AuthUserRepository,
  ) {}

}