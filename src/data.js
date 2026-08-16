/** Seed loans from ICICI amortisation + HDFC Insta Jumbo statement (Aug 2026). */

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
    // After 1 EMI (Aug 2026 schedule closing principal inst 2 starts from after Jul payment)
    // Inst 1 Jul 2026: closing principal 15,81,505 after first EMI
    principalOutstanding: 1581505,
    interestTotalSchedule: 442033,
    emisPaid: 1,
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
    emi: 14105, // statement total due / typical monthly
    tenureMonths: 24,
    startDate: "2026-04-21",
    // From HDFC statement 01 Aug 2026
    principalOutstanding: 254704,
    interestPayable: 27313,
    emisPaid: 4, // 24 - 20 balance tenure
    balanceTenureMonths: 20,
    status: "active",
    color: "#3b82f6",
  },
];

export function monthsBetween(fromISO, to = new Date()) {
  const a = new Date(fromISO);
  const b = new Date(to);
  return Math.max(0, (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()));
}

export function estimateRemainingInterest(principal, annualRatePct, monthsLeft) {
  if (!principal || !monthsLeft) return 0;
  // Simple average-balance approximation for display (not bank-exact)
  const monthlyRate = annualRatePct / 12 / 100;
  // Remaining interest ≈ principal * monthlyRate * (monthsLeft+1)/2 for declining balance rough
  return Math.round(principal * monthlyRate * ((monthsLeft + 1) / 2));
}

export function formatINR(n) {
  if (n == null || Number.isNaN(n)) return "—";
  return "₹" + Math.round(n).toLocaleString("en-IN");
}
