import QuickBooks from 'node-quickbooks';
import { db } from '@ranchos/db/src';
import { orgIntegrations } from '@ranchos/db/src/schema';
import { eq, and } from 'drizzle-orm';

/**
 * QuickBooks Online Sync Service
 * Manages OAuth credentials and payroll journal entry pushes.
 */
export async function pushPayrollToQuickBooks(orgId: string, totalAmount: number, payDate: string) {
  const [integration] = await db.select()
    .from(orgIntegrations)
    .where(and(eq(orgIntegrations.orgId, orgId), eq(orgIntegrations.integrationType, 'quickbooks')));

  if (!integration || !integration.accessToken || !integration.realmId) return;

  const qbo = new (QuickBooks as any)(
    process.env.QBO_CLIENT_ID,
    process.env.QBO_CLIENT_SECRET,
    integration.accessToken,
    false, // no token secret for oAuth 2.0
    integration.realmId,
    true, // sandbox mode (change to false for prod)
    true, // logging
    null, // minorversion
    '2.0', // oauth version
    integration.refreshToken
  );

  return new Promise((resolve, reject) => {
    qbo.createJournalEntry({
      Line: [
        {
          DetailType: 'JournalEntryLineDetail',
          Amount: totalAmount,
          Direction: 'Debit',
          JournalEntryLineDetail: {
            AccountRef: { name: 'Labor Expense', value: 'LaborAccountID' } 
          }
        },
        {
          DetailType: 'JournalEntryLineDetail',
          Amount: totalAmount,
          Direction: 'Credit',
          JournalEntryLineDetail: {
            AccountRef: { name: 'Cash', value: 'CashAccountID' }
          }
        }
      ],
      TxnDate: payDate
    }, (err: any, response: any) => {
      if (err) reject(err);
      else resolve(response);
    });
  });
}
