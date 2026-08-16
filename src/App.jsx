import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Filter,
  CreditCard,
  Calendar,
  IndianRupee,
  Clock,
  CheckCircle2,
  Trash2,
  Building2,
} from "lucide-react";
import clsx from "clsx";
import {
  SEED_LOANS,
  formatINR,
  estimateRemainingInterest,
  dueDatesThrough,
  applyEmiToLoan,
} from "./data";

const STORAGE_KEY = "asan-loan-tracker-v2";

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { loans: SEED_LOANS.map((l) => ({ ...l })), payments: [] };
}

/** Auto-post EMIs for due dates that have already passed. */
function syncAutoPayments(state, asOf = new Date()) {
  let loans = state.loans.map((l) => ({ ...l }));
  let payments = [...state.payments];
  let changed = false;

  for (let i = 0; i < loans.length; i++) {
    const loan = loans[i];
    if (loan.status === "closed") continue;
    const dues = dueDatesThrough(loan.startDate, loan.dueDay || 5, asOf);
    const existing = new Set(
      payments.filter((p) => p.loanId === loan.id && p.auto).map((p) => p.date)
    );

    for (const date of dues) {
      if (existing.has(date)) continue;
      // also skip if manual payment already on that date
      if (payments.some((p) => p.loanId === loan.id && p.date === date)) continue;

      payments.push({
        id: `auto-${loan.id}-${date}`,
        loanId: loan.id,
        date,
        amount: loan.emi,
        note: `Auto EMI · due ${loan.dueDay}th`,
        auto: true,
      });
      changed = true;
    }

    const paidCount = dues.length;
    if (paidCount !== (loan.emisPaid || 0) || changed) {
      loans[i] = applyEmiToLoan(loan, paidCount);
      changed = true;
    }
  }

  payments.sort((a, b) => b.date.localeCompare(a.date));
  return { loans, payments, changed };
}

function monthsLeftFor(loan) {
  if (loan.balanceTenureMonths != null) return loan.balanceTenureMonths;
  return Math.max(0, loan.tenureMonths - (loan.emisPaid || 0));
}

function interestPending(loan) {
  if (loan.interestPayable != null) return loan.interestPayable;
  return estimateRemainingInterest(
    loan.principalOutstanding,
    loan.ratePct,
    monthsLeftFor(loan)
  );
}

