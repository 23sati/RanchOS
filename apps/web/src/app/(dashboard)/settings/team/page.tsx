'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, HardHat, Save, UserCog, Users } from 'lucide-react';
import { fetchOnboardingStatus, OnboardingStatus } from '@/lib/onboarding';
import {
  CrewMemberFormValues,
  CrewMemberRecord,
  LaborDashboardPayload,
  createCrewMember,
  crewMemberToFormValues,
  crewPayTypeOptions,
  defaultCrewMemberFormValues,
  fetchLaborDashboard,
  formatCurrency,
  formatCrewPayType,
  updateCrewMember,
} from '@/lib/labor';

const emptyDashboard: LaborDashboardPayload = {
  crewMembers: [],
  laborEntries: [],
  availableProfiles: [],
  blocks: [],
  tasks: [],
  crewPayroll: [],
  approvalQueue: [],
  summary: {
    totalCrewMembers: 0,
    activeCrewMembers: 0,
    h2aWorkers: 0,
    laborEntries: 0,
    hoursLast7Days: 0,
    grossPayLast7Days: 0,
    pendingApprovals: 0,
    approvedEntries: 0,
    pendingHours: 0,
    pendingGrossPay: 0,
    approvedGrossPay: 0,
    approvedGrossPayLast7Days: 0,
  },
};

