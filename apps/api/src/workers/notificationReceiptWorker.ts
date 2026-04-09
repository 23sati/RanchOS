import { reconcileNotificationDeliveryReceipts } from '../lib/notificationDeliveries';

export async function notificationReceiptJob() {
  return reconcileNotificationDeliveryReceipts();
}
