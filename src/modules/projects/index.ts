import { ProjectService } from './application/project.service';
import { ProjectRepository } from './infrastructure/repositories/project.repostitory';
import { organizationService } from '../organization';

const projectRepository = new ProjectRepository();

export const projectService = new ProjectService(projectRepository, organizationService);
