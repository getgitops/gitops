import { databaseClient } from '$lib/db';
import { ProjectService } from './application/project.service';
import { SqliteProjectRepository } from './infrastructure/repositories/sqlite-project.repository';

const projectRepository = new SqliteProjectRepository(databaseClient);

export const projectService = new ProjectService(projectRepository);
