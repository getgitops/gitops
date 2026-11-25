/**
 * Assigns a Pulumi project found in a backend to a GitOps project of the same organization. A
 * Pulumi project has at most one binding; `stacks` narrows it to some of its stacks (empty = all).
 */
export type StateBindingRow = {
  id: string;
  organizationId: string;
  backendId: string;
  pulumiProject: string;
  stacks: string[];
  projectId: string;
  createdAt: string;
  updatedAt: string;
};

export const MAX_PULUMI_NAME_LENGTH = 200;

function toIso(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'string' && value ? value : null;
}

export class StateBindingDomain implements StateBindingRow {
  id: string;
  organizationId: string;
  backendId: string;
  pulumiProject: string;
  stacks: string[];
  projectId: string;
  createdAt: string;
  updatedAt: string;

  constructor(row: Record<string, any>) {
    this.id = row.id;
    this.organizationId = row.organizationId;
    this.backendId = row.backendId;
    this.pulumiProject = row.pulumiProject ?? '';
    this.stacks = Array.isArray(row.stacks)
      ? row.stacks.filter((s: unknown) => typeof s === 'string')
      : [];
    this.projectId = row.projectId;
    this.createdAt = toIso(row.createdAt) ?? new Date(0).toISOString();
    this.updatedAt = toIso(row.updatedAt) ?? this.createdAt;
  }

  /** Whether this binding gives its project the stack `stack` of its Pulumi project. */
  covers(stack: string): boolean {
    return this.stacks.length === 0 || this.stacks.includes(stack);
  }

  toJson(): StateBindingRow {
    return {
      id: this.id,
      organizationId: this.organizationId,
      backendId: this.backendId,
      pulumiProject: this.pulumiProject,
      stacks: [...this.stacks],
      projectId: this.projectId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
