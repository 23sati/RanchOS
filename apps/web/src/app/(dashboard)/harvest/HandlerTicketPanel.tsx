'use client';

import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import {
  HandlerTicketFormValues,
  HandlerTicketImportRecord,
  HarvestEventRecord,
  createHandlerTicketImport,
  defaultHandlerTicketFormValues,
  formatHandlerTicketStatus,
  formatHarvestCurrency,
  formatHarvestDate,
  formatHarvestNumber,
  handlerTicketImportToFormValues,
  handlerTicketStatusOptions,
  updateHandlerTicketImport,
} from '@/lib/harvest';

type HandlerTicketPanelProps = {
  handlerTicketImports: HandlerTicketImportRecord[];
  harvestEvents: HarvestEventRecord[];
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
  scopeNote?: string | null;
};

function getStatusClasses(status: HandlerTicketImportRecord['status']) {
  switch (status) {
    case 'matched':
      return 'bg-emerald-100 text-emerald-800';
    case 'discrepancy':
      return 'bg-amber-100 text-amber-800';
    default:
      return 'bg-red-100 text-red-800';
  }
}

function eventOptionLabel(event: HarvestEventRecord) {
  return `${formatHarvestDate(event.harvestDate)} / ${event.block?.name ?? 'Block'}${
    event.loadTicket ? ` / Ticket ${event.loadTicket}` : ''
  }`;
}

function mapTicketDrafts(records: HandlerTicketImportRecord[]) {
  return Object.fromEntries(records.map((record) => [record.id, handlerTicketImportToFormValues(record)]));
}

