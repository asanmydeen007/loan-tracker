import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Filter,
  CreditCard,
  Calendar,
  IndianRupee,
  Clock,
  Building2,
  Calculator,
} from "lucide-react";
import clsx from "clsx";
import {
  LOANS,
  formatINR,
  dueDatesThrough,
  applyEmiProgress,
  prepayImpact,
  totalInterest,
} from "./data";

// fix missing export - use totalInterest path only via prepayImpact
function interestPending(loan) {
  const months = loan.monthsLeft ?? 0;
  const p = loan.principalOutstanding || 0;
  return Math.round(totalInterest(p, loan.ratePct, months));
}

function buildLiveLoans(asOf = new Date()) {
  return LOANS.map((loan) => {
    const dues = dueDatesThrough(loan.startDate, loan.dueDay, asOf);
    return applyEmiProgress(loan, dues.length);
  });
}

export default function App() {
  const [loans, setLoans] = useState(() => buildLiveLoans());
  const [bankFilter, setBankFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");

  // Prepay calculator
  const [calcLoanId, setCalcLoanId] = useState(LOANS[0].id);
  const [extraPay, setExtraPay] = useState("50000");

  useEffect(() => {
    const run = () => setLoans(buildLiveLoans());
    run();
    const id = setInterval(run, 60 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const filteredLoans = useMemo(() => {
    return loans.filter((l) => {
      if (bankFilter !== "all" && l.bank !== bankFilter) return false;
      if (statusFilter !== "all" && l.status !== statusFilter) return false;
      return true;
    });
  }, [loans, bankFilter, statusFilter]);

  const totals = useMemo(() => {
    const active = loans.filter((l) => l.status === "active");
    return {
      outstanding: active.reduce((s, l) => s + (l.principalOutstanding || 0), 0),
      interest: active.reduce((s, l) => s + interestPending(l), 0),
      emi: active.reduce((s, l) => s + (l.emi || 0), 0),
      count: active.length,
    };
  }, [loans]);

  const calcLoan = loans.find((l) => l.id === calcLoanId) || loans[0];
  const impact = useMemo(() => {
    if (!calcLoan) return null;
    const extra = Number(extraPay) || 0;
    return prepayImpact(
      calcLoan.principalOutstanding,
      calcLoan.ratePct,
      calcLoan.monthsLeft || 1,
      extra
    );
  }, [calcLoan, extraPay]);

  const banks = [...new Set(loans.map((l) => l.bank))];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 sticky top-0 z-20 bg-slate-950/90 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="font-bold text-lg">Loan Tracker</div>
          <div className="text-xs text-slate-500">
            Outstanding · Interest · Prepayment calculator
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <div className="card p-3 text-xs text-slate-400 leading-relaxed">
          ICICI EMI auto-counts on the <span className="text-slate-200">5th</span>, HDFC on the{" "}
          <span className="text-slate-200">21st</span>. As of{" "}
          <span className="text-emerald-400 font-medium">
            {new Date().toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </span>
          .
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "Principal outstanding", value: formatINR(totals.outstanding), icon: IndianRupee },
            { label: "Interest left (est.)", value: formatINR(totals.interest), icon: CreditCard },
            { label: "Monthly EMI load", value: formatINR(totals.emi), icon: Calendar },
            { label: "Active loans", value: String(totals.count), icon: Building2 },
          ].map((s) => (
            <div key={s.label} className="card p-4">
              <div className="flex items-center gap-2 text-slate-500 text-xs mb-2">
                <s.icon size={14} /> {s.label}
              </div>
              <div className="text-xl font-bold">{s.value}</div>
            </div>
          ))}
        </div>

        <div className="card p-4 flex flex-wrap items-center gap-3">
          <Filter size={16} className="text-slate-500" />
          <select
            value={bankFilter}
            onChange={(e) => setBankFilter(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm"
          >
            <option value="all">All banks</option>
            {banks.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm"
          >
            <option value="all">All status</option>
            <option value="active">Active</option>
            <option value="closed">Closed</option>
          </select>
        </div>

        {/* Loans */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Loans</h2>
          {filteredLoans.map((loan) => {
            const interest = interestPending(loan);
            const progress =
              loan.principalOriginal > 0
                ? Math.min(
                    100,
                    ((loan.principalOriginal - loan.principalOutstanding) /
                      loan.principalOriginal) *
                      100
                  )
                : 0;
            return (
              <motion.div
                key={loan.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="card p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: loan.color }} />
                      <h3 className="font-semibold">{loan.bank}</h3>
                      <span
                        className={clsx(
                          "text-[10px] uppercase font-bold px-2 py-0.5 rounded-full",
                          loan.status === "active"
                            ? "bg-emerald-500/15 text-emerald-400"
                            : "bg-slate-500/20 text-slate-400"
                        )}
                      >
                        {loan.status}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      {loan.product} · {loan.loanNumber}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-slate-500">Outstanding</div>
                    <div className="text-xl font-bold">{formatINR(loan.principalOutstanding)}</div>
                  </div>
                </div>

                <div className="mt-4 h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  {progress.toFixed(1)}% principal repaid of {formatINR(loan.principalOriginal)}
                </div>

                <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <div className="rounded-xl bg-slate-800/60 p-3">
                    <div className="text-[10px] uppercase text-slate-500">Interest left</div>
                    <div className="font-semibold mt-0.5">{formatINR(interest)}</div>
                  </div>
                  <div className="rounded-xl bg-slate-800/60 p-3">
                    <div className="text-[10px] uppercase text-slate-500">EMI</div>
                    <div className="font-semibold mt-0.5">{formatINR(loan.emi)}</div>
                  </div>
                  <div className="rounded-xl bg-slate-800/60 p-3">
                    <div className="text-[10px] uppercase text-slate-500 flex items-center gap-1">
                      <Clock size={10} /> Months left
                    </div>
                    <div className="font-semibold mt-0.5">{loan.monthsLeft}</div>
                  </div>
                  <div className="rounded-xl bg-slate-800/60 p-3">
                    <div className="text-[10px] uppercase text-slate-500">Rate</div>
                    <div className="font-semibold mt-0.5">{loan.ratePct}% p.a.</div>
                  </div>
                </div>
                <div className="mt-3 text-[11px] text-slate-500">
                  Due every month on{" "}
                  <span className="text-slate-300 font-medium">{loan.dueDay}th</span>
                  {" · "}EMIs paid {loan.emisPaid || 0}/{loan.tenureMonths}
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Prepayment calculator */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-2">
            <Calculator size={14} /> Prepayment calculator
          </h2>
          <div className="card p-5 space-y-4">
            <p className="text-xs text-slate-400 leading-relaxed">
              Enter an amount you could pay toward <span className="text-slate-200">principal</span> now.
              See how much <span className="text-slate-200">interest drops</span> and what the{" "}
              <span className="text-slate-200">new EMI</span> would be if tenure stays the same.
            </p>

            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block text-xs text-slate-400">
                Loan
                <select
                  value={calcLoanId}
                  onChange={(e) => setCalcLoanId(e.target.value)}
                  className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white"
                >
                  {loans.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.bank} — {formatINR(l.principalOutstanding)} left
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs text-slate-400">
                Extra principal payment (₹)
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={extraPay}
                  onChange={(e) => setExtraPay(e.target.value)}
                  className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white"
                />
              </label>
            </div>

            {impact && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-xl bg-slate-800/60 p-3">
                    <div className="text-[10px] uppercase text-slate-500">Principal after</div>
                    <div className="font-semibold mt-0.5">{formatINR(impact.principalAfter)}</div>
                  </div>
                  <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3">
                    <div className="text-[10px] uppercase text-emerald-400/80">Interest saved</div>
                    <div className="font-semibold mt-0.5 text-emerald-400">
                      {formatINR(impact.interestSavedSameTenure)}
                    </div>
                  </div>
                  <div className="rounded-xl bg-slate-800/60 p-3">
                    <div className="text-[10px] uppercase text-slate-500">EMI now</div>
                    <div className="font-semibold mt-0.5">{formatINR(impact.emiBefore)}</div>
                  </div>
                  <div className="rounded-xl bg-sky-500/10 border border-sky-500/20 p-3">
                    <div className="text-[10px] uppercase text-sky-400/80">New EMI</div>
                    <div className="font-semibold mt-0.5 text-sky-400">
                      {formatINR(impact.emiAfter)}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-700 p-4 text-sm space-y-2">
                  <div className="font-medium text-slate-200">If you keep the same tenure ({impact.monthsLeft} months)</div>
                  <ul className="text-xs text-slate-400 space-y-1.5 list-disc pl-4">
                    <li>
                      EMI falls by{" "}
                      <span className="text-slate-200 font-medium">{formatINR(impact.emiReduction)}</span>
                      {" "}→ new EMI{" "}
                      <span className="text-sky-400 font-medium">{formatINR(impact.emiAfter)}</span>
                    </li>
                    <li>
                      Total interest drops by{" "}
                      <span className="text-emerald-400 font-medium">
                        {formatINR(impact.interestSavedSameTenure)}
                      </span>
                      {" "}(from {formatINR(impact.interestBefore)} → {formatINR(impact.interestAfterSameTenure)})
                    </li>
                  </ul>
                  <div className="font-medium text-slate-200 pt-2">If you keep the same EMI instead</div>
                  <ul className="text-xs text-slate-400 space-y-1.5 list-disc pl-4">
                    <li>
                      Tenure shortens by about{" "}
                      <span className="text-slate-200 font-medium">{impact.monthsSavedIfSameEmi} months</span>
                      {" "}(≈ {impact.monthsIfSameEmi} months left)
                    </li>
                    <li>
                      Interest saved roughly{" "}
                      <span className="text-emerald-400 font-medium">
                        {formatINR(impact.interestSavedSameEmi)}
                      </span>
                    </li>
                  </ul>
                  <p className="text-[11px] text-slate-500 pt-2">
                    Estimates use standard reducing-balance math. Bank foreclosure / part-prepay charges may apply (ICICI: check schedule for fees).
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
