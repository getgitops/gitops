import { ProjectNotificationService } from './application/project-notification.service';
import { ProjectNotificationSubscriber } from './application/project-notification.subscriber';
import { ProjectNotificationRepository } from './infrastructure/repositories/project-notification.repository';
import { ProjectNotificationTargetService } from './application/project-notification-target.service';
import { ProjectNotificationTargetRepository } from './infrastructure/repositories/project-notification-target.repository';
import { ProjectNotificationTargetSender } from './application/project-notification-target.sender';
import { ProjectNotificationTemplateService } from './application/project-notification-template.service';
import { ProjectNotificationTemplateRepository } from './infrastructure/repositories/project-notification-template.repository';
import { eventBus } from '$modules/events';
import { codeReportService } from '$modules/code-report';
import { projectService } from '$modules/projects';

export const projectNotificationRepository = new ProjectNotificationRepository();
export const projectNotificationTargetRepository = new ProjectNotificationTargetRepository();
export const projectNotificationTemplateRepository = new ProjectNotificationTemplateRepository();
export const projectNotificationTemplateService = new ProjectNotificationTemplateService(
  projectNotificationTemplateRepository,
);
export const projectNotificationTargetService = new ProjectNotificationTargetService(
  projectNotificationTargetRepository,
  projectNotificationTemplateRepository,
);
const projectNotificationTargetSender = new ProjectNotificationTargetSender(
  projectNotificationTargetService,
);
export const projectNotificationService = new ProjectNotificationService(
  projectNotificationRepository,
  projectNotificationTemplateRepository,
);
const projectNotificationSubscriber = new ProjectNotificationSubscriber(
  projectNotificationRepository,
  codeReportService,
  projectService,
  projectNotificationTargetSender,
  projectNotificationTemplateService,
  projectNotificationTargetService,
);

let started = false;

export function startProjectNotifications() {
  if (started) return;
  started = true;
  eventBus.attach(projectNotificationSubscriber);
}

export { PROJECT_NOTIFICATION_EVENT_CLASSES } from './domain/project-notification-events';
