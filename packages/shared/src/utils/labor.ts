/**
 * California Agricultural Overtime Rules (AB 1066 Phased Implementation)
 * Enforces strictly 8/12 hour daily and 40 hour weekly thresholds.
 */
interface DayEntry { date: string; hoursWorked: number; }

export function calculateWeeklyPayroll(entries: DayEntry[], hourlyRate: number) {
  let weeklyRegularHours = 0;
  let totalGrossPay = 0;
  
  const dailySummary = entries.map(day => {
    let reg = 0;
    let ot = 0;
    let dt = 0;
    const h = day.hoursWorked;

    // Daily Tiers
    if (h <= 8) {
      reg = h;
    } else if (h <= 12) {
      reg = 8;
      ot = h - 8;
    } else {
      reg = 8;
      ot = 4;
      dt = h - 12;
    }

    // Weekly Threshold Spillover
    if (weeklyRegularHours < 40 && (weeklyRegularHours + reg) > 40) {
      const over = (weeklyRegularHours + reg) - 40;
      reg -= over;
      ot += over;
    } else if (weeklyRegularHours >= 40) {
      ot += reg;
      reg = 0;
    }

    weeklyRegularHours += (reg);
    
    const dayPay = (reg * hourlyRate) + (ot * hourlyRate * 1.5) + (dt * hourlyRate * 2);
    totalGrossPay += dayPay;

    return { date: day.date, reg, ot, dt, pay: dayPay };
  });

  return { dailySummary, totalGrossPay, weeklyRegularHours };
}
