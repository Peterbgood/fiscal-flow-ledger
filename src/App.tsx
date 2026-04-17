import { useEffect, useMemo, useState } from 'react';
import { db } from "./firebase"; 
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

type ItemType = 'income' | 'expense';

interface BudgetItem {
  id: string;
  name: string;
  amount: number;
  notes: string;
  type: ItemType;
  order: number;
}

const TAX_RATE = 0.7253; 
const CORRECT_PIN = "3270";

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

function App() {
  const [items, setItems] = useState<BudgetItem[]>([]);
  const [form, setForm] = useState({ name: '', amount: '', notes: '', type: 'expense' as ItemType });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState(true);
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);

  // 1. Fetch data ordered by the custom "order" field
  useEffect(() => {
    const q = query(collection(db, "budget"), orderBy("order", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const mappedData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as BudgetItem[];
      setItems(mappedData);
    });
    return () => unsubscribe();
  }, []);

  // 2. Budget Calculations
  const totals = useMemo(() => {
    const grossIncome = items.filter(i => i.type === 'income').reduce((sum, i) => sum + i.amount, 0);
    const monthlyNet = (grossIncome * TAX_RATE) / 12;
    const expenses = items.filter(i => i.type === 'expense').reduce((sum, i) => sum + i.amount, 0);
    return { monthlyNet, expenses, surplus: monthlyNet - expenses };
  }, [items]);

  const incomes = items.filter(i => i.type === 'income');
  const expensesList = items.filter(i => i.type === 'expense');

  // 3. PIN Logic
  useEffect(() => {
    if (pin.length === 4) {
      if (pin === CORRECT_PIN) {
        setIsLocked(false);
      } else {
        setError(true);
        setTimeout(() => { setPin(""); setError(false); }, 600);
      }
    }
  }, [pin]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isLocked) return;
      if (e.key >= '0' && e.key <= '9' && pin.length < 4) setPin(p => p + e.key);
      if (e.key === 'Backspace') setPin(p => p.slice(0, -1));
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pin, isLocked]);

  // 4. Reorder Logic
  const moveItem = async (currentIndex: number, direction: 'up' | 'down', list: BudgetItem[]) => {
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= list.length) return;

    const currentItem = list[currentIndex];
    const targetItem = list[targetIndex];

    await updateDoc(doc(db, "budget", currentItem.id), { order: targetItem.order });
    await updateDoc(doc(db, "budget", targetItem.id), { order: currentItem.order });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.amount) return;
    
    if (editingId) {
      await updateDoc(doc(db, "budget", editingId), { 
        name: form.name, 
        amount: Number(form.amount), 
        type: form.type 
      });
    } else {
      const maxOrder = items.length > 0 ? Math.max(...items.map(i => i.order)) : 0;
      await addDoc(collection(db, "budget"), {
        name: form.name,
        amount: Number(form.amount),
        type: form.type,
        order: maxOrder + 1,
        notes: ''
      });
    }
    setForm({ name: '', amount: '', notes: '', type: 'expense' });
    setEditingId(null);
  };

  const chartData = {
    labels: ['Monthly Net', 'Expenses', 'Surplus'],
    datasets: [{
      data: [totals.monthlyNet, totals.expenses, totals.surplus],
      backgroundColor: ['#10b981', '#f43f5e', '#6366f1'],
      borderRadius: 12,
    }]
  };

  if (isLocked) {
    return (
      <div className="fixed inset-0 bg-slate-950 flex flex-col items-center justify-center p-6 text-white">
        <div className={`w-full max-w-xs ${error ? 'animate-shake' : ''}`}>
          <div className="text-center mb-10">
            <h2 className="text-2xl font-black tracking-tight">Knoxville Budget</h2>
            <p className="text-slate-500 text-sm mt-1 tracking-widest uppercase font-bold">Secure Access</p>
          </div>
          <div className="flex justify-center gap-4 mb-12">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className={`w-4 h-4 rounded-full border-2 transition-all ${pin.length > i ? 'bg-indigo-500 border-indigo-500 scale-125' : 'border-slate-700'}`} />
            ))}
          </div>
          <div className="grid grid-cols-3 gap-4">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((btn, i) => (
              <button key={i} onClick={() => btn === "⌫" ? setPin(p => p.slice(0, -1)) : btn && setPin(p => p + btn)}
                className={`h-16 w-16 mx-auto flex items-center justify-center text-2xl font-bold rounded-full transition-all ${btn === "" ? "opacity-0 pointer-events-none" : "bg-slate-900 border border-slate-800 hover:bg-slate-800 active:scale-90"}`}>
                {btn}
              </button>
            ))}
          </div>
        </div>
        <style>{`@keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-10px); } 75% { transform: translateX(10px); } } .animate-shake { animation: shake 0.2s ease-in-out 3; }`}</style>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 text-slate-900">
      <div className="max-w-6xl mx-auto">
        <header className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-black">Budget Tracker</h1>
          <button onClick={() => { setIsLocked(true); setPin(""); }} className="bg-white border px-6 py-2 rounded-xl font-bold text-slate-400 hover:text-slate-600 transition-colors">Lock</button>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Monthly Net (After Tax)</p>
            <p className="text-3xl font-black text-emerald-600">{formatCurrency(totals.monthlyNet)}</p>
          </div>
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Expenses</p>
            <p className="text-3xl font-black text-rose-500">{formatCurrency(totals.expenses)}</p>
          </div>
          <div className="bg-white p-6 rounded-3xl border border-indigo-100 bg-indigo-50/30 shadow-sm">
            <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Monthly Surplus</p>
            <p className="text-3xl font-black text-indigo-600">{formatCurrency(totals.surplus)}</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm mb-8 h-80">
          <Bar data={chartData} options={{ maintainAspectRatio: false, plugins: { legend: { display: false } } }} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-4">
            <form onSubmit={handleSubmit} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm sticky top-8 space-y-4">
              <h2 className="font-bold text-lg mb-2">{editingId ? 'Edit Entry' : 'Add Entry'}</h2>
              <div className="flex p-1 bg-slate-100 rounded-2xl">
                {(['income', 'expense'] as const).map(t => (
                  <button key={t} type="button" onClick={() => setForm({...form, type: t})}
                    className={`flex-1 py-2 text-xs font-bold uppercase tracking-widest rounded-xl transition-all ${form.type === t ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400'}`}>
                    {t}
                  </button>
                ))}
              </div>
              <input className="w-full p-4 bg-slate-50 rounded-2xl border-none ring-1 ring-slate-200 outline-none" placeholder="Name" value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
              <input className="w-full p-4 bg-slate-50 rounded-2xl border-none ring-1 ring-slate-200 outline-none" type="number" placeholder="Amount" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} />
              <button className="w-full bg-slate-900 text-white font-bold py-4 rounded-2xl shadow-lg">Save Record</button>
            </form>
          </div>

          <div className="lg:col-span-8 space-y-8">
            {[ 
              { title: 'Income Sources', data: incomes, color: 'emerald' },
              { title: 'Monthly Expenses', data: expensesList, color: 'rose' }
            ].map((section) => (
              <section key={section.title} className="bg-white rounded-3xl border shadow-sm overflow-hidden">
                <div className={`p-5 bg-${section.color}-50/50 border-b font-bold text-xs uppercase tracking-widest text-${section.color}-600`}>
                  {section.title}
                </div>
                <div className="divide-y">
                  {section.data.map((item, index) => (
                    <div key={item.id} className="p-5 flex justify-between items-center hover:bg-slate-50 group">
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => moveItem(index, 'up', section.data)} className="text-slate-300 hover:text-indigo-600 text-[10px]">▲</button>
                          <button onClick={() => moveItem(index, 'down', section.data)} className="text-slate-300 hover:text-indigo-600 text-[10px]">▼</button>
                        </div>
                        <span className="font-bold">{item.name}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className={`font-black ${item.type === 'income' ? 'text-emerald-600' : 'text-slate-900'}`}>{formatCurrency(item.amount)}</span>
                        <div className="opacity-0 group-hover:opacity-100 flex gap-1">
                          <button onClick={() => { setEditingId(item.id); setForm({name: item.name, amount: String(item.amount), notes: item.notes, type: item.type}) }} className="text-slate-300 hover:text-indigo-600 p-2">✎</button>
                          <button onClick={() => deleteDoc(doc(db, "budget", item.id))} className="text-slate-300 hover:text-rose-600 p-2">✕</button>
                        </div>
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