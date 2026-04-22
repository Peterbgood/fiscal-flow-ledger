import { useEffect, useMemo, useState, useRef } from 'react';
import { db } from "./firebase"; 
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement } from 'chart.js';
import { Bar, Pie } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement);

type ItemType = 'income' | 'expense';

interface BudgetItem {
  id: string;
  name: string;
  amounts: number[];
  amount?: number; 
  notes: string;
  type: ItemType;
  order: number;
}

const TAX_RATE = 0.7253; 
const CORRECT_PIN = "3270";
// UPDATED: Location Name Change
const FIXED_LOCATIONS = ['Knoxville', 'Clearwater', 'Charlotte', 'Petesville'];

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

function App() {
  const [items, setItems] = useState<BudgetItem[]>([]);
  const [locations] = useState<string[]>(FIXED_LOCATIONS);
  const [form, setForm] = useState({ name: '', amounts: FIXED_LOCATIONS.map(() => ''), type: 'expense' as ItemType });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState(true);
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const [showMortgage, setShowMortgage] = useState(false);
  const [showForm, setShowForm] = useState(false);
  
  const formRef = useRef<HTMLFormElement>(null);

  const [mortgage, setMortgage] = useState({
    price: 450000,
    downPayment: 90000,
    interest: 6.2,
    term: 30,
    annualTax: 2205,
    annualInsurance: 1980 
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isLocked) return;
      if (e.key >= '0' && e.key <= '9' && pin.length < 4) setPin(p => p + e.key);
      if (e.key === 'Backspace') setPin(p => p.slice(0, -1));
      if (e.key === 'Escape') setPin("");
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pin, isLocked]);

  const mortgageResult = useMemo(() => {
    const principal = mortgage.price - mortgage.downPayment;
    const monthlyRate = (mortgage.interest / 100) / 12;
    const totalPayments = mortgage.term * 12;
    const pAndI = principal > 0 ? (principal * monthlyRate * Math.pow(1 + monthlyRate, totalPayments)) / (Math.pow(1 + monthlyRate, totalPayments) - 1) : 0;
    const tax = mortgage.annualTax / 12;
    const insurance = mortgage.annualInsurance / 12;
    return { pAndI, tax, insurance, total: pAndI + tax + insurance };
  }, [mortgage]);

  useEffect(() => {
    setForm(f => ({ ...f, amounts: locations.map((_, i) => f.amounts[i] || '') }));
  }, [locations]);

  useEffect(() => {
    const q = query(collection(db, "budget"), orderBy("order", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as BudgetItem[]);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (editingId) {
        setShowForm(true);
        setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
    }
  }, [editingId]);

  const comparisonTotals = useMemo(() => {
    return locations.map((_, locIdx) => {
      const calculateTotal = (type: ItemType) => items
        .filter(i => i.type === type)
        .reduce((sum, i) => sum + (i.amounts ? (i.amounts[locIdx] ?? i.amounts[0]) : (i.amount || 0)), 0);
      const netIncome = (calculateTotal('income') * TAX_RATE) / 12;
      const expenses = calculateTotal('expense');
      return { netIncome, expenses, surplus: netIncome - expenses };
    });
  }, [items, locations]);

  const handleNumChange = (val: string) => val.replace(/^0+/, '') || '';

  useEffect(() => {
    if (pin.length === 4) {
      if (pin === CORRECT_PIN) setIsLocked(false);
      else { setError(true); setTimeout(() => { setPin(""); setError(false); }, 500); }
    }
  }, [pin]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.amounts[0]) return;
    const processedAmounts = form.amounts.map((val, i) => i === 0 ? Number(val) : (val === '' ? Number(form.amounts[0]) : Number(val)));
    const payload = { name: form.name, amounts: processedAmounts, type: form.type };
    if (editingId) {
      await updateDoc(doc(db, "budget", editingId), payload as any);
      setEditingId(null);
    } else {
      const maxOrder = items.length > 0 ? Math.max(...items.map(i => i.order)) : 0;
      await addDoc(collection(db, "budget"), { ...payload, order: maxOrder + 1, notes: '' });
    }
    setForm({ name: '', amounts: locations.map(() => ''), type: form.type });
    setShowForm(false);
  };

  const moveItem = async (item: BudgetItem, direction: 'up' | 'down') => {
    const list = items.filter(i => i.type === item.type);
    const idx = list.findIndex(i => i.id === item.id);
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= list.length) return;
    const targetItem = list[targetIdx];
    await updateDoc(doc(db, "budget", item.id), { order: targetItem.order });
    await updateDoc(doc(db, "budget", targetItem.id), { order: item.order });
  };

  if (isLocked) {
    return (
        <div className="fixed inset-0 bg-white flex flex-col items-center justify-center p-6 z-50">
          <div className={`w-full max-w-[320px] flex flex-col items-center ${error ? 'animate-shake' : ''}`}>
            <div className="mb-10 text-center">
              <div className="w-20 h-20 bg-slate-900 rounded-[2rem] flex items-center justify-center mb-6 mx-auto shadow-2xl">
                <span className="text-white text-3xl font-black italic">V</span>
              </div>
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Vault Locked</h2>
            </div>
            <div className="flex gap-6 mb-16">
              {[0, 1, 2, 3].map(i => (
                <div key={i} className={`w-4 h-4 rounded-full border-2 transition-all duration-300 ${pin.length > i ? 'bg-slate-900 border-slate-900 scale-125 shadow-lg' : 'border-slate-200'}`} />
              ))}
            </div>
            <div className="grid grid-cols-3 gap-x-8 gap-y-5">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "Clear", "0", "Back"].map((btn, i) => (
                <button
                  key={i}
                  onClick={() => {
                    if (btn === "Back") setPin(p => p.slice(0, -1));
                    else if (btn === "Clear") setPin("");
                    else if (btn !== "") setPin(p => p + btn);
                  }}
                  className={`w-16 h-16 flex flex-col items-center justify-center rounded-full transition-all active:scale-90 ${btn === "Clear" || btn === "Back" ? "bg-transparent" : "bg-slate-100 hover:bg-slate-200"}`}
                >
                  <span className={`text-2xl ${btn === "Clear" || btn === "Back" ? "text-[10px] font-black uppercase tracking-widest text-slate-400" : "font-semibold"}`}>{btn}</span>
                </button>
              ))}
            </div>
          </div>
          <style>{`@keyframes shake { 0%, 100% { transform: translateX(0); } 20% { transform: translateX(-10px); } 40% { transform: translateX(10px); } 60% { transform: translateX(-10px); } 80% { transform: translateX(10px); } } .animate-shake { animation: shake 0.4s ease-in-out; }`}</style>
        </div>
      );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FC] p-4 md:p-10 text-slate-900 font-sans">
      <div className="max-w-7xl mx-auto">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-12">
          <h1 className="text-4xl font-black tracking-tighter">Budget <span className="text-indigo-600 italic underline decoration-indigo-100 underline-offset-8">Vault</span></h1>
          <div className="flex gap-3 w-full md:w-auto">
            <button onClick={() => setShowMortgage(!showMortgage)} className={`flex-1 md:flex-none px-8 py-4 rounded-3xl font-black text-[10px] uppercase tracking-widest transition-all shadow-sm ${showMortgage ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
              Mortgage Estimator
            </button>
            <button onClick={() => { setIsLocked(true); setPin(""); }} className="bg-slate-900 text-white px-6 py-4 rounded-3xl shadow-xl hover:bg-slate-800 transition-all">🔒</button>
          </div>
        </header>

        {/* Comparison Cards Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-12">
          {locations.map((loc, i) => (
            <div key={i} className="bg-white p-6 md:p-8 rounded-[2rem] md:rounded-[2.5rem] shadow-sm border border-slate-100 transition-all">
              <p className="w-full font-black text-lg md:text-xl text-slate-800 mb-6">{loc}</p>
              <div className="space-y-5">
                <div>
                  <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Total Net Income</p>
                  <p className="text-lg font-bold text-slate-700">{formatCurrency(comparisonTotals[i].netIncome)}</p>
                </div>
                <div>
                  <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Total Expenses</p>
                  <p className="text-lg font-bold text-rose-500">{formatCurrency(comparisonTotals[i].expenses)}</p>
                </div>
                <div className="pt-5 border-t border-slate-50">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Net Surplus</p>
                  <p className="text-2xl md:text-3xl font-black tracking-tighter text-indigo-600">{formatCurrency(comparisonTotals[i].surplus)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-center mb-12">
            {!showForm ? (
                <button 
                    onClick={() => setShowForm(true)}
                    className="bg-slate-900 text-white px-12 py-5 rounded-[2rem] font-black text-[12px] uppercase tracking-widest shadow-2xl hover:scale-105 hover:bg-indigo-600 transition-all"
                >
                    + Add New Entry
                </button>
            ) : (
                <button 
                    onClick={() => { setShowForm(false); setEditingId(null); }}
                    className="text-slate-400 font-bold text-[10px] uppercase tracking-widest hover:text-rose-500 transition-all"
                >
                    Close Form
                </button>
            )}
        </div>

        <div className="flex flex-col gap-12">
          {showForm && (
            <div className="w-full max-w-2xl mx-auto animate-in fade-in slide-in-from-top-4 duration-300">
                <form ref={formRef} onSubmit={handleSubmit} className="bg-white p-6 md:p-10 rounded-[2.5rem] md:rounded-[3rem] shadow-xl space-y-6 border border-slate-50">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-black text-xl tracking-tight">{editingId ? 'Edit Record' : 'New Entry'}</h3>
                    </div>
                    <div className="flex p-1 bg-slate-100 rounded-2xl">
                        {(['income', 'expense'] as const).map(t => (
                        <button key={t} type="button" onClick={() => setForm({...form, type: t})} className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${form.type === t ? 'bg-white shadow-md text-slate-900' : 'text-slate-400'}`}>{t}</button>
                        ))}
                    </div>
                    <input className="w-full p-4 bg-slate-50 rounded-[1.5rem] outline-none font-bold" placeholder="Description" value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {locations.map((loc, i) => (
                        <div key={i}>
                            <label className="text-[9px] font-black text-slate-300 uppercase tracking-widest ml-3 mb-1 block">{loc}</label>
                            <input type="text" className="w-full p-4 bg-slate-50 rounded-[1.25rem] outline-none font-bold" placeholder="0" value={form.amounts[i]} onChange={e => { const n = [...form.amounts]; n[i] = handleNumChange(e.target.value); setForm({...form, amounts: n}); }} />
                        </div>
                        ))}
                    </div>
                    <button className="w-full bg-slate-900 text-white font-black text-[10px] uppercase tracking-widest py-5 rounded-[1.5rem] shadow-2xl hover:bg-indigo-600 transition-all">{editingId ? 'Update Record' : 'Add to Vault'}</button>
                </form>
            </div>
          )}

          <div className="w-full max-w-5xl mx-auto space-y-12">
            {(['income', 'expense'] as const).map((type) => (
              <section key={type} className="bg-white rounded-[2rem] md:rounded-[3.5rem] shadow-sm overflow-hidden border border-slate-100">
                <div className="hidden md:flex px-10 py-6 bg-slate-50/50 border-b items-center">
                  <span className="w-1/3 text-[10px] font-black uppercase tracking-widest text-slate-400">{type} Summary</span>
                  <div className="flex-1 grid gap-6 text-center" style={{ gridTemplateColumns: `repeat(${locations.length}, minmax(0, 1fr))` }}>
                    {locations.map(loc => <span key={loc} className="text-[10px] font-black uppercase text-slate-300 truncate tracking-tight">{loc}</span>)}
                  </div>
                  <div className="w-20" />
                </div>
                <div className="divide-y divide-slate-50">
                  {items.filter(i => i.type === type).map((item) => (
                    <div key={item.id} className="p-6 md:px-10 md:py-8 flex flex-col md:flex-row items-start md:items-center hover:bg-slate-50/50 transition-all group">
                      <div className="w-full md:w-1/3 flex items-center justify-between md:justify-start gap-4 mb-4 md:mb-0">
                        <div className="flex items-center gap-4">
                            <div className="flex flex-col opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => moveItem(item, 'up')} className="text-slate-200 hover:text-indigo-600 text-[10px] p-1">▲</button>
                                <button onClick={() => moveItem(item, 'down')} className="text-slate-200 hover:text-indigo-600 text-[10px] p-1">▼</button>
                            </div>
                            <span className={`font-bold text-lg md:text-base truncate ${item.amounts?.some(v => v !== item.amounts[0]) ? 'text-indigo-600' : 'text-slate-800'}`}>{item.name}</span>
                        </div>
                        {/* MOBILE ACTION BUTTONS (RESTORED) */}
                        <div className="flex md:hidden gap-3">
                            <button onClick={() => { setEditingId(item.id); setForm({ name: item.name, amounts: item.amounts ? item.amounts.map(String) : [String(item.amount || '')], type: item.type }); }} className="p-2 bg-slate-50 rounded-full text-slate-400">✎</button>
                            <button onClick={() => deleteDoc(doc(db, "budget", item.id))} className="p-2 bg-slate-50 rounded-full text-rose-300">✕</button>
                        </div>
                      </div>
                      
                      {/* FIXED: Vertical stacking on mobile (flex-col), Grid on desktop (md:grid) */}
                      <div className="flex-1 w-full flex flex-col md:grid gap-2 md:gap-6 mt-2 md:mt-0" style={{ gridTemplateColumns: `repeat(${locations.length}, minmax(0, 1fr))` }}>
                        {locations.map((loc, lIdx) => (
                          <div key={lIdx} className="flex flex-row md:flex-col justify-between md:justify-center items-center bg-slate-50/50 md:bg-transparent px-4 py-3 md:p-0 rounded-xl flex-1 border border-slate-100 md:border-0">
                            <span className="md:hidden text-[9px] font-black uppercase text-slate-400 tracking-widest mr-2">{loc}</span>
                            <span className={`font-black text-sm whitespace-nowrap ${lIdx === 0 ? 'text-slate-400' : 'text-black'}`}>
                                {formatCurrency(item.amounts ? (item.amounts[lIdx] ?? item.amounts[0]) : (item.amount || 0))}
                            </span>
                          </div>
                        ))}
                      </div>

                      <div className="hidden md:flex w-20 justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => { setEditingId(item.id); setForm({ name: item.name, amounts: item.amounts ? item.amounts.map(String) : [String(item.amount || '')], type: item.type }); }} className="text-slate-300 hover:text-indigo-600">✎</button>
                        <button onClick={() => deleteDoc(doc(db, "budget", item.id))} className="text-slate-300 hover:text-rose-500">✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;