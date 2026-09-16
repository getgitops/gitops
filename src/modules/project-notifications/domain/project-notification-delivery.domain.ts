import { Domain } from '$lib/server/domain/domain';
import type { ProjectNotificationChannel } from './project-notification.domain';

export type ProjectNotificationDeliveryStatus = 'pending' | 'sent' | 'failed';

export class ProjectNotificationDeliveryDomain extends Domain {
  public projectId: string = '';
  public notificationId: string = '';
  public eventId: string = '';
  public eventName: string = '';
  public channel: ProjectNotificationChannel = 'mail';
  public recipients: string[] = [];
  public status: ProjectNotificationDeliveryStatus = 'pending';
  public error?: string | null = null;
  public sentAt?: string | null = null;

  constructor(data: any) {
    super(data);
    this.projectId = data.projectId;
    this.notificationId = data.notificationId;
    this.eventId = data.eventId;
    this.eventName = data.eventName;
    this.channel = data.channel ?? 'mail';
    this.recipients = Array.isArray(data.recipients) ? data.recipients : [];
    this.status = data.status ?? 'pending';
    this.error = data.error;
    this.sentAt = data.sentAt;
  }

  toJson() {
    return {
      id: this.id,
      projectId: this.projectId,
      notificationId: this.notificationId,
      eventId: this.eventId,
      eventName: this.eventName,
      channel: this.channel,
      recipients: this.recipients,
      status: this.status,
      error: this.error ?? null,
      createdAt: this.createdAt,
      sentAt: this.sentAt ?? null,
    };
  }
}
