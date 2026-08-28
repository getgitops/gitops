import { describe, expect, it } from 'vitest';
import {
  isValidPermissionGrant,
  normalizePermissionGrant,
  normalizePermissionGrants,
} from './index';

describe('isValidPermissionGrant', () => {
  it('accepts canonical scope-prefixed grants from the catalog', () => {
    expect(isValidPermissionGrant('cluster:users:invite')).toBe(true);
    expect(isValidPermissionGrant('organization:projects:create')).toBe(true);
    expect(isValidPermissionGrant('project:project:all')).toBe(true);
    expect(isValidPermissionGrant('project:server-keys:read')).toBe(true);
    expect(isValidPermissionGrant('project:vault:secrets:import')).toBe(true);
  });

  it('rejects grants without a scope, unknown actions and malformed strings', () => {
    expect(isValidPermissionGrant('vault:secrets:read')).toBe(false);
    expect(isValidPermissionGrant('vault:read')).toBe(false);
    expect(isValidPermissionGrant('project:vault:secrets:frobnicate')).toBe(false);
    expect(isValidPermissionGrant('project')).toBe(false);
    expect(isValidPermissionGrant('*')).toBe(false);
  });
});

describe('normalizePermissionGrant', () => {
  it('leaves canonical grants untouched', () => {
    expect(normalizePermissionGrant('project:vault:secrets:read', 'project')).toBe(
      'project:vault:secrets:read',
    );
  });

  it('upgrades legacy scope-less grants using the role scope', () => {
    expect(normalizePermissionGrant('vault:secrets:read', 'project')).toBe(
      'project:vault:secrets:read',
    );
    expect(normalizePermissionGrant('project:all', 'project')).toBe('project:project:all');
    expect(normalizePermissionGrant('users:invite', 'organization')).toBe(
      'organization:users:invite',
    );
  });

  it('resolves a legacy grant against its own scope only', () => {
    expect(normalizePermissionGrant('users:invite', 'project')).toBe('project:users:invite');
    expect(normalizePermissionGrant('projects:create', 'project')).toBe('projects:create');
  });

  it('keeps unknown grants as-is so they stay visible instead of silently changing meaning', () => {
    expect(normalizePermissionGrant('vault:read', 'project')).toBe('vault:read');
  });

  it('deduplicates when several legacy grants map to the same canonical grant', () => {
    expect(
      normalizePermissionGrants(['vault:secrets:read', 'project:vault:secrets:read'], 'project'),
    ).toEqual(['project:vault:secrets:read']);
  });
});