export default function App() {
  const [state, setState] = useState(() => {
    const base = loadState();
    const synced = syncAutoPayments(base);
    return { loans: synced.loans, payments: synced.payments };
  });
  const [bankFilter, setBankFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");
  const [showPay, setShowPay] = useState(false);
  const [form, setForm] = useState({
    loanId: SEED_LOANS[0].id,
    date: new Date().toISOString().slice(0, 10),
    amount: "",
    note: "",
    applyToPrincipal: true,
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  // Re-check due dates on load and every hour (covers 5th / 21st auto EMI)
  useEffect(() => {
    const run = () => {
      setState((prev) => {
        const synced = syncAutoPayments(prev);
        if (!synced.changed) return prev;
        return { loans: synced.loans, payments: synced.payments };
      });
    };
    run();
    const id = setInterval(run, 60 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const loans = state.loans;

  const filteredLoans = useMemo(() => {
    return loans.filter((l) => {
      if (bankFilter !== "all" && l.bank !== bankFilter) return false;
      if (statusFilter !== "all" && l.status !== statusFilter) return false;
      return true;
    });
  }, [loans, bankFilter, statusFilter]);

  const totals = useMemo(() => {
    const active = loans.filter((l) => l.status === "active");
    const outstanding = active.reduce((s, l) => s + (l.principalOutstanding || 0), 0);
    const interest = active.reduce((s, l) => s + interestPending(l), 0);
    const emi = active.reduce((s, l) => s + (l.emi || 0), 0);
    const months = active.reduce((s, l) => s + monthsLeftFor(l), 0);
    return { outstanding, interest, emi, months, count: active.length };
  }, [loans]);

  const paymentsSorted = useMemo(() => {
    return [...state.payments].sort((a, b) => b.date.localeCompare(a.date));
  }, [state.payments]);

  const filteredPayments = useMemo(() => {
    return paymentsSorted.filter((p) => {
      if (bankFilter === "all") return true;
      const loan = loans.find((l) => l.id === p.loanId);
      return loan?.bank === bankFilter;
    });
  }, [paymentsSorted, bankFilter, loans]);

  const addPayment = (e) => {
    e.preventDefault();
    const amount = Number(form.amount);
    if (!amount || amount <= 0) return;

    const payment = {
      id: "p" + Date.now(),
      loanId: form.loanId,
      date: form.date,
      amount,
      note: form.note || "Payment",
    };

    setState((prev) => {
      const loans = prev.loans.map((l) => {
        if (l.id !== form.loanId) return l;
        let principal = l.principalOutstanding;
        let interestPay = l.interestPayable;
        let emisPaid = (l.emisPaid || 0) + 1;
        let balanceTenure = l.balanceTenureMonths;

        if (form.applyToPrincipal) {
          // Split roughly: interest portion first for the month, rest principal
          const monthlyInterest = Math.round(
            (l.principalOutstanding * l.ratePct) / 12 / 100
          );
          const toInterest = Math.min(monthlyInterest, amount);
          const toPrincipal = Math.max(0, amount - toInterest);
          principal = Math.max(0, principal - toPrincipal);
          if (interestPay != null) {
            interestPay = Math.max(0, interestPay - toInterest);
          }
        }

        if (balanceTenure != null) {
          balanceTenure = Math.max(0, balanceTenure - 1);
        }

        const status = principal <= 0 ? "closed" : l.status;

        return {
          ...l,
          principalOutstanding: principal,
          interestPayable: interestPay,
          emisPaid,
          balanceTenureMonths: balanceTenure,
          status,
        };
      });

      return {
        loans,
        payments: [payment, ...prev.payments],
      };
    });

    setShowPay(false);
    setForm((f) => ({ ...f, amount: "", note: "" }));
  };

  const deletePayment = (id) => {
    setState((prev) => ({
      ...prev,
      payments: prev.payments.filter((p) => p.id !== id),
    }));
  };

  const resetSeed = () => {
    if (!confirm("Reset to statement seed data?")) return;
    localStorage.removeItem(STORAGE_KEY);
    setState(loadState());
  };

  const banks = [...new Set(loans.map((l) => l.bank))];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 sticky top-0 z-20 bg-slate-950/90 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-bold text-lg">Loan Tracker</div>
            <div className="text-xs text-slate-500">Outstanding · Interest · EMIs · Payments</div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={resetSeed}
              className="text-xs px-3 py-2 rounded-lg border border-slate-700 text-slate-400 hover:text-white"
            >
              Reset seed
            </button>
            <button
              onClick={() => setShowPay(true)}
              className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl bg-emerald-500 text-white hover:bg-emerald-400"
            >
              <Plus size={16} /> Add payment
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <div className="card p-3 text-xs text-slate-400 leading-relaxed">
          Auto EMI: <span className="text-slate-200">ICICI on the 5th</span>,{" "}
          <span className="text-slate-200">HDFC on the 21st</span>. When the date is reached, payment is logged and outstanding updates.
          Today treated as{" "}
          <span className="text-emerald-400 font-medium">{new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>.
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "Principal outstanding", value: formatINR(totals.outstanding), icon: IndianRupee },
            { label: "Interest pending (est.)", value: formatINR(totals.interest), icon: CreditCard },
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

        {/* Filters */}
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

        {/* Loan cards */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Loans</h2>
          <AnimatePresence>
            {filteredLoans.map((loan) => {
              const left = monthsLeftFor(loan);
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
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ background: loan.color }}
                        />
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
                      className="h-full rounded-full bg-emerald-500 transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    {progress.toFixed(1)}% principal repaid of {formatINR(loan.principalOriginal)}
                  </div>

                  <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                    <div className="rounded-xl bg-slate-800/60 p-3">
                      <div className="text-[10px] uppercase text-slate-500">Interest pending</div>
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
                      <div className="font-semibold mt-0.5">{left}</div>
                    </div>
                    <div className="rounded-xl bg-slate-800/60 p-3">
                      <div className="text-[10px] uppercase text-slate-500">Rate</div>
                      <div className="font-semibold mt-0.5">{loan.ratePct}% p.a.</div>
                    </div>
                  </div>

                  <div className="mt-3 text-[11px] text-slate-500">
                    Start {loan.startDate} · Due every month on <span className="text-slate-300 font-medium">{loan.dueDay}th</span>
                    {" · "}EMIs paid {loan.emisPaid || 0}/{loan.tenureMonths}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
          {filteredLoans.length === 0 && (
            <div className="card p-8 text-center text-slate-500 text-sm">No loans match filters</div>
          )}
        </div>

        {/* Payments */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">
            Payment history
          </h2>
          <div className="card divide-y divide-slate-800">
            {filteredPayments.length === 0 && (
              <div className="p-6 text-center text-sm text-slate-500">No payments yet</div>
            )}
            {filteredPayments.map((p) => {
              const loan = loans.find((l) => l.id === p.loanId);
              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">
                      {loan?.bank || "Loan"} · {formatINR(p.amount)}
                    </div>
                    <div className="text-xs text-slate-500">
                      {p.date} · {p.note}
                    </div>
                  </div>
                  <button
                    onClick={() => deletePayment(p.id)}
                    className="p-2 rounded-lg text-slate-500 hover:text-red-400 hover:bg-slate-800"
                    title="Remove from list (does not reverse principal)"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-500">
            Data stays in this browser (localStorage). Seeded from your ICICI amortisation & HDFC Jumbo statement.
          </p>
        </div>
      </main>

      {/* Payment modal */}
      <AnimatePresence>
        {showPay && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-4"
            onClick={() => setShowPay(false)}
          >
            <motion.form
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              onSubmit={addPayment}
              className="card w-full max-w-md p-5 space-y-4"
            >
              <h3 className="font-semibold text-lg">Record payment</h3>

              <label className="block text-xs text-slate-400">
                Loan
                <select
                  value={form.loanId}
                  onChange={(e) => setForm({ ...form, loanId: e.target.value })}
                  className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white"
                >
                  {loans.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.bank} — {l.product}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-xs text-slate-400">
                Payment date
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white"
                  required
                />
              </label>

              <label className="block text-xs text-slate-400">
                Amount (₹)
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder="34035"
                  className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white"
                  required
                />
              </label>

              <label className="block text-xs text-slate-400">
                Note
                <input
                  type="text"
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  placeholder="EMI / part payment"
                  className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white"
                />
              </label>

              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={form.applyToPrincipal}
                  onChange={(e) =>
                    setForm({ ...form, applyToPrincipal: e.target.checked })
                  }
                />
                Reduce outstanding (interest first, then principal)
              </label>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPay(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-700 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-semibold inline-flex items-center justify-center gap-1"
                >
                  <CheckCircle2 size={16} /> Save
                </button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