export function HandlerTicketPanel({
  handlerTicketImports,
  harvestEvents,
  onChanged,
  onError,
  onSuccess,
  scopeNote,
}: HandlerTicketPanelProps) {
  const [ticketFormValues, setTicketFormValues] = useState<HandlerTicketFormValues>(defaultHandlerTicketFormValues());
  const [ticketDrafts, setTicketDrafts] = useState<Record<string, HandlerTicketFormValues>>({});
  const [savingTicket, setSavingTicket] = useState(false);
  const [reconcilingTicketId, setReconcilingTicketId] = useState<string | null>(null);

  useEffect(() => {
    setTicketDrafts(mapTicketDrafts(handlerTicketImports));
  }, [handlerTicketImports]);

  const resetTicketForm = () => {
    setTicketFormValues(defaultHandlerTicketFormValues());
  };

  const handleTicketSubmit = async () => {
    setSavingTicket(true);
    onError('');
    onSuccess('');

    try {
      await createHandlerTicketImport(ticketFormValues);
      await onChanged();
      resetTicketForm();
      onSuccess('Handler ticket imported.');
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Unable to import handler ticket.');
    } finally {
      setSavingTicket(false);
    }
  };

  const handleTicketDraftChange = (id: string, updater: (current: HandlerTicketFormValues) => HandlerTicketFormValues) => {
    setTicketDrafts((current) => ({
      ...current,
      [id]: updater(current[id] ?? defaultHandlerTicketFormValues()),
    }));
  };

  const handleTicketReconcile = async (record: HandlerTicketImportRecord) => {
    const values = ticketDrafts[record.id] ?? handlerTicketImportToFormValues(record);
    setReconcilingTicketId(record.id);
    onError('');
    onSuccess('');

    try {
      await updateHandlerTicketImport(record.id, values);
      await onChanged();
      onSuccess('Handler ticket reconciliation updated.');
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Unable to reconcile handler ticket.');
    } finally {
      setReconcilingTicketId(null);
    }
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
      <div className="rounded-2xl border border-ranch-border bg-white shadow-sm">
        <div className="border-b border-ranch-border bg-gray-50 px-6 py-4">
          <h2 className="font-semibold text-gray-900">Import handler ticket</h2>
          <p className="mt-1 text-sm text-gray-500">Bring in the handler-side record, auto-match by load ticket when possible, then work the exceptions below.</p>
          {scopeNote ? <p className="mt-2 text-xs font-medium text-amber-700">{scopeNote}</p> : null}
        </div>

        <div className="grid gap-4 p-6 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-semibold text-gray-900">Handler name</span>
            <input type="text" value={ticketFormValues.handlerName} onChange={(event) => setTicketFormValues((current) => ({ ...current, handlerName: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-gray-900">Load ticket</span>
            <input type="text" value={ticketFormValues.loadTicket} onChange={(event) => setTicketFormValues((current) => ({ ...current, loadTicket: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-gray-900">Ticket date</span>
            <input type="date" value={ticketFormValues.ticketDate} onChange={(event) => setTicketFormValues((current) => ({ ...current, ticketDate: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-gray-900">Match to harvest event</span>
            <select
              value={ticketFormValues.harvestEventId}
              onChange={(event) =>
                setTicketFormValues((current) => ({
                  ...current,
                  harvestEventId: event.target.value,
                  status:
                    event.target.value && current.status === 'unmatched'
                      ? 'matched'
                      : !event.target.value && current.status === 'matched'
                        ? 'unmatched'
                        : current.status,
                }))
              }
              className="w-full rounded-lg border border-ranch-border bg-white px-3 py-2.5 text-sm"
            >
              <option value="">Auto-match if possible</option>
              {harvestEvents.map((event) => (
                <option key={event.id} value={event.id}>
                  {eventOptionLabel(event)}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-gray-900">Net pounds</span>
            <input type="number" min="0" step="0.01" value={ticketFormValues.netPounds} onChange={(event) => setTicketFormValues((current) => ({ ...current, netPounds: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-gray-900">Gross pounds</span>
            <input type="number" min="0" step="0.01" value={ticketFormValues.grossPounds} onChange={(event) => setTicketFormValues((current) => ({ ...current, grossPounds: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-gray-900">Moisture %</span>
            <input type="number" min="0" max="100" step="0.01" value={ticketFormValues.moisturePct} onChange={(event) => setTicketFormValues((current) => ({ ...current, moisturePct: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-gray-900">Hulled weight (lbs)</span>
            <input type="number" min="0" step="0.01" value={ticketFormValues.hulledWeightLbs} onChange={(event) => setTicketFormValues((current) => ({ ...current, hulledWeightLbs: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-gray-900">Price per pound</span>
            <input type="number" min="0" step="0.0001" value={ticketFormValues.pricePerPound} onChange={(event) => setTicketFormValues((current) => ({ ...current, pricePerPound: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-gray-900">Gross value</span>
            <input type="number" min="0" step="0.01" value={ticketFormValues.grossValue} onChange={(event) => setTicketFormValues((current) => ({ ...current, grossValue: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-gray-900">Status</span>
            <select value={ticketFormValues.status} onChange={(event) => setTicketFormValues((current) => ({ ...current, status: event.target.value as HandlerTicketFormValues['status'] }))} className="w-full rounded-lg border border-ranch-border bg-white px-3 py-2.5 text-sm">
              {handlerTicketStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-semibold text-gray-900">Discrepancy notes</span>
            <textarea rows={3} value={ticketFormValues.discrepancyNotes} onChange={(event) => setTicketFormValues((current) => ({ ...current, discrepancyNotes: event.target.value }))} className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm" placeholder="Use this when handler paperwork does not line up with the field-side harvest log." />
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ranch-border px-6 py-4">
          <div className="text-sm text-gray-500">Imports auto-match by load ticket when the harvest event already exists.</div>
          <button type="button" onClick={() => void handleTicketSubmit()} disabled={savingTicket} className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60">
            <Save className="h-4 w-4" />
            {savingTicket ? 'Importing...' : 'Import handler ticket'}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-ranch-border bg-white shadow-sm">
        <div className="border-b border-ranch-border bg-gray-50 px-6 py-4">
          <h2 className="font-semibold text-gray-900">Handler ticket reconciliation</h2>
          <p className="mt-1 text-sm text-gray-500">Save a match, flag a discrepancy, or leave the record open until the field and handler paperwork agree.</p>
          {scopeNote ? <p className="mt-2 text-xs font-medium text-amber-700">{scopeNote}</p> : null}
        </div>
        <div className="divide-y">
          {handlerTicketImports.length === 0 ? (
            <div className="px-6 py-8 text-sm text-gray-600">No handler tickets imported yet. Use the import form to bring in the first one.</div>
          ) : (
            handlerTicketImports.map((record) => {
              const draft = ticketDrafts[record.id] ?? handlerTicketImportToFormValues(record);

              return (
                <div key={record.id} className="space-y-4 px-6 py-5">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-lg font-semibold text-gray-900">{record.handlerName}</p>
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getStatusClasses(record.status)}`}>
                        {formatHandlerTicketStatus(record.status)}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-3 text-sm text-gray-600">
                      <span>Ticket {record.loadTicket}</span>
                      <span>{formatHarvestDate(record.ticketDate)}</span>
                      {record.netPounds ? <span>{formatHarvestNumber(record.netPounds, 0)} lbs net</span> : null}
                      {record.grossValue ? <span>{formatHarvestCurrency(record.grossValue)}</span> : null}
                    </div>
                    <div className="text-sm text-gray-600">
                      {record.harvestEvent ? (
                        <span>Matched to {eventOptionLabel(record.harvestEvent)}</span>
                      ) : (
                        <span>No harvest event linked yet.</span>
                      )}
                    </div>
                    {record.discrepancyNotes ? <p className="text-sm text-amber-800">{record.discrepancyNotes}</p> : null}
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="space-y-2">
                      <span className="text-sm font-semibold text-gray-900">Harvest event</span>
                      <select
                        value={draft.harvestEventId}
                        onChange={(event) =>
                          handleTicketDraftChange(record.id, (current) => ({
                            ...current,
                            harvestEventId: event.target.value,
                            status:
                              event.target.value && current.status === 'unmatched'
                                ? 'matched'
                                : !event.target.value && current.status === 'matched'
                                  ? 'unmatched'
                                  : current.status,
                          }))
                        }
                        className="w-full rounded-lg border border-ranch-border bg-white px-3 py-2.5 text-sm"
                      >
                        <option value="">No linked event</option>
                        {harvestEvents.map((event) => (
                          <option key={event.id} value={event.id}>
                            {eventOptionLabel(event)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-2">
                      <span className="text-sm font-semibold text-gray-900">Status</span>
                      <select
                        value={draft.status}
                        onChange={(event) =>
                          handleTicketDraftChange(record.id, (current) => ({
                            ...current,
                            status: event.target.value as HandlerTicketFormValues['status'],
                          }))
                        }
                        className="w-full rounded-lg border border-ranch-border bg-white px-3 py-2.5 text-sm"
                      >
                        {handlerTicketStatusOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-2 md:col-span-2">
                      <span className="text-sm font-semibold text-gray-900">Discrepancy notes</span>
                      <textarea
                        rows={2}
                        value={draft.discrepancyNotes}
                        onChange={(event) =>
                          handleTicketDraftChange(record.id, (current) => ({
                            ...current,
                            discrepancyNotes: event.target.value,
                          }))
                        }
                        className="w-full rounded-lg border border-ranch-border px-3 py-2.5 text-sm"
                        placeholder="Document moisture, weight, or paperwork mismatches here."
                      />
                    </label>
                  </div>

                  <div className="flex justify-end">
                    <button type="button" onClick={() => void handleTicketReconcile(record)} disabled={reconcilingTicketId === record.id} className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60">
                      <Save className="h-4 w-4" />
                      {reconcilingTicketId === record.id ? 'Saving...' : 'Save reconciliation'}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
