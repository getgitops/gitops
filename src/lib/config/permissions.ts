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
        settings: {
          resource: 'settings',
          permissions: grantsFor('organization', 'settings'),
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
        // events page (/org/<org>/settings/events): read to see it, update to acknowledge events
        events: {
          resource: 'events',
          permissions: grantsFor('organization', 'events'),
        },
        // alerts of the organization (/org/<org>/settings/alerts), they cover all its projects
        alerts: {
          resource: 'alerts',
          permissions: grantsFor('organization', 'alerts'),
        },
        notifications: {
          resource: 'notifications',
          permissions: grantsFor('organization', 'notifications'),
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
        // alerts of one project (/org/<org>/projects/<slug>/settings/alerts)
        alerts: {
          resource: 'alerts',
          permissions: grantsFor('project', 'alerts'),
        },
        notifications: {
          resource: 'notifications',
          permissions: grantsFor('project', 'notifications'),
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
                settings: {
                  resource: 'settings',
                  permissions: grantsFor('project:vault', 'settings'),
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
            monitoring: {
              resource: 'monitoring',
              sections: {
                monitors: {
                  resource: 'monitors',
                  permissions: grantsFor('project:monitoring', 'monitors', ['test']),
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
