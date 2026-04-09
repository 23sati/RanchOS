import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface OrganicInput {
  date: string;
  block: string;
  product: string;
  omri: boolean;
  rate: string;
  total: string;
  notes: string;
}

export function generateCCOFOrganicReport(orgName: string, inputs: OrganicInput[]) {
  const doc = new jsPDF('p', 'mm', 'a4'); // Portrait

  // Organic Header
  doc.setFillColor(209, 250, 229); // leaf-light
  doc.rect(14, 10, 182, 20, 'F');
  doc.setFontSize(22);
  doc.setTextColor(61, 122, 79); // leaf
  doc.text('ORGANIC SYSTEM PLAN: INPUT LOG', 20, 22);

  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text(`Certifier: CCOF (California Certified Organic Farmers)`, 14, 38);
  doc.text(`Operation: ${orgName}`, 14, 44);
  doc.text(`Report Year: ${new Date().getFullYear()}`, 140, 44);

  const tableData = inputs.map(i => [
    i.date,
    i.block,
    i.product,
    i.omri ? 'YES (OMRI Verified)' : 'NO (WARNING)',
    i.rate,
    i.total,
    i.notes
  ]);

  autoTable(doc, {
    startY: 55,
    head: [['Date Applied', 'Block/Field', 'Product Name', 'OMRI Listed', 'Application Rate', 'Total Quantity', 'Notes/Batch #']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [61, 122, 79], textColor: 255, fontSize: 9 },
    bodyStyles: { fontSize: 8 },
    styles: { overflow: 'linebreak', cellPadding: 3 },
    columnStyles: {
      3: { cellWidth: 25 },
      6: { cellWidth: 40 }
    }
  });

  return doc.output('blob');
}
