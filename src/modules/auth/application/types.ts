export type CreateUserRequest = {
  username: string;
  password: string;
  role: 'admin' | 'developer';
  email?: string | null;
};
