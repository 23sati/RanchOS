import * as ExcelJS from 'exceljs';

export type CrewPayType = 'hourly' | 'piece_rate' | 'salary';

interface PayrollLine {
  crewMemberName: string;
  employeeId: string | null;
  totalHours: number;
  regHours: number;
  otHours: number;
  dtHours: number;
  grossPay: number;
}

function roundNumber(value: number, scale = 2) {
  const factor = 10 ** scale;
  return Math.round(value * factor) / factor;
}

export function calculateHoursWorked(input: {
  clockIn?: Date | null;
  clockOut?: Date | null;
  hoursWorked?: number | null;
}) {
  if (input.hoursWorked !== null && input.hoursWorked !== undefined) {
    if (!Number.isFinite(input.hoursWorked) || input.hoursWorked < 0) {
      throw new Error('Hours worked must be zero or greater.');
    }

    return roundNumber(input.hoursWorked, 2);
  }

  if (!input.clockIn && !input.clockOut) {
    return null;
  }

  if (!input.clockIn || !input.clockOut) {
    throw new Error('Provide both clock in and clock out, or leave both blank.');
  }

  const durationMs = input.clockOut.getTime() - input.clockIn.getTime();
  if (durationMs < 0) {
    throw new Error('Clock out must be after clock in.');
  }

  return roundNumber(durationMs / (1000 * 60 * 60), 2);
}

export function calculateGrossPay(input: {
  payType: CrewPayType | null;
  hourlyRate?: number | null;
  hoursWorked?: number | null;
  pieceRateQuantity?: number | null;
  pieceRatePerUnit?: number | null;
  grossPayOverride?: number | null;
}) {
  if (input.payType === 'hourly') {
    if (input.hoursWorked === null || input.hoursWorked === undefined) {
      throw new Error('Hourly labor entries need hours worked or clock times.');
    }

    if (input.hourlyRate === null || input.hourlyRate === undefined) {
      throw new Error('Hourly crew members need an hourly rate before logging labor.');
    }

    return roundNumber(input.hoursWorked * input.hourlyRate, 2);
  }

  if (input.payType === 'piece_rate') {
    if (input.pieceRateQuantity === null || input.pieceRateQuantity === undefined) {
      throw new Error('Piece-rate labor entries need a quantity.');
    }

    if (input.pieceRatePerUnit === null || input.pieceRatePerUnit === undefined) {
      throw new Error('Piece-rate labor entries need a rate per unit.');
    }

    return roundNumber(input.pieceRateQuantity * input.pieceRatePerUnit, 2);
  }

  if (input.grossPayOverride === null || input.grossPayOverride === undefined) {
    throw new Error('Salary labor entries need a gross pay amount.');
  }

  if (!Number.isFinite(input.grossPayOverride) || input.grossPayOverride < 0) {
    throw new Error('Gross pay must be zero or greater.');
  }

  return roundNumber(input.grossPayOverride, 2);
}

export async function exportPayrollToExcel(records: PayrollLine[]) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Weekly Payroll');

  worksheet.columns = [
    { header: 'Employee Name', key: 'crewMemberName', width: 25 },
    { header: 'Employee ID', key: 'employeeId', width: 15 },
    { header: 'Total Hours', key: 'totalHours', width: 12 },
    { header: 'Regular Hours', key: 'regHours', width: 15 },
    { header: 'OT Hours (1.5x)', key: 'otHours', width: 15 },
    { header: 'DT Hours (2.0x)', key: 'dtHours', width: 15 },
    { header: 'Gross Pay ($)', key: 'grossPay', width: 15 },
  ];

  // Formatting headers
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF3D7A4F' } // Ranch Leaf Green
  };
  worksheet.getRow(1).font = { color: { argb: 'FFFFFFFF' }, bold: true };

  records.forEach(r => worksheet.addRow(r));

  // Add totals row
  const totalRow = worksheet.addRow({
    crewMemberName: 'TOTALS',
    grossPay: records.reduce((sum, r) => sum + r.grossPay, 0)
  });
  totalRow.font = { bold: true };

  return await workbook.xlsx.writeBuffer();
}
