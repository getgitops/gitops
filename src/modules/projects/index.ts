import { ProjectService } from './application/project.service';
import { ProjectRepository } from './infrastructure/repositories/project.repostitory';

const projectRepository = new ProjectRepository();

export const projectService = new ProjectService(projectRepository);
