/** Loans from ICICI amortisation + HDFC Insta Jumbo statement. */

export const LOANS = [
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
    dueDay: 5,
    scheduleClosing: [
      1581505, 1560636, 1539593, 1518375, 1496980, 1475407,
    ],
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
    dueDay: 21,
    interestPayableAt4Emis: 27313,
    color: "#3b82f6",
  },
];

export function formatINR(n) {
  if (n == null || Number.isNaN(n)) return "—";
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

export function dueDatesThrough(startDateISO, dueDay, asOf = new Date()) {
  const start = new Date(startDateISO + "T12:00:00");
  const end = new Date(asOf);
  end.setHours(23, 59, 59, 999);
  const dates = [];
  let y = start.getFullYear();
  let m = start.getMonth();
  for (let i = 0; i < 120; i++) {
    const dim = new Date(y, m + 1, 0).getDate();
    const day = Math.min(dueDay, dim);
    const due = new Date(y, m, day, 12, 0, 0);
    if (due >= start && due <= end) dates.push(due.toISOString().slice(0, 10));
    if (due > end) break;
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }
  return dates;
}

export function applyEmiProgress(loan, emisCount) {
  const next = { ...loan, emisPaid: emisCount };
  if (loan.id === "icici-pl" && loan.scheduleClosing?.length) {
    if (emisCount <= 0) next.principalOutstanding = loan.principalOriginal;
    else if (emisCount <= loan.scheduleClosing.length) {
      next.principalOutstanding = loan.scheduleClosing[emisCount - 1];
    } else {
      let p = loan.scheduleClosing[loan.scheduleClosing.length - 1];
      for (let i = loan.scheduleClosing.length; i < emisCount; i++) {
        const interest = Math.round((p * loan.ratePct) / 12 / 100);
        p = Math.max(0, p - (loan.emi - interest));
      }
      next.principalOutstanding = p;
    }
  } else {
    let p = loan.principalOriginal;
    for (let i = 0; i < emisCount; i++) {
      const interest = Math.round((p * loan.ratePct) / 12 / 100);
      p = Math.max(0, p - Math.max(0, loan.emi - interest));
    }
    next.principalOutstanding = p;
  }
  next.monthsLeft = Math.max(0, loan.tenureMonths - emisCount);
  next.status = next.principalOutstanding <= 0 ? "closed" : "active";
  return next;
}

/** Standard EMI for principal P, annual rate %, n months */
export function calcEmi(principal, annualRatePct, months) {
  if (principal <= 0 || months <= 0) return 0;
  const r = annualRatePct / 12 / 100;
  if (r === 0) return principal / months;
  const pow = Math.pow(1 + r, months);
  return (principal * r * pow) / (pow - 1);
}

/** Total interest if paying EMI over n months */
export function totalInterest(principal, annualRatePct, months) {
  if (principal <= 0 || months <= 0) return 0;
  const emi = calcEmi(principal, annualRatePct, months);
  return Math.max(0, emi * months - principal);
}

/**
 * Prepayment impact: pay `extra` toward principal now.
 * Keep same remaining tenure → new lower EMI.
 * Also show option metrics if EMI kept same (tenure shrink) as secondary.
 */
export function prepayImpact(principal, annualRatePct, monthsLeft, extra) {
  const x = Math.max(0, Math.min(extra, principal));
  const newPrincipal = Math.max(0, principal - x);

  const interestNow = totalInterest(principal, annualRatePct, monthsLeft);
  const emiNow = calcEmi(principal, annualRatePct, monthsLeft);

  // Same tenure, lower EMI
  const newEmi = calcEmi(newPrincipal, annualRatePct, monthsLeft);
  const interestAfterSameTenure = totalInterest(newPrincipal, annualRatePct, monthsLeft);
  const interestSavedSameTenure = interestNow - interestAfterSameTenure;

  // Same EMI, shorter tenure
  const r = annualRatePct / 12 / 100;
  let monthsIfSameEmi = 0;
  if (newPrincipal > 0 && emiNow > 0 && r > 0) {
    // n = log(EMI / (EMI - P*r)) / log(1+r)
    const denom = emiNow - newPrincipal * r;
    if (denom > 0) {
      monthsIfSameEmi = Math.ceil(Math.log(emiNow / denom) / Math.log(1 + r));
    } else {
      monthsIfSameEmi = monthsLeft;
    }
  }
  monthsIfSameEmi = Math.max(0, Math.min(monthsLeft, monthsIfSameEmi));
  const interestAfterSameEmi = totalInterest(newPrincipal, annualRatePct, monthsIfSameEmi);
  const interestSavedSameEmi = interestNow - interestAfterSameEmi;

  return {
    extra: x,
    principalBefore: principal,
    principalAfter: newPrincipal,
    monthsLeft,
    emiBefore: Math.round(emiNow),
    emiAfter: Math.round(newEmi),
    emiReduction: Math.round(emiNow - newEmi),
    interestBefore: Math.round(interestNow),
    interestAfterSameTenure: Math.round(interestAfterSameTenure),
    interestSavedSameTenure: Math.round(interestSavedSameTenure),
    monthsIfSameEmi,
    monthsSavedIfSameEmi: monthsLeft - monthsIfSameEmi,
    interestSavedSameEmi: Math.round(interestSavedSameEmi),
  };
}
