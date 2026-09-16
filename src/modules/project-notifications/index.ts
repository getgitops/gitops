import { ProjectNotificationService } from './application/project-notification.service';
import { ProjectNotificationSubscriber } from './application/project-notification.subscriber';
import { ProjectNotificationRepository } from './infrastructure/repositories/project-notification.repository';
import { eventBus } from '$modules/events';
import { codeReportService } from '$modules/code-report';
import { projectService } from '$modules/projects';

export const projectNotificationRepository = new ProjectNotificationRepository();
export const projectNotificationService = new ProjectNotificationService(
  projectNotificationRepository,
);
const projectNotificationSubscriber = new ProjectNotificationSubscriber(
  projectNotificationRepository,
  codeReportService,
  projectService,
);

let started = false;

export function startProjectNotifications() {
  if (started) return;
  started = true;
  eventBus.attach(projectNotificationSubscriber);
}

export { PROJECT_NOTIFICATION_EVENT_CLASSES } from './domain/project-notification-events';
