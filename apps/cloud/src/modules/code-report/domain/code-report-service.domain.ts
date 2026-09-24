import { Domain } from '$lib/server/domain/domain';
import { ProjectDomain } from '../../projects/domain/project.domain';

export class CodeReportServiceDomain extends Domain {
  public projectId: string = '';
  public slug: string = '';
  public name: string = '';
  public description?: string | null = null;
  public tags: string[] = [];
  public tools: string[] = [];
  public project: ProjectDomain | null = null;

  constructor(data: any) {
    super(data);
    this.projectId = data.projectId;
    this.slug = data.slug;
    this.name = data.name;
    this.description = data.description;
    this.tags = Array.isArray(data.tags) ? data.tags : [];
    this.project = data.project ? new ProjectDomain(data.project) : null;
    this.tools = Array.isArray(data.tools) ? data.tools : [];
  }

  toJson() {
    return {
      id: this.id,
      projectId: this.projectId,
      slug: this.slug,
      name: this.name,
      description: this.description,
      tags: this.tags,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      project: this.project ? this.project.toJson() : null,
      tools: this.tools,
    };
  }
}
