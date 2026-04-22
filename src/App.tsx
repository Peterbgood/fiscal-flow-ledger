import { useEffect, useMemo, useState, useRef } from 'react';
import { db } from "./firebase"; 
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, orderBy } from 'firebase/firestore';

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

const CORRECT_PIN = "3270";
const FIXED_LOCATIONS = ['Knoxville', 'Clearwater', 'Charlotte', 'Petesville'];

// Helper to assign icons based on keywords
const getIcon = (name: string) => {
  const n = name.toLowerCase();
  if (n.includes('rent') || n.includes('mortgage') || n.includes('home')) return '🏠';
  if (n.includes('model') || n.includes('volvo') || n.includes('gas')) return '🚗';
  if (n.includes('food') || n.includes('groceries') || n.includes('eat') || n.includes('restaurant')) return '🍽️';
  if (n.includes('water') || n.includes('electric') || n.includes('utilit') || n.includes('trash')) return '⚡';
  if (n.includes('phone') || n.includes('cell') || n.includes('wifi')) return '📱';
  if (n.includes('beer') || n.includes('beers') || n.includes('soda') || n.includes('water')) return '🍻';
  if (n.includes('gym') || n.includes('health') || n.includes('doctor')) return '💪';
  if (n.includes('take')) return '🍕';
  if (n.includes('insurance')) return '🛟';
  if (n.includes('philo') || n.includes('netflix') || n.includes('hbo')) return '📺';
   if (n.includes('internet')) return '🛜';
  if (n.includes('wife') || n.includes('husband') || n.includes('salary') || n.includes('paycheck')) return '💰';
  if (n.includes('tucker') || n.includes('odie') || n.includes('pet')) return '🐾';
  return '📦'; // Default icon
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

function App() {
  const [items, setItems] = useState<BudgetItem[]>([]);
  const [locations] = useState<string[]>(FIXED_LOCATIONS);
  const [form, setForm] = useState({ name: '', amounts: FIXED_LOCATIONS.map(() => ''), type: 'expense' as ItemType });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [inlineEditData, setInlineEditData] = useState<{name: string, amounts: string[]}>({ name: '', amounts: [] });
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

  // Keyboard Login Logic for Desktop
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isLocked) return;
      
      if (e.key >= '0' && e.key <= '9' && pin.length < 4) {
        const nextPin = pin + e.key;
        setPin(nextPin);
        if (nextPin.length === 4) {
          if (nextPin === CORRECT_PIN) setIsLocked(false);
          else { setError(true); setTimeout(() => { setPin(""); setError(false); }, 500); }
        }
      }
      if (e.key === 'Backspace') setPin(p => p.slice(0, -1));
      if (e.key === 'Escape') setPin("");
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pin, isLocked]);

  useEffect(() => {
    const q = query(collection(db, "budget"), orderBy("order", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as BudgetItem[]);
    });
    return () => unsubscribe();
  }, []);

  const mortgageResult = useMemo(() => {
    const principal = mortgage.price - mortgage.downPayment;
    const monthlyRate = (mortgage.interest / 100) / 12;
    const totalPayments = mortgage.term * 12;
    const pAndI = principal > 0 ? (principal * monthlyRate * Math.pow(1 + monthlyRate, totalPayments)) / (Math.pow(1 + monthlyRate, totalPayments) - 1) : 0;
    const tax = mortgage.annualTax / 12;
    const insurance = mortgage.annualInsurance / 12;
    return { pAndI, tax, insurance, total: pAndI + tax + insurance };
  }, [mortgage]);

  const comparisonTotals = useMemo(() => {
    return locations.map((_, locIdx) => {
      const calculateTotal = (type: ItemType) => items
        .filter(i => i.type === type)
        .reduce((sum, i) => sum + (i.amounts ? (i.amounts[locIdx] ?? i.amounts[0]) : (i.amount || 0)), 0);
      return { netIncome: calculateTotal('income'), expenses: calculateTotal('expense'), surplus: calculateTotal('income') - calculateTotal('expense') };
    });
  }, [items, locations]);

  const handleNumChange = (val: string) => val === '' ? '' : val.replace(/[^0-9.]/g, '');

  const startInlineEdit = (item: BudgetItem) => {
    setEditingId(item.id);
    setInlineEditData({
      name: item.name,
      amounts: item.amounts ? item.amounts.map(String) : locations.map(() => String(item.amount || '0'))
    });
  };

  const saveInlineEdit = async (id: string) => {
    const processedAmounts = inlineEditData.amounts.map((val, i) => 
      i === 0 ? Number(val) : (val === '' ? Number(inlineEditData.amounts[0]) : Number(val))
    );
    await updateDoc(doc(db, "budget", id), { name: inlineEditData.name, amounts: processedAmounts });
    setEditingId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || form.amounts[0] === '') return;
    const processedAmounts = form.amounts.map((val, i) => i === 0 ? Number(val) : (val === '' ? Number(form.amounts[0]) : Number(val)));
    const maxOrder = items.length > 0 ? Math.max(...items.map(i => i.order)) : 0;
    await addDoc(collection(db, "budget"), { name: form.name, amounts: processedAmounts, type: form.type, order: maxOrder + 1, notes: '' });
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
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-2 hidden md:block">Use Keyboard to Enter PIN</p>
            </div>
            <div className="flex gap-6 mb-16">
              {[0, 1, 2, 3].map(i => (
                <div key={i} className={`w-4 h-4 rounded-full border-2 transition-all duration-300 ${pin.length > i ? 'bg-slate-900 border-slate-900 scale-125 shadow-lg' : 'border-slate-200'}`} />
              ))}
            </div>
            <div className="grid grid-cols-3 gap-x-8 gap-y-5">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "Clear", "0", "Back"].map((btn, i) => (
                <button key={i} onClick={() => {
                  if (btn === "Back") setPin(p => p.slice(0, -1));
                  else if (btn === "Clear") setPin("");
                  else if (pin.length < 4) {
                    const n = pin + btn; setPin(n);
                    if (n.length === 4) {
                      if (n === CORRECT_PIN) setIsLocked(false);
                      else { setError(true); setTimeout(() => { setPin(""); setError(false); }, 500); }
                    }
                  }
                }} className="w-16 h-16 flex items-center justify-center rounded-full transition-all active:scale-90 bg-slate-100 hover:bg-slate-200">
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
          <div className="flex items-center gap-4">
            <h1 className="text-4xl font-black tracking-tighter">Budget <span className="text-indigo-600 italic underline decoration-indigo-100 underline-offset-8">Vault</span></h1>
            <button onClick={() => { setIsLocked(true); setPin(""); }} className="text-slate-300 hover:text-slate-900 transition-colors pt-2">🔒</button>
          </div>
          <div className="flex gap-3 w-full md:w-auto">
            <button onClick={() => setShowMortgage(!showMortgage)} className={`flex-1 md:flex-none px-6 py-4 rounded-3xl font-black text-[10px] uppercase tracking-widest transition-all shadow-sm ${showMortgage ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>Mortgage</button>
            <button onClick={() => setShowForm(!showForm)} className={`flex-1 md:flex-none px-8 py-4 rounded-3xl font-black text-[10px] uppercase tracking-widest transition-all shadow-xl ${showForm ? 'bg-rose-500 text-white' : 'bg-slate-900 text-white hover:bg-indigo-600'}`}>
              {showForm ? 'Close' : '+ Add Entry'}
            </button>
          </div>
        </header>

        {showMortgage && (
          <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-indigo-50 mb-12 animate-in fade-in slide-in-from-top-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
              <div className="space-y-6">
                <h3 className="font-black text-2xl tracking-tighter text-indigo-600">Estimator</h3>
                <div className="grid grid-cols-2 gap-4">
                  {Object.entries(mortgage).map(([key, val]) => (
                    <div key={key}>
                      <label className="text-[9px] font-black text-slate-300 uppercase tracking-widest ml-2 mb-1 block">{key.replace(/([A-Z])/g, ' $1')}</label>
                      <input type="number" className="w-full p-4 bg-slate-50 rounded-2xl font-bold outline-none border border-transparent focus:border-indigo-100 transition-all" value={val} onChange={e => setMortgage({...mortgage, [key]: Number(e.target.value)})} />
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-slate-900 rounded-[2rem] p-8 text-white flex flex-col justify-center">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Estimated Monthly Payment</p>
                <h4 className="text-5xl font-black tracking-tighter mb-8 text-indigo-400">{formatCurrency(mortgageResult.total)}</h4>
                <div className="grid grid-cols-3 gap-4 border-t border-slate-800 pt-8">
                  <div><p className="text-[8px] font-bold text-slate-500 uppercase mb-1">P&I</p><p className="font-bold">{formatCurrency(mortgageResult.pAndI)}</p></div>
                  <div><p className="text-[8px] font-bold text-slate-500 uppercase mb-1">Tax</p><p className="font-bold">{formatCurrency(mortgageResult.tax)}</p></div>
                  <div><p className="text-[8px] font-bold text-slate-500 uppercase mb-1">Ins.</p><p className="font-bold">{formatCurrency(mortgageResult.insurance)}</p></div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-12">
          {locations.map((loc, i) => (
            <div key={i} className="bg-white p-6 md:p-8 rounded-[2rem] md:rounded-[2.5rem] shadow-sm border border-slate-100">
              <p className="w-full font-black text-lg md:text-xl text-slate-800 mb-6">{loc}</p>
              <div className="space-y-5">
                <div><p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Net Monthly Income</p><p className="text-lg font-bold text-slate-700">{formatCurrency(comparisonTotals[i].netIncome)}</p></div>
                <div><p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Monthly Expenses</p><p className="text-lg font-bold text-rose-500">{formatCurrency(comparisonTotals[i].expenses)}</p></div>
                <div className="pt-5 border-t border-slate-50"><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Net Surplus</p><p className="text-2xl md:text-3xl font-black tracking-tighter text-indigo-600">{formatCurrency(comparisonTotals[i].surplus)}</p></div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-12">
          {showForm && (
            <div className="w-full max-w-2xl mx-auto mb-6">
                <form ref={formRef} onSubmit={handleSubmit} className="bg-white p-6 md:p-10 rounded-[2.5rem] md:rounded-[3rem] shadow-xl space-y-6 border border-slate-50">
                    <h3 className="font-black text-xl tracking-tight">New Entry</h3>
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
                    <button className="w-full bg-slate-900 text-white font-black text-[10px] uppercase tracking-widest py-5 rounded-[1.5rem] shadow-2xl hover:bg-indigo-600 transition-all">Add to Vault</button>
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
                  {items.filter(i => i.type === type).map((item) => {
                    const isEditing = editingId === item.id;
                    return (
                      <div key={item.id} className="p-6 md:px-10 md:py-8 flex flex-col md:flex-row items-start md:items-center hover:bg-slate-50/50 transition-all group">
                        <div className="w-full md:w-1/3 flex items-center justify-between md:justify-start gap-4 mb-4 md:mb-0">
                          <div className="flex items-center gap-4 w-full">
                              <div className="flex flex-col opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button onClick={() => moveItem(item, 'up')} className="text-slate-200 hover:text-indigo-600 text-[10px] p-1">▲</button>
                                  <button onClick={() => moveItem(item, 'down')} className="text-slate-200 hover:text-indigo-600 text-[10px] p-1">▼</button>
                              </div>
                              <div className="flex items-center gap-3 w-full">
                                  {!isEditing && <span className="text-xl grayscale group-hover:grayscale-0 transition-all">{getIcon(item.name)}</span>}
                                  {isEditing ? (
                                    <input className="bg-slate-50 border-b-2 border-indigo-400 font-bold outline-none px-2 py-1 w-full" value={inlineEditData.name} onChange={e => setInlineEditData({...inlineEditData, name: e.target.value})} />
                                  ) : (
                                    <span className={`font-bold text-lg md:text-base truncate ${item.amounts?.some(v => v !== item.amounts[0]) ? 'text-indigo-600' : 'text-slate-800'}`}>{item.name}</span>
                                  )}
                              </div>
                          </div>
                          <div className="flex md:hidden gap-3">
                              <button onClick={() => isEditing ? saveInlineEdit(item.id) : startInlineEdit(item)} className={`p-2 rounded-full ${isEditing ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-400'}`}>{isEditing ? '💾' : '✎'}</button>
                              <button onClick={() => deleteDoc(doc(db, "budget", item.id))} className="p-2 bg-slate-50 rounded-full text-rose-300">✕</button>
                          </div>
                        </div>
                        <div className="flex-1 w-full flex flex-col md:grid gap-2 md:gap-6 mt-2 md:mt-0" style={{ gridTemplateColumns: `repeat(${locations.length}, minmax(0, 1fr))` }}>
                          {locations.map((loc, lIdx) => {
                            const val = item.amounts ? (item.amounts[lIdx] ?? item.amounts[0]) : (item.amount || 0);
                            const knoxVal = item.amounts ? item.amounts[0] : (item.amount || 0);
                            const isDifferent = lIdx !== 0 && val !== knoxVal;
                            return (
                              <div key={lIdx} className="flex flex-row md:flex-col justify-between md:justify-center items-center bg-slate-50/50 md:bg-transparent px-4 py-3 md:p-0 rounded-xl flex-1 border border-slate-100 md:border-0">
                                <span className="md:hidden text-[9px] font-black uppercase text-slate-400 tracking-widest mr-2">{loc}</span>
                                {isEditing ? (
                                  <input className="w-20 text-center bg-white border border-slate-200 rounded p-1 font-black text-sm outline-none focus:border-indigo-400" value={inlineEditData.amounts[lIdx]} onChange={e => {
                                    const n = [...inlineEditData.amounts]; n[lIdx] = handleNumChange(e.target.value); setInlineEditData({...inlineEditData, amounts: n});
                                  }} />
                                ) : (
                                  <span className={`font-black text-sm whitespace-nowrap ${isDifferent ? 'text-indigo-600 underline decoration-indigo-200' : (lIdx === 0 ? 'text-slate-400' : 'text-black')}`}>{formatCurrency(val)}</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        <div className="hidden md:flex w-20 justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => isEditing ? saveInlineEdit(item.id) : startInlineEdit(item)} className={`transition-colors ${isEditing ? 'text-indigo-600' : 'text-slate-300 hover:text-indigo-600'}`}>{isEditing ? '💾' : '✎'}</button>
                          <button onClick={() => deleteDoc(doc(db, "budget", item.id))} className="text-slate-300 hover:text-rose-500">✕</button>
                        </div>
                      </div>
                    );
                  })}
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