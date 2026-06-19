export type OrgStreamEvent =
  | {
      type: 'intelligence_updated';
      orgId: string;
      publishedAt?: string;
      reason?: string;
      includeEnvironmental?: boolean;
    }
  | {
      type: 'notifications_updated';
      orgId: string;
      publishedAt?: string;
      activeCount?: number;
      unreadCount?: number;
      reason?: string;
      deliverySummary?: {
        pending?: number;
        deferred?: number;
        sent?: number;
        failed?: number;
        canceled?: number;
        receiptConfirmed?: number;
        sentAwaitingReceipt?: number;
        recipients?: number;
        pushConfiguredProfiles?: number;
      };
    }
  | {
      type: string;
      [key: string]: unknown;
    };

export type OrgStreamConnectionState = 'connecting' | 'live' | 'polling';

type OrgEventSubscriptionOptions = {
  pollIntervalMs?: number;
  reconnectIntervalMs?: number;
  onPollingFallback?: () => void | Promise<void>;
  onConnectionChange?: (state: OrgStreamConnectionState) => void;
};

export function subscribeToOrgEvents(
  orgId: string,
  onEvent: (event: OrgStreamEvent) => void,
  options: OrgEventSubscriptionOptions = {},
) {
  const pollIntervalMs = options.pollIntervalMs ?? 30_000;
  const reconnectIntervalMs = options.reconnectIntervalMs ?? 45_000;
  let closed = false;
  let stream: EventSource | null = null;
  let pollTimer: number | null = null;
  let reconnectTimer: number | null = null;
  let currentState: OrgStreamConnectionState = 'connecting';

  const setConnectionState = (state: OrgStreamConnectionState) => {
    if (currentState === state) {
      return;
    }

    currentState = state;
    options.onConnectionChange?.(state);
  };

  const clearReconnectTimer = () => {
    if (reconnectTimer !== null) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const clearPollTimer = () => {
    if (pollTimer !== null) {
      window.clearInterval(pollTimer);
      pollTimer = null;
    }
  };

  const runPollingFallback = async () => {
    try {
      await options.onPollingFallback?.();
    } catch {
      // Best-effort polling fallback.
    }
  };

  const scheduleReconnect = () => {
    clearReconnectTimer();
    reconnectTimer = window.setTimeout(() => {
      if (!closed) {
        connect();
      }
    }, reconnectIntervalMs);
  };

  const startPollingFallback = () => {
    if (closed) {
      return;
    }

    if (pollTimer === null) {
      void runPollingFallback();
      pollTimer = window.setInterval(() => {
        void runPollingFallback();
      }, pollIntervalMs);
    }

    setConnectionState('polling');
    scheduleReconnect();
  };

  const stopPollingFallback = () => {
    clearPollTimer();
    clearReconnectTimer();
  };

  const connect = () => {
    if (closed) {
      return;
    }

    stream?.close();
    setConnectionState(pollTimer === null ? 'connecting' : currentState);

    const nextStream = new EventSource(`/api/v1/events/${encodeURIComponent(orgId)}`, {
      withCredentials: true,
    });

    nextStream.onopen = () => {
      stream = nextStream;
      stopPollingFallback();
      setConnectionState('live');
    };

    nextStream.onmessage = (message) => {
      if (!message.data || message.data === 'ping') {
        return;
      }

      try {
        const payload = JSON.parse(message.data) as OrgStreamEvent;
        onEvent(payload);
      } catch {
        // Ignore malformed best-effort stream events.
      }
    };

    nextStream.onerror = () => {
      nextStream.close();

      if (stream === nextStream) {
        stream = null;
      }

      if (!closed) {
        startPollingFallback();
      }
    };
  };

  setConnectionState('connecting');
  connect();

  return () => {
    closed = true;
    clearPollTimer();
    clearReconnectTimer();
    stream?.close();
    stream = null;
  };
}
