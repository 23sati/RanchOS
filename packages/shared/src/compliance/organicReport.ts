import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface OrganicBlockReportRow {
  blockName: string;
  acreage: string;
  apn: string;
  certifiedSince: string;
}

export interface OrganicInputLogRow {
  dateApplied: string;
  blockName: string;
  productName: string;
  omriStatus: string;
  applicatorName: string;
  rate: string;
  totalUsed: string;
  notes: string;
}

export interface OrganicReportOptions {
  operationName: string;
  certifierName: string;
  reportLabel: string;
}

export function buildOrganicInputLogPdf(
  options: OrganicReportOptions,
  blocks: OrganicBlockReportRow[],
  inputs: OrganicInputLogRow[],
) {
  const doc = new jsPDF('p', 'mm', 'a4');

  doc.setFillColor(220, 252, 231);
  doc.rect(14, 10, 182, 18, 'F');
  doc.setFontSize(18);
  doc.setTextColor(22, 101, 52);
  doc.text('Organic Input Compliance Log', 18, 21);
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  doc.text(`Operation: ${options.operationName}`, 14, 34);
  doc.text(`Certifier: ${options.certifierName}`, 14, 40);
  doc.text(`Period: ${options.reportLabel}`, 14, 46);

  autoTable(doc, {
    startY: 54,
    head: [['Organic Block', 'Acreage', 'APN', 'Certified Since']],
    body: blocks.map((block) => [
      block.blockName,
      block.acreage,
      block.apn,
      block.certifiedSince,
    ]),
    theme: 'grid',
    headStyles: { fillColor: [61, 122, 79], textColor: 255, fontSize: 8 },
    bodyStyles: { fontSize: 7.5 },
    margin: { left: 14, right: 14 },
  });

  const blocksTableBottom = (doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 80;
  doc.setFontSize(11);
  doc.text('Input activity on organic blocks', 14, blocksTableBottom + 10);

  autoTable(doc, {
    startY: blocksTableBottom + 14,
    head: [[
      'Date',
      'Block',
      'Product',
      'OMRI / Organic Status',
      'Applicator',
      'Rate',
      'Total Used',
      'Notes',
    ]],
    body: inputs.map((input) => [
      input.dateApplied,
      input.blockName,
      input.productName,
      input.omriStatus,
      input.applicatorName,
      input.rate,
      input.totalUsed,
      input.notes,
    ]),
    theme: 'grid',
    headStyles: { fillColor: [61, 122, 79], textColor: 255, fontSize: 8 },
    bodyStyles: { fontSize: 7, cellPadding: 2 },
    styles: { overflow: 'linebreak' },
    margin: { left: 14, right: 14 },
  });

  return doc.output('arraybuffer');
}
