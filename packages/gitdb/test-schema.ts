import { entity } from './dist/index.js';

export const users = entity('users', {
  id: 'int',
  name: 'string',
});
