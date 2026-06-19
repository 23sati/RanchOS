'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Brain, Bug, CheckCircle2, Droplet, ShieldAlert, X } from 'lucide-react';
import { fetchOnboardingStatus, OnboardingStatus } from '@/lib/onboarding';
import { formatBlockCropLabel } from '@/lib/blocks';
import {
  IntelligenceDashboardPayload,
  IntelligenceRecommendationRecord,
  buildIntelligenceSummary,
  fetchIntelligenceDashboard,
  formatRecommendationDate,
  formatRecommendationTypeLabel,
  formatRecommendationUrgencyLabel,
  subscribeToOrgEvents,
  updateRecommendationStatus,
} from '@/lib/intelligence';

const emptyDashboard: IntelligenceDashboardPayload = {
  generatedAt: '',
  blocks: [],
  recommendations: [],
  summary: {
    total: 0,
    urgent: 0,
    warning: 0,
    suggestion: 0,
    info: 0,
    blocksFlagged: 0,
    taskAlerts: 0,
    pestAlerts: 0,
    irrigationAlerts: 0,
    complianceAlerts: 0,
    seasonalAlerts: 0,
  },
};

function urgencyClasses(urgency: IntelligenceRecommendationRecord['urgency']) {
  if (urgency === 'urgent') {
    return 'bg-red-100 text-red-800';
  }

  if (urgency === 'warning') {
    return 'bg-amber-100 text-amber-800';
  }

  if (urgency === 'suggestion') {
    return 'bg-sky-100 text-sky-800';
  }

  return 'bg-gray-100 text-gray-700';
}

function sourceClasses(sourceCategory: IntelligenceRecommendationRecord['sourceCategory']) {
  if (sourceCategory === 'pest') {
    return 'bg-orange-50 text-orange-700';
  }

  if (sourceCategory === 'irrigation') {
    return 'bg-cyan-50 text-cyan-700';
  }

  if (sourceCategory === 'compliance') {
    return 'bg-emerald-50 text-emerald-700';
  }

  if (sourceCategory === 'seasonal') {
    return 'bg-violet-50 text-violet-700';
  }

  return 'bg-slate-50 text-slate-700';
}

