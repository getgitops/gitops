import { describe, expect, it } from 'vitest';
import {
  isValidPermissionGrant,
  isPermissionActionSelected,
  togglePermissionAction,
  toggleSectionAll,
  isSectionFullyGranted,
  toStoredPermissionGrant,
} from './index';

describe('isPermissionActionSelected', () => {
  it('matches an exact grant', () => {
    expect(isPermissionActionSelected(['vault:read'], 'vault', 'read')).toBe(true);
    expect(isPermissionActionSelected(['vault:read'], 'vault', 'delete')).toBe(false);
  });

  it('honors the section:all shortcut for UI checkboxes', () => {
    expect(isPermissionActionSelected(['vault:all'], 'vault', 'read')).toBe(true);
    expect(isPermissionActionSelected(['vault:all'], 'vault', 'delete')).toBe(true);
    expect(isPermissionActionSelected(['vault:all'], 'openreport', 'read')).toBe(false);
  });
});

describe('isValidPermissionGrant', () => {
  it('accepts every concrete section:action and section:all combination', () => {
    expect(isValidPermissionGrant('vault:read')).toBe(true);
    expect(isValidPermissionGrant('stateiac:delete')).toBe(true);
    expect(isValidPermissionGrant('openreport:all')).toBe(true);
    expect(isValidPermissionGrant('project:vault:secrets:import')).toBe(true);
    expect(isValidPermissionGrant('organization:users:invite')).toBe(true);
    expect(isValidPermissionGrant('project:all')).toBe(true);
    expect(isValidPermissionGrant('users:invite')).toBe(true);
    expect(isValidPermissionGrant('vault:secrets:import')).toBe(true);
  });

  it('rejects unknown sections, actions, or malformed strings', () => {
    expect(isValidPermissionGrant('vault:frobnicate')).toBe(false);
    expect(isValidPermissionGrant('unknown-section:read')).toBe(false);
    expect(isValidPermissionGrant('vault')).toBe(false);
    expect(isValidPermissionGrant('*')).toBe(false);
  });
});

describe('toStoredPermissionGrant', () => {
  it('maps UI permissions to canonical stored grants for the role scope', () => {
    expect(toStoredPermissionGrant('project:project:all', 'project')).toBe('project:all');
    expect(toStoredPermissionGrant('project:vault:secrets:read', 'project')).toBe(
      'vault:secrets:read',
    );
    expect(toStoredPermissionGrant('organization:users:invite', 'organization')).toBe(
      'users:invite',
    );
  });
});

describe('togglePermissionAction', () => {
  it('adds and removes an individual grant', () => {
    let permissions: string[] = [];
    permissions = togglePermissionAction(permissions, 'vault', 'read');
    expect(permissions).toEqual(['vault:read']);

    permissions = togglePermissionAction(permissions, 'vault', 'read');
    expect(permissions).toEqual([]);
  });

  it('expands section:all into explicit grants when unchecking one action', () => {
    const permissions = togglePermissionAction(['vault:all'], 'vault', 'delete');
    expect(permissions.sort()).toEqual(['vault:create', 'vault:read', 'vault:update'].sort());
  });
});

describe('toggleSectionAll', () => {
  it('collapses explicit grants into the all shortcut and clears other sections untouched', () => {
    const permissions = toggleSectionAll(['vault:read', 'openreport:read'], 'vault');
    expect(permissions.sort()).toEqual(['openreport:read', 'vault:all'].sort());
  });

  it('clears the section entirely when toggled off', () => {
    const permissions = toggleSectionAll(['vault:all', 'openreport:read'], 'vault');
    expect(permissions).toEqual(['openreport:read']);
  });
});

describe('isSectionFullyGranted', () => {
  it('reports true only when the all shortcut is present', () => {
    expect(isSectionFullyGranted(['vault:all'], 'vault')).toBe(true);
    expect(
      isSectionFullyGranted(
        ['vault:read', 'vault:create', 'vault:update', 'vault:delete'],
        'vault',
      ),
    ).toBe(false);
  });
});
