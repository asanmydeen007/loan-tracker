/** Seed loans from ICICI amortisation + HDFC Insta Jumbo statement. */

export const SEED_LOANS = [
  {
    id: "icici-pl",
    bank: "ICICI Bank",
    product: "Personal Loan",
    loanNumber: "LPBNG00052434197",
    principalOriginal: 1600000,
    ratePct: 9.99,
    emi: 34035,
    tenureMonths: 60,
    startDate: "2026-07-05",
    dueDay: 5, // paid on 5th every month
    // Schedule closing principals after each EMI (from amortisation PDF)
    scheduleClosing: [
      1581505, // after Jul 2026
      1560636, // after Aug 2026
      1539593, // after Sep 2026
      1518375, // after Oct 2026
      1496980, // after Nov 2026
      1475407, // after Dec 2026
      // rest estimated if needed
    ],
    principalOutstanding: 1600000,
    interestTotalSchedule: 442033,
    emisPaid: 0,
    status: "active",
    color: "#f97316",
  },
  {
    id: "hdfc-jumbo",
    bank: "HDFC Bank",
    product: "Insta Jumbo Loan",
    loanNumber: "139160855",
    principalOriginal: 300000,
    ratePct: 11.88,
    emi: 14105,
    tenureMonths: 24,
    startDate: "2026-04-21",
    dueDay: 21, // paid on 21st every month
    principalOutstanding: 300000,
    interestPayable: 27313,
    emisPaid: 0,
    balanceTenureMonths: 24,
    status: "active",
    color: "#3b82f6",
  },
];

export function formatINR(n) {
  if (n == null || Number.isNaN(n)) return "—";
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

export function estimateRemainingInterest(principal, annualRatePct, monthsLeft) {
  if (!principal || !monthsLeft) return 0;
  const monthlyRate = annualRatePct / 12 / 100;
  return Math.round(principal * monthlyRate * ((monthsLeft + 1) / 2));
}

/** All EMI due dates from start through `asOf` (inclusive if day reached). */
export function dueDatesThrough(startDateISO, dueDay, asOf = new Date()) {
  const start = new Date(startDateISO + "T12:00:00");
  const end = new Date(asOf);
  end.setHours(23, 59, 59, 999);

  const dates = [];
  let y = start.getFullYear();
  let m = start.getMonth();

  // First due is start date (disbursement / first EMI date)
  for (let i = 0; i < 120; i++) {
    const d = new Date(y, m, dueDay, 12, 0, 0);
    if (d < start && i === 0) {
      // use exact start if dueDay matches start
      d.setTime(start.getTime());
    }
    // normalize to dueDay in that month
    const dim = new Date(y, m + 1, 0).getDate();
    const day = Math.min(dueDay, dim);
    const due = new Date(y, m, day, 12, 0, 0);
    if (due >= start && due <= end) {
      dates.push(due.toISOString().slice(0, 10));
    }
    if (due > end) break;
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }
  return dates;
}

export function applyEmiToLoan(loan, emisCount) {
  const next = { ...loan };
  next.emisPaid = emisCount;

  if (loan.id === "icici-pl" && loan.scheduleClosing?.length) {
    if (emisCount <= 0) {
      next.principalOutstanding = loan.principalOriginal;
    } else if (emisCount <= loan.scheduleClosing.length) {
      next.principalOutstanding = loan.scheduleClosing[emisCount - 1];
    } else {
      // beyond known schedule rows: step down by approx principal portion
      let p = loan.scheduleClosing[loan.scheduleClosing.length - 1];
      for (let i = loan.scheduleClosing.length; i < emisCount; i++) {
        const interest = Math.round((p * loan.ratePct) / 12 / 100);
        p = Math.max(0, p - (loan.emi - interest));
      }
      next.principalOutstanding = p;
    }
  } else {
    // HDFC-style: reduce using interest-first each EMI
    let p = loan.principalOriginal;
    for (let i = 0; i < emisCount; i++) {
      const interest = Math.round((p * loan.ratePct) / 12 / 100);
      const principalPart = Math.max(0, loan.emi - interest);
      p = Math.max(0, p - principalPart);
    }
    next.principalOutstanding = p;
    if (loan.interestPayable != null && loan.tenureMonths) {
      // scale remaining interest roughly
      const left = Math.max(0, loan.tenureMonths - emisCount);
      next.interestPayable = Math.round(
        (loan.interestPayable * left) / Math.max(1, loan.tenureMonths - 4)
      );
      // statement had 27313 for 20 months left after 4 EMIs — keep formula simple
      if (emisCount === 4) next.interestPayable = 27313;
      if (emisCount < 4) {
        next.interestPayable = Math.round(27313 * ((24 - emisCount) / 20));
      }
      if (emisCount > 4) {
        next.interestPayable = Math.round(27313 * ((24 - emisCount) / 20));
      }
    }
    next.balanceTenureMonths = Math.max(0, loan.tenureMonths - emisCount);
  }

  next.status = next.principalOutstanding <= 0 ? "closed" : "active";
  return next;
}
