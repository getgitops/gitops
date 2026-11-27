/** Shapes the State IaC settings page receives (client-safe: no credentials). */
export type BackendView = {
  id: string;
  organizationId: string;
  name: string;
  engine: 'pulumi';
  provider: 'gcs' | 's3';
  bucket: string;
  prefix: string | null;
  region: string | null;
  endpoint: string | null;
  forcePathStyle: boolean;
  auth: 'ambient' | 'credentials';
  hasCredentials: boolean;
  enabled: boolean;
  lastScanAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProjectOption = { id: string; name: string; slug: string };

export type DiscoveredProject = {
  name: string | null;
  stacks: string[];
  binding: { projectId: string; stacks: string[] } | null;
};

export type MissingBinding = { pulumiProject: string; projectId: string; stacks: string[] };

export type BackendProjectsResponse =
  | {
      ok: true;
      layout: 'project' | 'legacy' | 'empty';
      metaVersion: number | null;
      truncated: boolean;
      projects: DiscoveredProject[];
      missing: MissingBinding[];
    }
  | { ok: false; error: string; projects: []; missing: MissingBinding[] };
