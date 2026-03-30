import React, { useState, useEffect } from 'react';
import { TeleOpData } from '../types';
import { 
  ArrowLeft, 
  Gamepad2, 
  Plus, 
  Minus, 
  Check, 
  AlertCircle, 
  FileText, 
  ArrowRight,
  Target,
  ShieldAlert,
  Zap
} from 'lucide-react';

interface TeleOpFormProps {
  onNext: (data: TeleOpData) => void;
  onBack: () => void;
  initialData?: TeleOpData;
}

const TeleOpForm: React.FC<TeleOpFormProps> = ({ onNext, onBack, initialData }) => {
  // State for counters matching user's HTML state
  const [state, setState] = useState({
    intake: initialData?.intake ?? 3,
    long: initialData?.long ?? 0,
    short: initialData?.short ?? 0,
    gateOpen: initialData?.gateOpen ?? 0,
    gateOverflow: initialData?.gateOverflow ?? 0,
    foulGate: initialData?.foulGate ?? 0,
    foulParking: initialData?.foulParking ?? 0,
    foulIntake: initialData?.foulIntake ?? 0,
  });

  // State for checkboxes
  const [checkboxes, setCheckboxes] = useState({
    liftParkingType: initialData?.liftParkingType ?? false,
    fieldAwareness: initialData?.fieldAwareness ?? false,
    lateTranslation: initialData?.lateTranslation ?? false,
    success: initialData?.success ?? true,
    fastRebound: initialData?.fastRebound ?? false,
    fullParkingType: initialData?.fullParkingType ?? false,
    noParkingType: initialData?.noParkingType ?? false,
    humanPlayer: initialData?.humanPlayer ?? false,
    floor: initialData?.floor ?? false,
    isFrozen: initialData?.isFrozen ?? false,
    confused: initialData?.confused ?? false,
    stoppedScoring: initialData?.stoppedScoring ?? false,
  });

  const [comments, setComments] = useState(initialData?.comments ?? '');
  const [totalScore, setTotalScore] = useState(0);

  const scoringMap: Record<string, number> = { 
    long: 3, 
    short: 2, 
    gateOpen: 1, 
    gateOverflow: 1, 
    foulGate: -2, 
    foulParking: -2, 
    foulIntake: -2 
  };

  useEffect(() => {
    let total = 0;
    Object.keys(scoringMap).forEach(key => {
      total += ((state as any)[key] * scoringMap[key]);
    });
    setTotalScore(total);
  }, [state]);

  const updateCounter = (key: keyof typeof state, delta: number) => {
    setState(prev => ({
      ...prev,
      [key]: Math.max(0, prev[key] + delta)
    }));
  };

  const handleCheckboxChange = (key: keyof typeof checkboxes) => {
    setCheckboxes(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleSubmit = () => {
    onNext({
      ...state,
      ...checkboxes,
      comments,
      totalScore
    });
  };

  const CounterRow = ({ label, value, setter, colorClass = "blue" }: { label: string, value: number, setter: (d: number) => void, colorClass?: string }) => (
    <div className="flex items-center justify-between bg-slate-50 p-3 rounded-lg border border-slate-100">
      <span className="font-bold text-slate-600 text-sm uppercase tracking-tighter">{label}</span>
      <div className="flex items-center gap-3">
        <button 
          type="button"
          onClick={() => setter(-1)} 
          className="w-12 h-12 flex items-center justify-center bg-white rounded-lg shadow-sm border border-slate-200 text-slate-500 active:bg-slate-100 transition-colors"
        >
          <Minus size={24} />
        </button>
        <span className="font-black text-2xl w-8 text-center text-slate-800">{value}</span>
        <button 
          type="button"
          onClick={() => setter(1)} 
          className={`w-12 h-12 flex items-center justify-center bg-white rounded-lg shadow-sm border border-slate-200 text-${colorClass}-600 active:bg-blue-50 transition-colors`}
        >
          <Plus size={24} />
        </button>
      </div>
    </div>
  );

  const CustomCheckbox = ({ label, checked, onChange }: { label: string, checked: boolean, onChange: () => void }) => (
    <button 
      type="button"
      onClick={onChange}
      className={`p-3 rounded-xl border-2 flex items-center justify-between gap-2 transition-all ${checked ? 'bg-emerald-600 border-emerald-500 text-white shadow-md' : 'bg-red-50 border-red-300 text-red-600 font-bold'}`}
    >
      <span className="font-bold text-xs uppercase tracking-widest text-left">{label}</span>
      <div className={`w-6 h-6 rounded flex items-center justify-center ${checked ? 'bg-white text-emerald-600' : 'border-2 border-current opacity-30'}`}>
         {checked && <Check size={14} strokeWidth={4} />}
      </div>
    </button>
  );

  return (
    <div className="bg-slate-50 font-sans text-slate-800 rounded-2xl overflow-hidden" dir="ltr">
      {/* Header */}
      <div className="bg-blue-600 text-white p-4 flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Gamepad2 className="w-5 h-5" />
          TeleOP Scouting
        </h1>
        <div className="bg-blue-700 px-3 py-1 rounded-full flex items-center gap-2 border border-blue-500/30">
          <span className="text-[10px] font-bold uppercase tracking-widest opacity-70">Total Score</span>
          <span className="font-black text-lg">{totalScore}</span>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="bg-slate-100 px-4 py-2 border-b border-slate-200 font-semibold text-slate-700 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Target size={16} />
              <span>Scoring Actions</span>
            </div>
          </div>
          <div className="p-4 space-y-3">
            <CounterRow label="Intake" value={state.intake} setter={(d) => updateCounter('intake', d)} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <CounterRow label="Small Triangle" value={state.long} setter={(d) => updateCounter('long', d)} />
              <CounterRow label="Big Triangle" value={state.short} setter={(d) => updateCounter('short', d)} />
            </div>
          </div>
        </section>

        <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="bg-slate-100 px-4 py-2 border-b border-slate-200 font-semibold text-slate-700 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Zap size={16} />
              <span>Gate Management</span>
            </div>
          </div>
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <CounterRow label="Gate Open" value={state.gateOpen} setter={(d) => updateCounter('gateOpen', d)} />
            <CounterRow label="Gate Overflow" value={state.gateOverflow} setter={(d) => updateCounter('gateOverflow', d)} />
          </div>
        </section>

        <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="bg-slate-100 px-4 py-2 border-b border-slate-200 font-semibold text-red-700 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <AlertCircle size={16} />
              <span>Fouls</span>
            </div>
          </div>
          <div className="p-4 space-y-3">
             <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
               <CounterRow label="Gate Foul" value={state.foulGate} setter={(d) => updateCounter('foulGate', d)} colorClass="red" />
               <CounterRow label="Parking Foul" value={state.foulParking} setter={(d) => updateCounter('foulParking', d)} colorClass="red" />
               <CounterRow label="Intake Foul" value={state.foulIntake} setter={(d) => updateCounter('foulIntake', d)} colorClass="red" />
             </div>
          </div>
        </section>

        <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="bg-slate-100 px-4 py-2 border-b border-slate-200 font-semibold text-slate-700">
            Performance Metrics
          </div>
          <div className="p-4 grid grid-cols-2 gap-3">
            <CustomCheckbox label="Lift" checked={checkboxes.liftParkingType} onChange={() => handleCheckboxChange('liftParkingType')} />
            <CustomCheckbox label="Awareness" checked={checkboxes.fieldAwareness} onChange={() => handleCheckboxChange('fieldAwareness')} />
            <CustomCheckbox label="Late Trans" checked={checkboxes.lateTranslation} onChange={() => handleCheckboxChange('lateTranslation')} />
            <CustomCheckbox label="Fast Rebound" checked={checkboxes.fastRebound} onChange={() => handleCheckboxChange('fastRebound')} />
            <CustomCheckbox label="Full Park" checked={checkboxes.fullParkingType} onChange={() => handleCheckboxChange('fullParkingType')} />
            <CustomCheckbox label="No Park" checked={checkboxes.noParkingType} onChange={() => handleCheckboxChange('noParkingType')} />
            <CustomCheckbox label="Human" checked={checkboxes.humanPlayer} onChange={() => handleCheckboxChange('humanPlayer')} />
            <CustomCheckbox label="Floor" checked={checkboxes.floor} onChange={() => handleCheckboxChange('floor')} />
            <CustomCheckbox label="Frozen" checked={checkboxes.isFrozen} onChange={() => handleCheckboxChange('isFrozen')} />
            <CustomCheckbox label="Confused" checked={checkboxes.confused} onChange={() => handleCheckboxChange('confused')} />
            <CustomCheckbox label="Stopped" checked={checkboxes.stoppedScoring} onChange={() => handleCheckboxChange('stoppedScoring')} />
            <div className="col-span-2">
              <CustomCheckbox label="Overall Success" checked={checkboxes.success} onChange={() => handleCheckboxChange('success')} />
            </div>
          </div>
        </section>

        <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="bg-slate-100 px-4 py-2 border-b border-slate-200 font-semibold text-slate-700 flex items-center gap-2">
            <FileText size={16} />
            <span>Driver Observations</span>
          </div>
          <div className="p-4">
            <textarea 
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              className="w-full h-24 p-3 border border-slate-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 outline-none text-sm text-slate-800"
              placeholder="Driver notes..."
            ></textarea>
          </div>
        </section>

        <div className="flex gap-4 pt-2 pb-6">
          <button 
            type="button"
            onClick={onBack}
            className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 py-4 rounded-xl font-bold flex items-center justify-center gap-2"
          >
            <ArrowLeft size={20} />
            Back
          </button>
          <button 
            type="button"
            onClick={handleSubmit}
            className="flex-[2] bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-xl shadow-xl font-bold flex items-center justify-center gap-2 transform active:scale-95"
          >
            Review Summary
            <ArrowRight size={20} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default TeleOpForm;