

import { Domain } from '$lib/server/domain/domain';

export interface ProjectStatus {
    ACTIVE: 'active';
    INACTIVE: 'inactive';
}

export class ProjectDomain extends Domain {
    public name: string = ''
    public slug: string | null = null
    public description?: string | null = null
    public status: ProjectStatus[keyof ProjectStatus] = 'active'
    constructor(data: any) {
        super(data);
        this.name = data.name
        this.slug = data.slug
        this.description = data.description
        this.status = data.status
        
    }

    toJson() {
        return {
            id: this.id,
            name: this.name,
            slug: this.slug,
            description: this.description,
            createdAt: this.createdAt,
            status: this.status,
            updatedAt: this.updatedAt
        }
    }
}