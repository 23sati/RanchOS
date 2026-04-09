import { processDueNotificationDeliveries } from '../lib/notificationDeliveries';

export async function notificationDeliveryJob() {
  return processDueNotificationDeliveries();
}
