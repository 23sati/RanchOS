import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface DprSprayReportRow {
  dateApplied: string;
  county: string;
  studySite: string;
  commoditySite: string;
  pest: string;
  totalAcresPlanted: string;
  totalAcresTreated: string;
  productName: string;
  epaRegNumber: string;
  amountPerAcre: string;
  totalAmountUsed: string;
  applicatorName: string;
  applicatorLicense: string;
  startTime: string;
  endTime: string;
  tempF: string;
  windSpeed: string;
  windDirection: string;
  omriListed?: string;
  certifierNotified?: string;
}

export interface DprSprayReportOptions {
  growerName: string;
  operatorName: string;
  operatorLicense?: string | null;
  reportPeriodLabel: string;
  organicOperation?: boolean;
}

export function buildDprSprayReportPdf(
  options: DprSprayReportOptions,
  rows: DprSprayReportRow[],
) {
  const doc = new jsPDF('l', 'mm', 'a4');

  doc.setFontSize(16);
  doc.text('California DPR Pesticide Use Report', 14, 15);
  doc.setFontSize(10);
  doc.text(`Grower: ${options.growerName}`, 14, 22);
  doc.text(`Operator: ${options.operatorName}`, 90, 22);
  doc.text(`License: ${options.operatorLicense ?? 'Not provided'}`, 170, 22);
  doc.text(`Period: ${options.reportPeriodLabel}`, 240, 22, { align: 'right' });

  if (options.organicOperation) {
    doc.setFillColor(220, 252, 231);
    doc.rect(14, 26, 277, 9, 'F');
    doc.setFontSize(9);
    doc.setTextColor(22, 101, 52);
    doc.text('ORGANIC OPERATION - include OMRI and certifier-notification review below', 16, 31.5);
    doc.setTextColor(0, 0, 0);
  }

  const tableHead = [[
    'Date Applied',
    'County',
    'Study Site',
    'Commodity / Site',
    'Pest',
    'Acres Planted',
    'Acres Treated',
    'Product Name',
    'EPA Reg #',
    'Amount / Acre',
    'Total Used',
    'Applicator',
    'License #',
    'Start',
    'End',
    'Temp F',
    'Wind Speed',
    'Wind Dir',
    ...(options.organicOperation ? ['OMRI', 'Certifier'] : []),
  ]];

  const body = rows.map((row) => [
    row.dateApplied,
    row.county,
    row.studySite,
    row.commoditySite,
    row.pest,
    row.totalAcresPlanted,
    row.totalAcresTreated,
    row.productName,
    row.epaRegNumber,
    row.amountPerAcre,
    row.totalAmountUsed,
    row.applicatorName,
    row.applicatorLicense,
    row.startTime,
    row.endTime,
    row.tempF,
    row.windSpeed,
    row.windDirection,
    ...(options.organicOperation ? [row.omriListed ?? '', row.certifierNotified ?? ''] : []),
  ]);

  autoTable(doc, {
    startY: options.organicOperation ? 39 : 28,
    head: tableHead,
    body,
    theme: 'grid',
    headStyles: { fillColor: [61, 122, 79], textColor: 255, fontSize: 7 },
    bodyStyles: { fontSize: 6.5, cellPadding: 1.5, valign: 'middle' },
    styles: { overflow: 'linebreak' },
    margin: { left: 10, right: 10 },
  });

  const finalY = (doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 180;
  doc.setFontSize(9);
  doc.line(16, finalY + 12, 95, finalY + 12);
  doc.text('Grower / authorized signature', 16, finalY + 17);
  doc.line(115, finalY + 12, 155, finalY + 12);
  doc.text('Date signed', 115, finalY + 17);

  return doc.output('arraybuffer');
}
