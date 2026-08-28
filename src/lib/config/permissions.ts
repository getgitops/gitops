export const defaultActions = ['read', 'create', 'update', 'delete', 'all'];

export function grantsFor(section: string, resource: string, extraActions: string[] = []) {
  return [...defaultActions, ...extraActions].map((action) => `${section}:${resource}:${action}`);
}

const permissions = {
  version: 1,
  sections: {
    cluster: {
      resource: 'cluster',
      sections: {
        organization: {
          resource: 'organization',
          permissions: grantsFor('cluster', 'organization'),
        },
        projects: {
          resource: 'projects',
          permissions: grantsFor('cluster', 'projects'),
        },
        users: {
          resource: 'users',
          permissions: grantsFor('cluster', 'users', ['invite']),
        },
        settings: {
          resource: 'settings',
          permissions: grantsFor('cluster', 'settings'),
        },
      },
    },
    organization: {
      resource: 'organization',
      sections: {
        projects: {
          resource: 'projects',
          permissions: grantsFor('organization', 'projects'),
        },
        users: {
          resource: 'users',
          permissions: grantsFor('organization', 'users', ['invite']),
        },
        roles: {
          resource: 'roles',
          permissions: grantsFor('organization', 'roles'),
        },
        backups: {
          resource: 'backups',
          permissions: grantsFor('organization', 'backups'),
        },
        'server-keys': {
          resource: 'server-keys',
          permissions: grantsFor('organization', 'server-keys'),
        },
        audit: {
          resource: 'audit',
          permissions: grantsFor('organization', 'audit'),
        },
      },
    },
    project: {
      resource: 'project',
      permissions: grantsFor('project', 'project'),
      sections: {
        users: {
          resource: 'users',
          permissions: grantsFor('project', 'users', ['invite']),
        },
        roles: {
          resource: 'roles',
          permissions: grantsFor('project', 'roles'),
        },
        'server-keys': {
          resource: 'server-keys',
          permissions: grantsFor('project', 'server-keys'),
        },
        audit: {
          resource: 'audit',
          permissions: grantsFor('project', 'audit'),
        },
        modules: {
          resource: 'modules',
          sections: {
            vault: {
              resource: 'vault',
              sections: {
                secrets: {
                  resource: 'secrets',
                  permissions: grantsFor('project:vault', 'secrets', ['import', 'export']),
                },
                environments: {
                  resource: 'environments',
                  permissions: grantsFor('project:vault', 'environments'),
                },
              },
            },
            codereport: {
              resource: 'codereport',
              sections: {
                reports: {
                  resource: 'reports',
                  permissions: grantsFor('project:codereport', 'reports'),
                },
                dependencies: {
                  resource: 'dependencies',
                  permissions: grantsFor('project:codereport', 'dependencies'),
                },
                vulnerabilities: {
                  resource: 'vulnerabilities',
                  permissions: grantsFor('project:codereport', 'vulnerabilities'),
                },
              },
            },
            stateiac: {
              resource: 'stateiac',
              sections: {
                stacks: {
                  resource: 'stacks',
                  permissions: grantsFor('project:stateiac', 'stacks'),
                },
                states: {
                  resource: 'states',
                  permissions: grantsFor('project:stateiac', 'states'),
                },
                history: {
                  resource: 'history',
                  permissions: grantsFor('project:stateiac', 'history'),
                },
              },
            },
          },
        },
      },
    },
  },
};

export default permissions;
