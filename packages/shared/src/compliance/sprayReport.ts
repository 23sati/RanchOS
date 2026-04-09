import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface SprayRecord {
  date: string;
  county: string;
  blockName: string;
  commodity: string;
  pest: string;
  totalAcres: number;
  acresTreated: number;
  productName: string;
  epaReg: string;
  ratePerAc: string;
  totalUsed: string;
  applicator: string;
  startTime: string;
  endTime: string;
}

export function generateDPRSprayReport(orgName: string, records: SprayRecord[]) {
  const doc = new jsPDF('l', 'mm', 'a4'); // Landscape

  // Header 
  doc.setFontSize(16);
  doc.text('Pesticide Use Report - California DPR Format', 14, 15);
  doc.setFontSize(10);
  doc.text(`Grower/Entity: ${orgName}`, 14, 22);
  doc.text(`Generated Date: ${new Date().toLocaleDateString()}`, 240, 22);

  const tableData = records.map(r => [
    r.date,
    r.county,
    r.blockName,
    r.commodity,
    r.pest,
    r.acresTreated,
    r.productName,
    r.epaReg,
    r.ratePerAc,
    r.totalUsed,
    r.applicator,
    r.startTime,
    r.endTime
  ]);

  autoTable(doc, {
    startY: 30,
    head: [['Date', 'County', 'Block', 'Crop', 'Pest', 'Acres', 'Product', 'EPA Reg #', 'Rate/Ac', 'Total', 'Applicator', 'Start', 'End']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [61, 122, 79], textColor: 255, fontSize: 8 },
    bodyStyles: { fontSize: 7 },
    columnStyles: {
      0: { cellWidth: 15 },
      1: { cellWidth: 15 },
      2: { cellWidth: 20 },
      6: { cellWidth: 30 },
      7: { cellWidth: 20 },
    }
  });

  // Footer for signature
  const finalY = (doc as any).lastAutoTable.finalY + 15;
  doc.line(14, finalY, 100, finalY);
  doc.text('Authorized Signature', 14, finalY + 5);
  doc.line(120, finalY, 150, finalY);
  doc.text('Date signed', 120, finalY + 5);

  return doc.output('blob');
}