function MetricCard({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return (
    <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">{label}</p>
      <h2 className="mt-2 text-3xl font-bold text-gray-900">{value}</h2>
      <p className="mt-1 text-sm text-gray-500">{detail}</p>
    </div>
  );
}

export default function IntelligencePage() {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [dashboard, setDashboard] = useState<IntelligenceDashboardPayload>(emptyDashboard);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [pendingActionId, setPendingActionId] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      try {
        const onboardingStatus = await fetchOnboardingStatus();
        if (cancelled) return;

        setStatus(onboardingStatus);
        if (!onboardingStatus.ranch?.id) {
          return;
        }

        const payload = await fetchIntelligenceDashboard(onboardingStatus.ranch.id);
        if (cancelled) return;
        setDashboard(payload);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Unable to load intelligence workspace.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadData();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!status?.profile?.orgId || !status.ranch?.id) {
      return;
    }

    let cancelled = false;
    let refreshInFlight = false;

    const refreshDashboard = async () => {
      if (refreshInFlight) {
        return;
      }

      refreshInFlight = true;
      setRefreshing(true);

      try {
        const payload = await fetchIntelligenceDashboard(status.ranch!.id);
        if (!cancelled) {
          setDashboard(payload);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Unable to refresh intelligence workspace.');
        }
      } finally {
        refreshInFlight = false;
        if (!cancelled) {
          setRefreshing(false);
        }
      }
    };

    const unsubscribe = subscribeToOrgEvents(status.profile.orgId, (event) => {
      if (event.type !== 'intelligence_updated') {
        return;
      }

      void refreshDashboard();
    }, {
      onPollingFallback: async () => {
        await refreshDashboard();
      },
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [status?.profile?.orgId, status?.ranch?.id]);

  const summary = useMemo(
    () => buildIntelligenceSummary(dashboard.recommendations),
    [dashboard.recommendations],
  );

  const handleRecommendationAction = async (
    recommendationId: string,
    action: 'dismiss' | 'act',
  ) => {
    setPendingActionId(recommendationId);
    setErrorMessage('');

    try {
      await updateRecommendationStatus(recommendationId, action);
      setDashboard((current) => ({
        ...current,
        recommendations: current.recommendations.filter(
          (recommendation) => recommendation.id !== recommendationId,
        ),
      }));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update recommendation.');
    } finally {
      setPendingActionId('');
    }
  };

  if (loading) {
    return <div className="p-6 text-sm text-gray-600">Loading intelligence workspace...</div>;
  }

  if (!status?.ranch) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900">No ranch available yet</h1>
          <p className="mt-2 text-sm text-gray-600">Finish onboarding before reviewing live recommendations.</p>
          <Link
            href="/onboarding"
            className="mt-4 inline-flex rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
          >
            Return to onboarding
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 p-8 animate-fade-in">
      <div className="flex flex-col gap-4 rounded-2xl border border-ranch-border bg-white p-6 shadow-sm lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gray-500">Intelligence</p>
          <h1 className="text-3xl font-bold text-gray-900">{status.ranch.name} recommendations</h1>
          <p className="text-sm text-gray-600">
            Live operational signals built from tasks, scouting, irrigation, and compliance data already in RanchOS.
          </p>
        </div>
        <div className="flex gap-3">
          <div className="rounded-xl border px-4 py-3 text-sm text-gray-700">
            <div className="font-semibold text-gray-900">{summary.blocksFlagged}</div>
            <div>Blocks flagged</div>
          </div>
          <div className="rounded-xl border px-4 py-3 text-sm text-gray-700">
            <div className="font-semibold text-gray-900">{summary.total}</div>
            <div>Active recommendations</div>
          </div>
        </div>
      </div>

      {errorMessage ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-6">
        <MetricCard label="Urgent" value={summary.urgent} detail="Needs same-day follow-up" />
        <MetricCard label="Warning" value={summary.warning} detail="Needs near-term review" />
        <MetricCard label="Task pressure" value={summary.taskAlerts} detail="Backlog or due-date risk" />
        <MetricCard label="Pest pressure" value={summary.pestAlerts} detail="Recent scouting escalation" />
        <MetricCard label="Water + compliance" value={summary.irrigationAlerts + summary.complianceAlerts} detail="Irrigation or record attention" />
        <MetricCard label="Seasonal timing" value={summary.seasonalAlerts} detail="ET and degree-day timing" />
      </div>

      {dashboard.blocks.length === 0 ? (
        <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-gray-900">Create your first block to unlock recommendations</h2>
          <p className="mt-2 text-sm text-gray-600">
            Intelligence starts once RanchOS has live block, task, scouting, irrigation, or compliance data to reason over.
          </p>
          <Link
            href="/blocks/new"
            className="mt-4 inline-flex rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
          >
            Create first block
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-ranch-border bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-ranch-border bg-gray-50 px-6 py-4">
              <div className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-gray-500" />
                <h2 className="font-semibold text-gray-900">Live recommendations</h2>
              </div>
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-gray-500">
                {refreshing ? 'Refreshing live...' : `Refreshed ${formatRecommendationDate(dashboard.generatedAt)}`}
              </p>
            </div>

            <div className="divide-y">
              {dashboard.recommendations.length === 0 ? (
                <div className="px-6 py-10 text-sm text-gray-600">
                  No active recommendations right now. As tasks, scouting logs, irrigation events, and application records accumulate, this page will surface the next places to focus.
                </div>
              ) : (
                dashboard.recommendations.map((recommendation) => (
                  <div key={recommendation.id} className="space-y-4 px-6 py-5">
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-semibold text-gray-900">{recommendation.titleEn}</h3>
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${urgencyClasses(recommendation.urgency)}`}
                          >
                            {formatRecommendationUrgencyLabel(recommendation.urgency)}
                          </span>
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${sourceClasses(recommendation.sourceCategory)}`}
                          >
                            {formatRecommendationTypeLabel(recommendation.recommendationType)}
                          </span>
                        </div>
                        <p className="text-sm text-gray-700">{recommendation.bodyEn}</p>
                        <div className="flex flex-wrap gap-2 text-sm text-gray-600">
                          {recommendation.block ? (
                            <span className="rounded-full bg-gray-100 px-3 py-1">
                              {recommendation.block.name} / {formatBlockCropLabel(recommendation.block.cropType)}
                              {recommendation.block.variety ? ` / ${recommendation.block.variety}` : ''}
                            </span>
                          ) : null}
                          {recommendation.block?.isOrganic ? (
                            <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">
                              Organic block
                            </span>
                          ) : null}
                          <span className="rounded-full bg-gray-100 px-3 py-1">
                            Logged {formatRecommendationDate(recommendation.createdAt)}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void handleRecommendationAction(recommendation.id, 'act')}
                          disabled={pendingActionId === recommendation.id}
                          className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          {pendingActionId === recommendation.id ? 'Saving...' : 'Mark acted'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleRecommendationAction(recommendation.id, 'dismiss')}
                          disabled={pendingActionId === recommendation.id}
                          className="inline-flex items-center gap-2 rounded-lg border border-ranch-border bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <X className="h-4 w-4" />
                          Dismiss
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="space-y-8">
            <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
              <h2 className="font-semibold text-gray-900">Signal mix</h2>
              <div className="mt-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 rounded-xl border border-ranch-border bg-gray-50 p-4">
                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                      <AlertTriangle className="h-5 w-5" />
                    </div>
                    <p className="mt-3 text-xl font-bold text-gray-900">{summary.warning + summary.urgent}</p>
                    <p className="text-sm text-gray-600">Priority follow-up items</p>
                  </div>
                  <div className="rounded-xl border border-ranch-border bg-gray-50 p-4">
                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                      <Droplet className="h-5 w-5" />
                    </div>
                    <p className="mt-3 text-xl font-bold text-gray-900">{summary.irrigationAlerts}</p>
                    <p className="text-sm text-gray-600">Irrigation gaps</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-xl border border-ranch-border bg-gray-50 p-4">
                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100 text-orange-700">
                      <Bug className="h-5 w-5" />
                    </div>
                    <p className="mt-3 text-xl font-bold text-gray-900">{summary.pestAlerts}</p>
                    <p className="text-sm text-gray-600">Scouting escalations</p>
                  </div>
                  <div className="rounded-xl border border-ranch-border bg-gray-50 p-4">
                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                      <ShieldAlert className="h-5 w-5" />
                    </div>
                    <p className="mt-3 text-xl font-bold text-gray-900">{summary.complianceAlerts}</p>
                    <p className="text-sm text-gray-600">Compliance holds</p>
                  </div>
                  <div className="rounded-xl border border-ranch-border bg-gray-50 p-4">
                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
                      <Brain className="h-5 w-5" />
                    </div>
                    <p className="mt-3 text-xl font-bold text-gray-900">{summary.seasonalAlerts}</p>
                    <p className="text-sm text-gray-600">Seasonal timing</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
              <h2 className="font-semibold text-gray-900">Recommended next moves</h2>
              <div className="mt-5 space-y-3 text-sm text-gray-600">
                <p>Keep block assignments current on tasks so workload signals stay grounded in the ranch map.</p>
                <p>Log scouting ratings at the block level to sharpen pest-action recommendations.</p>
                <p>Add irrigation config and events to move from setup reminders into ET-aware water alerts.</p>
                <p>Keep CIMIS and degree-day data flowing so seasonal timing recommendations stay useful.</p>
                <p>Keep application records complete so REI, PHI, and organic handling warnings stay honest.</p>
              </div>
            </div>

            <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-800">
              This slice now uses current DB records plus ET and degree-day history. It still stops short of future-weather forecasting or automated outbound notifications.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
