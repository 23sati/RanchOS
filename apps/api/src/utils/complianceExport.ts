type ComplianceExportRow = {
  ranchName: string;
  ranchCounty: string | null;
  ranchAddress: string | null;
  blockName: string | null;
  cropType: string | null;
  variety: string | null;
  applicatorName: string | null;
  applicatorLicense: string | null;
  productName: string | null;
  epaRegNumber: string | null;
  cdfaRegNumber: string | null;
  dprProductId: string | null;
  recordType: string | null;
  appliedDate: string | null;
  appliedStartTime: string | null;
  appliedEndTime: string | null;
  acresTreated: string | null;
  ratePerAcre: string | null;
  rateUnit: string | null;
  totalProductUsed: string | null;
  totalProductUnit: string | null;
  waterVolumeGpa: string | null;
  windSpeedMph: string | null;
  windDirection: string | null;
  tempF: string | null;
  targetPest: string | null;
  reiExpiry: string | Date | null;
  phiExpiry: string | Date | null;
  organicBlock: boolean;
  omriConfirmed: boolean;
  certifierNotified: boolean;
  equipmentUsed: string | null;
  verifiedBy: string | null;
  verifiedAt: string | Date | null;
  notes: string | null;
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

function formatCsvDate(value: string | Date | null | undefined) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return value;
}

export function buildComplianceDprCsv(rows: ComplianceExportRow[]) {
  const csvRows = [
    [
      'Ranch',
      'County',
      'Address',
      'Block',
      'Crop',
      'Variety',
      'Applicator',
      'Applicator License',
      'Product',
      'EPA Reg No',
      'CDFA Reg No',
      'DPR Product ID',
      'Record Type',
      'Applied Date',
      'Start Time',
      'End Time',
      'Acres Treated',
      'Rate Per Acre',
      'Rate Unit',
      'Total Product Used',
      'Total Product Unit',
      'Water Volume GPA',
      'Wind Speed MPH',
      'Wind Direction',
      'Temperature F',
      'Target Pest',
      'REI Expiry',
      'PHI Expiry',
      'Verified',
      'Organic Block',
      'OMRI Confirmed',
      'Certifier Notified',
      'Equipment',
      'Verified By',
      'Verified At',
      'Notes',
    ],
    ...rows.map((row) => [
      row.ranchName,
      row.ranchCounty,
      row.ranchAddress,
      row.blockName,
      row.cropType,
      row.variety,
      row.applicatorName,
      row.applicatorLicense,
      row.productName,
      row.epaRegNumber,
      row.cdfaRegNumber,
      row.dprProductId,
      row.recordType,
      row.appliedDate,
      row.appliedStartTime,
      row.appliedEndTime,
      row.acresTreated,
      row.ratePerAcre,
      row.rateUnit,
      row.totalProductUsed,
      row.totalProductUnit,
      row.waterVolumeGpa,
      row.windSpeedMph,
      row.windDirection,
      row.tempF,
      row.targetPest,
      formatCsvDate(row.reiExpiry),
      formatCsvDate(row.phiExpiry),
      row.verifiedAt ? 'yes' : 'no',
      row.organicBlock ? 'yes' : 'no',
      row.omriConfirmed ? 'yes' : 'no',
      row.certifierNotified ? 'yes' : 'no',
      row.equipmentUsed,
      row.verifiedBy,
      formatCsvDate(row.verifiedAt),
      row.notes,
    ]),
  ];

  return `${csvRows.map((row) => row.map((value) => escapeCsv(value)).join(',')).join('\n')}\n`;
}
