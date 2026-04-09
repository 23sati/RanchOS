import { synchronize } from '@nozbe/watermelondb/sync';
import { Database } from '@nozbe/watermelondb';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';

export async function syncDatabase(database: Database, profileId: string, authToken: string) {
  await synchronize({
    database,
    pullChanges: async ({ lastPulledAt }) => {
      const res = await fetch(`${API_URL}/api/v1/sync/pull`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': `Bearer ${authToken}` 
        },
        body: JSON.stringify({ 
          last_pulled_at: lastPulledAt || 0, 
          profile_id: profileId 
        })
      });
      if (!res.ok) {
        throw new Error(`Failed to pull changes: ${res.statusText}`);
      }
      return res.json();
    },
    pushChanges: async ({ changes }) => {
      const res = await fetch(`${API_URL}/api/v1/sync/push`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': `Bearer ${authToken}` 
        },
        body: JSON.stringify({ changes })
      });
      if (!res.ok) {
        throw new Error(`Failed to push changes: ${res.statusText}`);
      }
    }
  });
}
