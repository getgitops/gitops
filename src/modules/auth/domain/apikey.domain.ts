import { Domain } from './domain';

export class ApiKeyDomain extends Domain {
    public name: string = ''
    public slug: string = ''
    public permissions: object = {}

    constructor(data: any) {
        super(data);
        this.name = data.name
        this.slug = data.slug
        this.permissions = data.permissions
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