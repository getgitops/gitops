import { Domain } from '$lib/server/domain/domain';

export type VaultSecretValues = Record<string, string>;

export class VaultEnvironmentDomain extends Domain {
  public projectId = '';
  public slug = '';
  public name = '';
  public description?: string | null = null;

  constructor(data: any) {
    super(data);
    this.projectId = data.projectId;
    this.slug = data.slug;
    this.name = data.name;
    this.description = data.description ?? null;
  }

  toJson() {
    return {
      id: this.id,
      projectId: this.projectId,
      slug: this.slug,
      name: this.name,
      description: this.description,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}

export class VaultFolderDomain extends Domain {
  public projectId = '';
  public parentFolderId: string | null = null;
  public linkedFolderId: string | null = null;
  public name = '';
  public path = '/';
  public description?: string | null = null;

  constructor(data: any) {
    super(data);
    this.projectId = data.projectId;
    this.parentFolderId = data.parentFolderId ?? null;
    this.linkedFolderId = data.linkedFolderId ?? null;
    this.name = data.name;
    this.path = data.path ?? '/';
    this.description = data.description ?? null;
  }

  toJson() {
    return {
      id: this.id,
      projectId: this.projectId,
      parentFolderId: this.parentFolderId,
      linkedFolderId: this.linkedFolderId,
      name: this.name,
      path: this.path,
      description: this.description,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}

export class VaultSecretDomain extends Domain {
  public projectId = '';
  public folderId: string | null = null;
  public key = '';
  public description?: string | null = null;
  public values: VaultSecretValues = {};

  constructor(data: any) {
    super(data);
    this.projectId = data.projectId;
    this.folderId = data.folderId ?? null;
    this.key = data.key;
    this.description = data.description ?? null;
    this.values = data.values ?? {};
  }

  toJson() {
    return {
      id: this.id,
      projectId: this.projectId,
      folderId: this.folderId,
      key: this.key,
      description: this.description,
      values: this.values,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