function sortCrewMembers(records: CrewMemberRecord[]) {
  return [...records].sort((left, right) => {
    const activeDiff = Number(Boolean(right.active)) - Number(Boolean(left.active));
    return activeDiff !== 0 ? activeDiff : left.fullName.localeCompare(right.fullName);
  });
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

export default function TeamSettingsPage() {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [dashboard, setDashboard] = useState<LaborDashboardPayload>(emptyDashboard);
  const [formValues, setFormValues] = useState<CrewMemberFormValues>(defaultCrewMemberFormValues());
  const [editingCrewId, setEditingCrewId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      try {
        const [onboardingStatus, laborDashboard] = await Promise.all([
          fetchOnboardingStatus(),
          fetchLaborDashboard(),
        ]);

        if (cancelled) {
          return;
        }

        setStatus(onboardingStatus);
        setDashboard({
          ...laborDashboard,
          crewMembers: sortCrewMembers(laborDashboard.crewMembers),
        });
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Unable to load team settings.');
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

  const selectableProfiles = useMemo(() => {
    const linkedProfileIds = new Set(
      dashboard.crewMembers
        .filter((crewMember) => crewMember.id !== editingCrewId)
        .map((crewMember) => crewMember.profileId)
        .filter((value): value is string => Boolean(value)),
    );

    return dashboard.availableProfiles.filter((profile) => !linkedProfileIds.has(profile.id));
  }, [dashboard.availableProfiles, dashboard.crewMembers, editingCrewId]);

  const activeCrewMembers = dashboard.crewMembers.filter((crewMember) => crewMember.active);

  const updateDashboardCrew = (updater: (current: CrewMemberRecord[]) => CrewMemberRecord[]) => {
    setDashboard((current) => {
      const nextCrewMembers = sortCrewMembers(updater(current.crewMembers));
      return {
        ...current,
        crewMembers: nextCrewMembers,
        summary: {
          ...current.summary,
          totalCrewMembers: nextCrewMembers.length,
          activeCrewMembers: nextCrewMembers.filter((crewMember) => crewMember.active).length,
          h2aWorkers: nextCrewMembers.filter((crewMember) => crewMember.active && crewMember.h2aWorker).length,
        },
      };
    });
  };

  const resetForm = () => {
    setEditingCrewId(null);
    setFormValues(defaultCrewMemberFormValues());
  };

  const handleSubmit = async () => {
    setSaving(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      if (editingCrewId) {
        const updatedCrewMember = await updateCrewMember(editingCrewId, formValues);
        updateDashboardCrew((current) =>
          current.map((crewMember) => (crewMember.id === editingCrewId ? updatedCrewMember : crewMember)),
        );
        setSuccessMessage('Crew member updated.');
      } else {
        const createdCrewMember = await createCrewMember(formValues);
        updateDashboardCrew((current) => [...current, createdCrewMember]);
        setSuccessMessage('Crew member created.');
      }

      resetForm();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save crew member.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-sm text-gray-600">Loading team settings...</div>;
  }

  if (!status?.organization) {
    return (
      <div className="p-8">
        <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900">Finish onboarding first</h1>
          <p className="mt-2 text-sm text-gray-600">Team settings unlock after the workspace is connected to an organization.</p>
          <Link href="/onboarding" className="mt-4 inline-flex rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700">
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
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gray-500">Settings / Team</p>
          <h1 className="text-3xl font-bold text-gray-900">{status.organization.name} crew</h1>
          <p className="text-sm text-gray-600">Manage the real crew roster now, then use the labor page to log time and first payroll-ready entries.</p>
        </div>
        <Link href="/labor" className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-3 text-sm font-semibold text-white hover:bg-green-700">
          Open labor workflow
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {errorMessage ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {successMessage ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {successMessage}
        </div>
      ) : null}

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Crew" value={dashboard.summary.totalCrewMembers} detail="Rostered crew members" />
        <MetricCard label="Active" value={dashboard.summary.activeCrewMembers} detail="Available to receive labor entries" />
        <MetricCard label="H-2A" value={dashboard.summary.h2aWorkers} detail="Active H-2A crew in the roster" />
        <MetricCard label="Recent Pay" value={formatCurrency(dashboard.summary.grossPayLast7Days)} detail="Gross pay logged in the last 7 days" />
      </div>

      <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-2xl border border-ranch-border bg-white shadow-sm">
          <div className="border-b border-ranch-border bg-gray-50 px-6 py-4">
            <h2 className="font-semibold text-gray-900">{editingCrewId ? 'Edit crew member' : 'Add crew member'}</h2>
            <p className="mt-1 text-sm text-gray-500">This writes directly to the live crew table for the current organization.</p>
          </div>

          <div className="grid gap-4 p-6 md:grid-cols-2">
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-semibold text-gray-900">Full name</span>
              <input type="text" value={formValues.fullName} onChange={(event) => setFormValues((current) => ({ ...current, fullName: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-gray-900">Employee ID</span>
              <input type="text" value={formValues.employeeId} onChange={(event) => setFormValues((current) => ({ ...current, employeeId: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-gray-900">Linked app user</span>
              <select value={formValues.profileId} onChange={(event) => setFormValues((current) => ({ ...current, profileId: event.target.value }))} className="w-full rounded-lg border border-ranch-border bg-white px-3 py-2.5 text-sm">
                <option value="">No linked profile</option>
                {selectableProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.fullName} / {profile.role}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-gray-900">Phone</span>
              <input type="text" value={formValues.phone} onChange={(event) => setFormValues((current) => ({ ...current, phone: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-gray-900">Hire date</span>
              <input type="date" value={formValues.hireDate} onChange={(event) => setFormValues((current) => ({ ...current, hireDate: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" />
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-semibold text-gray-900">Position</span>
              <input type="text" value={formValues.position} onChange={(event) => setFormValues((current) => ({ ...current, position: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" placeholder="Irrigation tech, tractor operator, harvest lead" />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-gray-900">Pay type</span>
              <select value={formValues.payType} onChange={(event) => setFormValues((current) => ({ ...current, payType: event.target.value as CrewMemberFormValues['payType'] }))} className="w-full rounded-lg border border-ranch-border bg-white px-3 py-2.5 text-sm">
                {crewPayTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-gray-900">Hourly rate</span>
              <input type="number" min="0" step="0.01" value={formValues.hourlyRate} onChange={(event) => setFormValues((current) => ({ ...current, hourlyRate: event.target.value }))} disabled={formValues.payType !== 'hourly'} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm disabled:bg-gray-100" placeholder={formValues.payType === 'hourly' ? '18.50' : 'Only used for hourly crew'} />
            </label>

            <label className="flex items-center gap-3 rounded-xl border border-ranch-border px-4 py-3 text-sm text-gray-700">
              <input type="checkbox" checked={formValues.active} onChange={(event) => setFormValues((current) => ({ ...current, active: event.target.checked }))} />
              Active crew member
            </label>

            <label className="flex items-center gap-3 rounded-xl border border-ranch-border px-4 py-3 text-sm text-gray-700">
              <input type="checkbox" checked={formValues.h2aWorker} onChange={(event) => setFormValues((current) => ({ ...current, h2aWorker: event.target.checked, h2aDisclaimerAcknowledged: event.target.checked ? current.h2aDisclaimerAcknowledged : false }))} />
              H-2A worker
            </label>

            <label className="flex items-center gap-3 rounded-xl border border-ranch-border px-4 py-3 text-sm text-gray-700 md:col-span-2">
              <input type="checkbox" checked={formValues.h2aDisclaimerAcknowledged} disabled={!formValues.h2aWorker} onChange={(event) => setFormValues((current) => ({ ...current, h2aDisclaimerAcknowledged: event.target.checked }))} />
              H-2A disclaimer acknowledged
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ranch-border px-6 py-4">
            <div className="text-sm text-gray-500">
              {editingCrewId ? 'Editing the selected crew member.' : 'Create the roster first, then log work on the labor page.'}
            </div>
            <div className="flex gap-3">
              {editingCrewId ? (
                <button type="button" onClick={resetForm} className="rounded-lg border border-ranch-border px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                  Cancel
                </button>
              ) : null}
              <button type="button" onClick={() => void handleSubmit()} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60">
                <Save className="h-4 w-4" />
                {saving ? 'Saving...' : editingCrewId ? 'Update crew member' : 'Create crew member'}
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-8">
          <div className="rounded-2xl border border-ranch-border bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold text-gray-900">Roster snapshot</h2>
                <p className="mt-1 text-sm text-gray-500">Current crew tied to the real database.</p>
              </div>
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-green-50 text-green-700">
                <Users className="h-6 w-6" />
              </div>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-ranch-border bg-gray-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Active crew</p>
                <p className="mt-2 text-2xl font-bold text-gray-900">{activeCrewMembers.length}</p>
              </div>
              <div className="rounded-xl border border-ranch-border bg-gray-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Labor entries</p>
                <p className="mt-2 text-2xl font-bold text-gray-900">{dashboard.summary.laborEntries}</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-ranch-border bg-white shadow-sm">
            <div className="border-b border-ranch-border bg-gray-50 px-6 py-4">
              <h2 className="font-semibold text-gray-900">Crew list</h2>
            </div>
            <div className="divide-y">
              {dashboard.crewMembers.length === 0 ? (
                <div className="space-y-3 px-6 py-8 text-sm text-gray-600">
                  <p>No crew members yet. Add the first one to start the labor workflow.</p>
                  <Link href="/labor" className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 font-semibold text-white hover:bg-green-700">
                    Open labor page
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              ) : (
                dashboard.crewMembers.map((crewMember) => (
                  <div key={crewMember.id} className="space-y-3 px-6 py-5">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-lg font-semibold text-gray-900">{crewMember.fullName}</p>
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${crewMember.active ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-700'}`}>
                            {crewMember.active ? 'Active' : 'Inactive'}
                          </span>
                          {crewMember.h2aWorker ? <span className="inline-flex rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-800">H-2A</span> : null}
                        </div>
                        <div className="flex flex-wrap gap-3 text-sm text-gray-600">
                          <span>{formatCrewPayType(crewMember.payType)}</span>
                          {crewMember.hourlyRate ? <span>{formatCurrency(crewMember.hourlyRate)} / hour</span> : null}
                          {crewMember.position ? <span>{crewMember.position}</span> : null}
                          {crewMember.employeeId ? <span>ID {crewMember.employeeId}</span> : null}
                        </div>
                        <div className="flex flex-wrap gap-3 text-sm text-gray-500">
                          {crewMember.profile ? <span>Linked to {crewMember.profile.fullName}</span> : <span>No linked app user</span>}
                          {crewMember.phone ? <span>{crewMember.phone}</span> : null}
                          {crewMember.hireDate ? <span>Hired {crewMember.hireDate}</span> : null}
                        </div>
                      </div>

                      <button type="button" onClick={() => {
                        setEditingCrewId(crewMember.id);
                        setFormValues(crewMemberToFormValues(crewMember));
                        setSuccessMessage('');
                        setErrorMessage('');
                      }} className="inline-flex items-center gap-2 rounded-lg border border-ranch-border px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                        <UserCog className="h-4 w-4" />
                        Edit
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <div className="flex items-start gap-3">
              <HardHat className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
              <p>
                This slice stays intentionally focused: real crew roster, real labor entry linkage, and the first payroll-ready data. Mobile clock flows and deeper payroll exports stay deferred for later phases.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
