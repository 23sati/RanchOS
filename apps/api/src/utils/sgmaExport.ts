export type SgmaExportRow = {
  ranchName: string;
  ranchCounty: string | null;
  blockName: string;
  cropType: string;
  variety: string;
  acreage: number | null;
  waterDistrict: string | null;
  gsaName: string | null;
  isOrganic: boolean;
  cimisStationName: string | null;
  completedEvents: number;
  missingAppliedDataEvents: number;
  totalAppliedDepthInches: number | null;
  totalAppliedAcreFeet: number | null;
  estimatedCropEtDepthInches: number | null;
  estimatedCropEtAcreFeet: number | null;
  netAppliedMinusEstimatedEtAcreFeet: number | null;
  latestIrrigationDate: string | null;
  latestEtDate: string | null;
};

function escapeCsv(value: string | number | boolean | null | undefined) {
  if (value === null || value === undefined) {
    return '';
  }

  const stringValue = String(value);
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

function formatNumber(value: number | null | undefined, digits = 4) {
  if (value === null || value === undefined) {
    return null;
  }

  return value.toFixed(digits);
}

export function buildSgmaCsv(input: {
  scopeLabel: string;
  startDate: string;
  endDate: string;
  generatedAt: string;
  rows: SgmaExportRow[];
  totals: {
    activeBlocks: number;
    completedEvents: number;
    missingAppliedDataEvents: number;
    totalAppliedAcreFeet: number | null;
    totalEstimatedCropEtAcreFeet: number | null;
    netAppliedMinusEstimatedEtAcreFeet: number | null;
  };
}) {
  const csvRows = [
    [
      'Scope',
      'Start Date',
      'End Date',
      'Generated At',
      'Ranch',
      'County',
      'Block',
      'Crop',
      'Variety',
      'Acres',
      'Water District',
      'GSA',
      'Organic',
      'CIMIS Station',
      'Completed Events',
      'Missing Applied Data Events',
      'Applied Depth (in)',
      'Applied Volume (acre-ft)',
      'Estimated Crop ET (in)',
      'Estimated Crop ET Volume (acre-ft)',
      'Net Applied Minus ET (acre-ft)',
      'Latest Irrigation Date',
      'Latest ET Date',
    ],
    ...input.rows.map((row) => [
      input.scopeLabel,
      input.startDate,
      input.endDate,
      input.generatedAt,
      row.ranchName,
      row.ranchCounty,
      row.blockName,
      row.cropType,
      row.variety,
      formatNumber(row.acreage, 2),
      row.waterDistrict,
      row.gsaName,
      row.isOrganic ? 'yes' : 'no',
      row.cimisStationName,
      row.completedEvents,
      row.missingAppliedDataEvents,
      formatNumber(row.totalAppliedDepthInches, 4),
      formatNumber(row.totalAppliedAcreFeet, 4),
      formatNumber(row.estimatedCropEtDepthInches, 4),
      formatNumber(row.estimatedCropEtAcreFeet, 4),
      formatNumber(row.netAppliedMinusEstimatedEtAcreFeet, 4),
      row.latestIrrigationDate,
      row.latestEtDate,
    ]),
    [
      input.scopeLabel,
      input.startDate,
      input.endDate,
      input.generatedAt,
      'TOTALS',
      '',
      `${input.totals.activeBlocks} active blocks`,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      input.totals.completedEvents,
      input.totals.missingAppliedDataEvents,
      '',
      formatNumber(input.totals.totalAppliedAcreFeet, 4),
      '',
      formatNumber(input.totals.totalEstimatedCropEtAcreFeet, 4),
      formatNumber(input.totals.netAppliedMinusEstimatedEtAcreFeet, 4),
      '',
      '',
    ],
  ];

  return `${csvRows.map((row) => row.map((value) => escapeCsv(value)).join(',')).join('\n')}\n`;
}
