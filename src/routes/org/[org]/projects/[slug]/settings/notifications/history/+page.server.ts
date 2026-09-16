import { projectNotificationService } from '$modules/project-notifications';

export async function load({ parent }) {
  const { project } = await parent();
  return {
    deliveries: await projectNotificationService.listHistory(project.id),
    events: projectNotificationService.listEvents(),
  };
}
