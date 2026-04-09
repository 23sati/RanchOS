export type UserRole = 'owner' | 'manager' | 'crew';
export type Locale = 'en' | 'es';
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'overdue';
export type CropType = 'almond' | 'citrus' | 'both';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  locale: Locale;
}

export interface Profile {
  id: string;
  orgId: string;
  fullName: string;
  role: UserRole;
  preferredLocale: Locale;
  phone?: string;
  avatarUrl?: string;
}
