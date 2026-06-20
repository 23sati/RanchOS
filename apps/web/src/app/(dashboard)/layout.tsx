'use client';
import { ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import { Home, Map as MapIcon, ListTodo, Settings, LogOut, Leaf, Bell, Search, Droplet, Bug, FileText, Brain, Palette, Users, Tractor, CalendarDays, Waves, Boxes } from 'lucide-react';
import { authClient } from '@/lib/auth/client';
import { fetchOnboardingStatus, OnboardingStatus } from '@/lib/onboarding';
import {
  fetchNotifications,
  formatNotificationDate,
  markAllNotificationsRead,
  NotificationRecord,
  updateNotificationStatus,
} from '@/lib/notifications';
import { subscribeToOrgEvents } from '@/lib/org-events';
import { useRouter, usePathname } from 'next/navigation';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [authReady, setAuthReady] = useState(false);
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationActionId, setNotificationActionId] = useState('');

  useEffect(() => {
    let cancelled = false;

    const ensureAuthenticated = async () => {
      try {
        const session = await authClient.getSession();
        if (cancelled) {
          return;
        }

        if (!session.data?.user) {
          router.push('/login');
          return;
        }

        const status = await fetchOnboardingStatus();
        if (cancelled) {
          return;
        }

        if (!status.onboardingComplete) {
          router.push('/onboarding');
          return;
        }

        setStatus(status);
        try {
          const notificationsPayload = await fetchNotifications();
          if (!cancelled) {
            setNotifications(notificationsPayload.items);
            setUnreadCount(notificationsPayload.unreadCount);
          }
        } catch {
          // Notification center is best-effort.
        }

        setAuthReady(true);
      } catch {
        if (!cancelled) {
          router.push('/login');
        }
      }
    };

    void ensureAuthenticated();

    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!status?.profile?.orgId) {
      return;
    }

    const refreshNotifications = async () => {
      const payload = await fetchNotifications();
      setNotifications(payload.items);
      setUnreadCount(payload.unreadCount);
    };

    const unsubscribe = subscribeToOrgEvents(status.profile.orgId, (event) => {
      if (event.type !== 'notifications_updated') {
        return;
      }

      void refreshNotifications()
        .catch(() => {
          // Best-effort live refresh.
        });
    }, {
      onPollingFallback: async () => {
        await refreshNotifications();
      },
    });

    return () => {
      unsubscribe();
    };
  }, [status?.profile?.orgId]);

  const handleLogout = async () => {
    await authClient.signOut();
    router.push('/login');
  };

  const handleNotificationAction = async (
    notificationId: string,
    action: 'read' | 'archive' | 'unread',
  ) => {
    setNotificationActionId(notificationId);

    try {
      const response = await updateNotificationStatus(notificationId, action);
      setNotifications((current) =>
        current
          .map((notification) =>
            notification.id === notificationId
              ? {
                  ...notification,
                  readAt: response.readAt,
                  archivedAt: response.archivedAt,
                }
              : notification,
          )
          .filter((notification) => !notification.archivedAt),
      );
      setUnreadCount(response.unreadCount);
    } finally {
      setNotificationActionId('');
    }
  };

  const handleMarkAllRead = async () => {
    const payload = await markAllNotificationsRead();
    setNotifications(payload.items);
    setUnreadCount(payload.unreadCount);
  };

  const navItems = [
    { name: 'Dashboard', icon: Home, href: '/' },
    { name: 'Blocks / Map', icon: MapIcon, href: '/blocks' },
    { name: 'Tasks Kanban', icon: ListTodo, href: '/tasks' },
    { name: 'Irrigation', icon: Droplet, href: '/irrigation' },
    { name: 'Scouting & IPM', icon: Bug, href: '/scouting' },
    { name: 'Labor', icon: Users, href: '/labor' },
    { name: 'Harvest', icon: Tractor, href: '/harvest' },
    { name: 'Inventory', icon: Boxes, href: '/inventory' },
    { name: 'Intelligence', icon: Brain, href: '/intelligence' },
    { name: 'Degree Days', icon: CalendarDays, href: '/degree-days' },
    { name: 'SGMA', icon: Waves, href: '/sgma' },
    { name: 'Compliance', icon: FileText, href: '/compliance' },
    { name: 'Themes', icon: Palette, href: '/themes' },
  ];

  if (!authReady) {
    return (
      <div className="flex h-screen items-center justify-center bg-ranch-bg">
        <div className="rounded-2xl border border-ranch-border bg-white px-6 py-5 text-sm text-gray-600 shadow-sm">
          Loading your RanchOS workspace...
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-ranch-bg text-[color:var(--color-text-primary)] overflow-hidden">
      {/* Dark Sidebar per Design Specs */}
      <aside className="w-64 bg-ranch-sidebar text-[color:var(--color-sidebar-text)] shadow-xl flex flex-col transition-all">
        {/* Brand */}
        <div className="h-16 flex items-center gap-3 px-6 border-b border-white/10">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-leaf to-sun flex items-center justify-center shadow-lg">
            <Leaf className="h-4 w-4 text-white" />
          </div>
          <span className="font-bold text-lg tracking-tight">RanchOS</span>
        </div>
        
        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link 
                key={item.href} 
                href={item.href} 
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group ${
                  active 
                    ? 'bg-white/10 text-sun' 
                    : 'text-[color:var(--color-sidebar-text-muted)] hover:bg-white/5 hover:text-[color:var(--color-sidebar-text)]'
                }`}
              >
                <item.icon className="h-5 w-5 group-hover:scale-110 transition-transform" /> {item.name}
              </Link>
            );
          })}
        </nav>
        
        {/* Bottom Actions */}
        <div className="p-4 border-t border-white/10 space-y-1">
           <Link href="/settings" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-[color:var(--color-sidebar-text-muted)] hover:bg-white/5 hover:text-[color:var(--color-sidebar-text)] transition-all">
              <Settings className="h-5 w-5" /> Settings
           </Link>
           <button onClick={handleLogout} className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-red-400 hover:bg-red-400/10 hover:text-red-300 transition-all">
              <LogOut className="h-5 w-5" /> Sign Out
           </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="h-16 bg-ranch-card border-b border-ranch-border flex items-center justify-between px-8 shadow-sm">
           <div className="relative w-64 max-w-md">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 theme-text-muted" />
             <input type="text" placeholder="Search blocks, tasks..." className="theme-input w-full pl-9 pr-4 py-2 border rounded-full text-sm focus:ring-2 focus:ring-sky/40 focus:outline-none" />
           </div>
            
            <div className="flex items-center gap-4">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setNotificationsOpen((current) => !current)}
                  className="relative theme-text-muted hover:text-[color:var(--color-text-primary)] transition-colors"
                >
                  <Bell className="w-5 h-5 relative shrink-0" />
                  {unreadCount > 0 ? (
                    <span className="absolute -right-2 -top-2 min-w-5 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  ) : null}
                </button>

                {notificationsOpen ? (
                  <div className="absolute right-0 z-20 mt-3 w-96 rounded-lg border border-ranch-border bg-white p-4 shadow-xl">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h2 className="text-sm font-semibold text-gray-900">Notifications</h2>
                        <p className="text-xs text-gray-500">
                          {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleMarkAllRead()}
                        disabled={unreadCount === 0}
                        className="text-xs font-semibold text-sky-700 disabled:cursor-not-allowed disabled:text-gray-400"
                      >
                        Mark all read
                      </button>
                    </div>

                    <div className="mt-4 max-h-96 space-y-3 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="rounded-lg bg-gray-50 px-3 py-6 text-sm text-gray-500">
                          No active notifications right now.
                        </div>
                      ) : (
                        notifications.map((notification) => (
                          <div
                            key={notification.id}
                            className={`rounded-lg border px-3 py-3 ${
                              notification.readAt ? 'border-ranch-border bg-white' : 'border-sky-200 bg-sky-50'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="space-y-1">
                                <p className="text-sm font-semibold text-gray-900">{notification.titleEn}</p>
                                <p className="text-xs text-gray-600">{notification.bodyEn}</p>
                                <div className="flex flex-wrap gap-2 text-[11px] text-gray-500">
                                  <span>{formatNotificationDate(notification.createdAt)}</span>
                                  <span className="capitalize">{notification.sourceCategory}</span>
                                  {notification.metadata?.blockName ? (
                                    <span>{String(notification.metadata.blockName)}</span>
                                  ) : null}
                                </div>
                              </div>
                              {!notification.readAt ? (
                                <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-sky-500" />
                              ) : null}
                            </div>

                            <div className="mt-3 flex items-center justify-between gap-2">
                              <Link href="/intelligence" className="text-xs font-semibold text-sky-700">
                                Open intelligence
                              </Link>
                              <div className="flex items-center gap-3">
                                {!notification.readAt ? (
                                  <button
                                    type="button"
                                    onClick={() => void handleNotificationAction(notification.id, 'read')}
                                    disabled={notificationActionId === notification.id}
                                    className="text-xs font-semibold text-gray-600 disabled:text-gray-400"
                                  >
                                    Mark read
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => void handleNotificationAction(notification.id, 'unread')}
                                    disabled={notificationActionId === notification.id}
                                    className="text-xs font-semibold text-gray-600 disabled:text-gray-400"
                                  >
                                    Mark unread
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => void handleNotificationAction(notification.id, 'archive')}
                                  disabled={notificationActionId === notification.id}
                                  className="text-xs font-semibold text-gray-600 disabled:text-gray-400"
                                >
                                  Clear
                                </button>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
              <span className="h-6 border-l mx-2 theme-border"></span>
              <div className="w-8 h-8 rounded-full bg-leaf text-white flex items-center justify-center font-bold text-sm">JS</div>
            </div>
        </header>

        {/* Scalable Container */}
        <div className="flex-1 overflow-y-auto bg-ranch-bg">
           {children}
        </div>
      </main>
    </div>
  );
}
