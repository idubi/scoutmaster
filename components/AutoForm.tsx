
import React, { useState } from 'react';
import { AutoData } from '../types';
import { Settings, Check, Minus, Plus, ArrowRight } from 'lucide-react';

interface AutoFormProps {
  onNext: (data: AutoData) => void;
  initialData: AutoData;
}

const AutoForm: React.FC<AutoFormProps> = ({ onNext, initialData }) => {
  const [matchNumber, setMatchNumber] = useState(initialData.matchNumber);
  const [teamScouted, setTeamScouted] = useState(initialData.teamScouted);
  
  // Fix: Added ballsMissed to the state to match AutoData interface requirements
  const [formData, setFormData] = useState({
    zoneType: initialData.zoneType, 
    leave: initialData.leave,
    cycles: initialData.cycles,
    openGate: initialData.openGate,
    intake: initialData.intake,
    ballsSide: initialData.ballsSide,
    ballsMissed: initialData.ballsMissed || 0,
    freeText: initialData.freeText
  });

  // Requirement: Synchronized total score
  const totalCyclesScore = formData.cycles.reduce((acc, curr) => acc + curr.count, 0);
  const totalScore = totalCyclesScore + formData.ballsSide;

  const toggleZoneType = (type: string) => {
    setFormData(prev => ({
      ...prev,
      zoneType: prev.zoneType === type ? '' : type
    }));
  };

  const toggleCycleCollected = (id: string) => {
    setFormData(prev => ({
      ...prev,
      cycles: prev.cycles.map(c => {
        if (c.id === id) {
          const nextCollected = !c.collected;
          // Requirement: Once found is clicked, score is 3
          return { ...c, collected: nextCollected, count: nextCollected ? Math.max(c.count, 3) : c.count };
        }
        return c;
      })
    }));
  };

  const updateCycleCount = (id: string, delta: number) => {
    setFormData(prev => ({
      ...prev,
      cycles: prev.cycles.map(c => 
        c.id === id ? { ...c, count: Math.max(0, c.count + delta) } : c
      )
    }));
  };

  const handleBallsChange = (delta: number) => {
    setFormData(prev => ({
      ...prev,
      ballsSide: Math.max(0, prev.ballsSide + delta)
    }));
  };

  // Fix: Added handler for ballsMissed property
  const handleMissedChange = (delta: number) => {
    setFormData(prev => ({
      ...prev,
      ballsMissed: Math.max(0, prev.ballsMissed + delta)
    }));
  };

  const handleNextStep = () => {
    // Fix: Now spreading formData correctly includes ballsMissed, satisfying AutoData
    onNext({
      matchNumber,
      teamScouted,
      ...formData,
      totalScore
    });
  };

  return (
    <div className="bg-slate-50 font-sans text-slate-800 rounded-2xl overflow-hidden" dir="ltr">
      <div className="bg-blue-600 text-white p-4 flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Settings className="w-5 h-5" />
          Autonomous
        </h1>
        <div className="flex gap-2">
          <div className="flex flex-col items-end">
            <span className="text-[9px] uppercase font-black opacity-60">Match</span>
            <input 
              type="text" 
              className="w-14 text-xs bg-blue-700 px-2 py-1 rounded text-white outline-none border-none font-bold"
              value={matchNumber}
              onChange={(e) => setMatchNumber(e.target.value)}
            />
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[9px] uppercase font-black opacity-60">Team</span>
            <input 
              type="text" 
              className="w-14 text-xs bg-blue-700 px-2 py-1 rounded text-white outline-none border-none font-bold"
              value={teamScouted}
              onChange={(e) => setTeamScouted(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="bg-slate-100 px-4 py-2 border-b border-slate-200 font-semibold text-slate-700 flex justify-between items-center">
            <span>Setup</span>
            <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Zone & Mobility</span>
          </div>
          
          <div className="p-4 grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Zone Type</span>
              <div className="space-y-2">
                {['big', 'small'].map(type => (
                  <button 
                    key={type}
                    onClick={() => toggleZoneType(type)}
                    className={`w-full flex items-center justify-between p-3 rounded-lg border-2 transition-all ${formData.zoneType === type ? 'border-blue-500 bg-blue-50 text-blue-700 font-bold' : 'border-slate-100 bg-slate-50 text-slate-500'}`}
                  >
                    <span className="text-sm capitalize">{type}</span>
                    <div className={`w-4 h-4 rounded-full border-2 ${formData.zoneType === type ? 'border-blue-600 bg-blue-600' : 'border-slate-300'}`} />
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Mobility</span>
              <button 
                onClick={() => setFormData({...formData, leave: !formData.leave})}
                className={`flex-1 rounded-lg border-2 flex items-center justify-center gap-3 transition-all ${formData.leave ? 'bg-green-50 border-green-500 text-green-700' : 'bg-white border-slate-200 text-slate-400'}`}
              >
                <div className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${formData.leave ? 'bg-green-600 border-green-600 text-white' : 'border-slate-300'}`}>
                  {formData.leave && <Check size={16} strokeWidth={4} />}
                </div>
                <span className="font-bold uppercase tracking-tight text-sm">Leave</span>
              </button>
            </div>
          </div>
        </section>

        <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="bg-slate-100 px-4 py-2 border-b border-slate-200 font-semibold text-slate-700 flex justify-between items-center">
            <span>Cycles</span>
            <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Rapid Scoring</span>
          </div>
          
          <div className="p-2">
            <div className="grid grid-cols-12 gap-2 text-[10px] font-bold text-slate-400 text-center mb-2 uppercase items-center">
              <div className="col-span-3 text-left pl-2">Cycle</div>
              <div className="col-span-2">Found</div>
              <div className="col-span-4">Score</div>
              <div className="col-span-3">Action</div>
            </div>
            
            <div className="space-y-2">
              {formData.cycles.map((cycle) => (
                <div key={cycle.id} className="grid grid-cols-12 gap-2 items-center bg-slate-50 p-2 rounded-lg border border-slate-100">
                  <div className="col-span-3 font-bold text-slate-600 pl-2 text-xs uppercase tracking-tighter truncate">
                    {cycle.id}
                  </div>
                  <div className="col-span-2 flex justify-center">
                    <button 
                      onClick={() => toggleCycleCollected(cycle.id)}
                      className={`w-8 h-8 rounded-lg border-2 flex items-center justify-center transition-all ${cycle.collected ? 'bg-indigo-500 border-indigo-500 text-white' : 'bg-white border-slate-200 text-slate-200'}`}
                    >
                       <Check size={16} strokeWidth={4} />
                    </button>
                  </div>
                  <div className="col-span-4 flex items-center justify-center gap-1.5">
                    <button onClick={() => updateCycleCount(cycle.id, -1)} className="w-7 h-7 flex items-center justify-center bg-white rounded shadow-xs border border-slate-200 text-slate-500 active:bg-slate-100">
                      <Minus size={12} />
                    </button>
                    <span className="font-black text-sm w-5 text-center text-slate-800">{cycle.count}</span>
                    <button onClick={() => updateCycleCount(cycle.id, 1)} className="w-7 h-7 flex items-center justify-center bg-white rounded shadow-xs border border-slate-200 text-blue-600 active:bg-blue-50">
                      <Plus size={12} />
                    </button>
                  </div>
                  <div className="col-span-3">
                    <button 
                      onClick={() => updateCycleCount(cycle.id, 3)}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-1.5 rounded text-[10px] font-black uppercase shadow-sm"
                    >
                      +3
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <button 
                onClick={() => setFormData({...formData, openGate: !formData.openGate})}
                className={`p-3 rounded-xl border-2 flex flex-col items-center justify-center gap-2 transition-all ${formData.openGate ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' : 'bg-white border-slate-200 text-slate-400'}`}
              >
                <div className={`w-10 h-5 rounded-full p-1 transition-colors ${formData.openGate ? 'bg-indigo-400' : 'bg-slate-300'}`}>
                  <div className={`w-3 h-3 bg-white rounded-full transition-transform ${formData.openGate ? 'translate-x-5' : ''}`}></div>
                </div>
                <span className="font-bold text-[10px] uppercase tracking-widest">Open Gate</span>
              </button>

              <button 
                 onClick={() => setFormData({...formData, intake: !formData.intake})}
                className={`p-3 rounded-xl border-2 flex flex-col items-center justify-center gap-2 transition-all ${formData.intake ? 'bg-teal-600 border-teal-600 text-white shadow-md' : 'bg-white border-slate-200 text-slate-400'}`}
              >
                <div className={`w-6 h-6 rounded flex items-center justify-center ${formData.intake ? 'bg-white text-teal-600' : 'border-2 border-slate-300'}`}>
                   {formData.intake && <Check size={14} strokeWidth={4} />}
                </div>
                <span className="font-bold text-[10px] uppercase tracking-widest">Intake</span>
              </button>
            </div>

            <div className="p-4 bg-slate-900 rounded-2xl border border-slate-700 space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-black text-white flex items-center gap-2 uppercase text-xs tracking-widest">
                   <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                   Balls Secured
                </span>
                <div className="flex items-center gap-4">
                  <button onClick={() => handleBallsChange(-1)} className="w-10 h-10 flex items-center justify-center bg-slate-800 rounded-lg text-white border border-slate-700">
                    <Minus size={18} />
                  </button>
                  <span className="font-black text-3xl w-8 text-center text-orange-500">{formData.ballsSide}</span>
                  <button onClick={() => handleBallsChange(1)} className="w-10 h-10 flex items-center justify-center bg-slate-800 rounded-lg text-white border border-slate-700">
                    <Plus size={18} />
                  </button>
                </div>
              </div>

              {/* Fix: Added Balls Missed UI counter to satisfy functional and type requirements */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                <span className="font-black text-white flex items-center gap-2 uppercase text-xs tracking-widest">
                   <div className="w-2 h-2 rounded-full bg-red-500"></div>
                   Balls Missed
                </span>
                <div className="flex items-center gap-4">
                  <button onClick={() => handleMissedChange(-1)} className="w-10 h-10 flex items-center justify-center bg-slate-800 rounded-lg text-white border border-slate-700">
                    <Minus size={18} />
                  </button>
                  <span className="font-black text-3xl w-8 text-center text-red-500">{formData.ballsMissed}</span>
                  <button onClick={() => handleMissedChange(1)} className="w-10 h-10 flex items-center justify-center bg-slate-800 rounded-lg text-white border border-slate-700">
                    <Plus size={18} />
                  </button>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-slate-800 flex justify-between items-center">
                <span className="text-slate-500 font-bold text-[10px] uppercase tracking-widest">Sync Total Score</span>
                <span className="text-2xl font-black text-emerald-500">{totalScore}</span>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4">
            <textarea 
              className="w-full h-20 p-3 bg-slate-50 border border-slate-200 rounded-lg resize-none focus:ring-1 focus:ring-blue-500 outline-none text-sm text-slate-800"
              placeholder="Auto-phase observations..."
              value={formData.freeText}
              onChange={(e) => setFormData({...formData, freeText: e.target.value})}
            ></textarea>
          </div>
        </section>

        <button 
          onClick={handleNextStep}
          className="w-full py-5 rounded-2xl shadow-xl font-black uppercase tracking-widest text-sm flex items-center justify-center gap-2 transition-all transform active:scale-95 bg-blue-600 text-white hover:bg-blue-700"
        >
          Confirm Auto Performance
          <ArrowRight size={20} />
        </button>
      </div>
    </div>
  );
};

export default AutoForm;
