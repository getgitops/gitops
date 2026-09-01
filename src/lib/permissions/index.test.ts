import { describe, expect, it } from 'vitest';
import {
  isValidPermissionGrant,
  normalizePermissionGrant,
  normalizePermissionGrants,
  toStoredPermissionGrant,
} from './index';

describe('isValidPermissionGrant', () => {
  it('accepts canonical scope-prefixed grants from the catalog', () => {
    expect(isValidPermissionGrant('cluster:users:invite')).toBe(true);
    expect(isValidPermissionGrant('organization:projects:create')).toBe(true);
    expect(isValidPermissionGrant('project:project:all')).toBe(true);
    expect(isValidPermissionGrant('project:server-keys:read')).toBe(true);
    expect(isValidPermissionGrant('project:vault:secrets:import')).toBe(true);
    expect(isValidPermissionGrant('organization:users:invite')).toBe(true);
    expect(isValidPermissionGrant('project:project:all')).toBe(true);
  });

  it('rejects grants without a scope, unknown actions and malformed strings', () => {
    expect(isValidPermissionGrant('vault:secrets:read')).toBe(false);
    expect(isValidPermissionGrant('vault:read')).toBe(false);
    expect(isValidPermissionGrant('project:vault:secrets:frobnicate')).toBe(false);
    expect(isValidPermissionGrant('project')).toBe(false);
    expect(isValidPermissionGrant('*')).toBe(false);
    // stripped forms with the scope prefix removed are no longer a valid stored grant —
    // CanCanService checks the full catalog string verbatim, with no scope reconstruction.
    expect(isValidPermissionGrant('project:all')).toBe(false);
    expect(isValidPermissionGrant('users:invite')).toBe(false);
    expect(isValidPermissionGrant('vault:secrets:import')).toBe(false);
  });
});

describe('toStoredPermissionGrant', () => {
  it('stores the catalog permission string as-is — CanCanService checks it verbatim', () => {
    expect(toStoredPermissionGrant('project:project:all', 'project')).toBe('project:project:all');
    expect(toStoredPermissionGrant('project:vault:secrets:read', 'project')).toBe(
      'project:vault:secrets:read',
    );
    expect(toStoredPermissionGrant('organization:users:invite', 'organization')).toBe(
      'organization:users:invite',
    );
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
