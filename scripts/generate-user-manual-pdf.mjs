import fs from 'node:fs';
import path from 'node:path';

import { jsPDF } from 'jspdf';

const rootDir = process.cwd();
const inputPath = path.join(rootDir, 'docs', 'RanchOS_User_Manual.md');
const outputPath = path.join(rootDir, 'docs', 'RanchOS_User_Manual.pdf');

const source = fs.readFileSync(inputPath, 'utf8').replace(/\r\n/g, '\n');
const lines = source.split('\n');

const pdf = new jsPDF({
  unit: 'pt',
  format: 'letter',
  compress: true,
});

const page = {
  width: pdf.internal.pageSize.getWidth(),
  height: pdf.internal.pageSize.getHeight(),
};

const margin = {
  top: 56,
  right: 56,
  bottom: 56,
  left: 56,
};

const contentWidth = page.width - margin.left - margin.right;
let cursorY = margin.top;

function ensureSpace(heightNeeded) {
  if (cursorY + heightNeeded <= page.height - margin.bottom) {
    return;
  }

  pdf.addPage();
  cursorY = margin.top;
}

function setFont(weight = 'normal', size = 11, color = '#1f2937') {
  pdf.setFont('helvetica', weight);
  pdf.setFontSize(size);
  pdf.setTextColor(color);
}

function drawWrappedText(text, options = {}) {
  const {
    weight = 'normal',
    size = 11,
    color = '#1f2937',
    before = 0,
    after = 10,
    indent = 0,
    lineHeight = size * 1.35,
  } = options;

  const x = margin.left + indent;
  const width = contentWidth - indent;
  const cleanText = text.trim();

  if (!cleanText) {
    cursorY += after;
    return;
  }

  setFont(weight, size, color);
  const wrapped = pdf.splitTextToSize(cleanText, width);
  const blockHeight = before + wrapped.length * lineHeight + after;
  ensureSpace(blockHeight);
  cursorY += before;

  for (const line of wrapped) {
    pdf.text(line, x, cursorY);
    cursorY += lineHeight;
  }

  cursorY += after;
}

function drawRule(before = 4, after = 14) {
  ensureSpace(before + after + 6);
  cursorY += before;
  pdf.setDrawColor('#d1d5db');
  pdf.setLineWidth(0.8);
  pdf.line(margin.left, cursorY, page.width - margin.right, cursorY);
  cursorY += after;
}

function renderHeading(level, text) {
  if (level === 1) {
    drawWrappedText(text, {
      weight: 'bold',
      size: 24,
      color: '#111827',
      before: 0,
      after: 8,
      lineHeight: 30,
    });
    drawRule(0, 18);
    return;
  }

  if (level === 2) {
    drawWrappedText(text, {
      weight: 'bold',
      size: 17,
      color: '#111827',
      before: 8,
      after: 8,
      lineHeight: 22,
    });
    return;
  }

  drawWrappedText(text, {
    weight: 'bold',
    size: 13,
    color: '#111827',
    before: 6,
    after: 6,
    lineHeight: 18,
  });
}

function renderListItem(text, marker) {
  drawWrappedText(`${marker} ${text}`, {
    size: 11,
    color: '#1f2937',
    indent: 12,
    after: 6,
    lineHeight: 15,
  });
}

for (const rawLine of lines) {
  const line = rawLine.trimEnd();

  if (!line.trim()) {
    cursorY += 4;
    continue;
  }

  const headingMatch = line.match(/^(#{1,3})\s+(.*)$/);
  if (headingMatch) {
    renderHeading(headingMatch[1].length, headingMatch[2]);
    continue;
  }

  const bulletMatch = line.match(/^-\s+(.*)$/);
  if (bulletMatch) {
    renderListItem(bulletMatch[1], '\u2022');
    continue;
  }

  const numberMatch = line.match(/^(\d+\.)\s+(.*)$/);
  if (numberMatch) {
    renderListItem(numberMatch[2], numberMatch[1]);
    continue;
  }

  drawWrappedText(line, {
    size: 11,
    color: '#1f2937',
    after: 9,
    lineHeight: 15,
  });
}

const pageCount = pdf.getNumberOfPages();
for (let pageIndex = 1; pageIndex <= pageCount; pageIndex += 1) {
  pdf.setPage(pageIndex);
  pdf.setDrawColor('#e5e7eb');
  pdf.setLineWidth(0.6);
  pdf.line(margin.left, page.height - 34, page.width - margin.right, page.height - 34);
  setFont('normal', 9, '#6b7280');
  pdf.text('RanchOS User Manual', margin.left, page.height - 20);
  pdf.text(`Page ${pageIndex} of ${pageCount}`, page.width - margin.right, page.height - 20, {
    align: 'right',
  });
}

const pdfBytes = pdf.output('arraybuffer');
fs.writeFileSync(outputPath, Buffer.from(pdfBytes));

process.stdout.write(`Generated ${path.relative(rootDir, outputPath)}\n`);
