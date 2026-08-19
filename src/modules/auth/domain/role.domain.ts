import { Domain } from './domain';

export class RoleDomain extends Domain {
    public name: string = ''
    public slug: string = ''
    public permissions: string[] = []

    constructor(data: any) {
        super(data);
        this.name = data.name
        this.slug = data.slug
        this.permissions = Array.isArray(data.permissions) ? data.permissions : []
    }

    toJson() {
        return {
            id: this.id,
            name: this.name,
            slug: this.slug,
            permissions: this.permissions,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt
        }
    }
}