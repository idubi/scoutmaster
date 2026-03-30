import React, { useState } from 'react';
import { AutoData, TeleOpData } from '../types';
import { GoogleGenAI } from "@google/genai";
import { CheckCircle2, Wand2, ArrowLeft, Save, Sparkles, AlertCircle, Info } from 'lucide-react';

interface SummaryViewProps {
  auto: AutoData;
  teleop: TeleOpData;
  onFinish: () => void;
  onBack: () => void;
}

const SummaryView: React.FC<SummaryViewProps> = ({ auto, teleop, onFinish, onBack }) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);

  const generateAiAnalysis = async () => {
    setIsAnalyzing(true);
    try {
      // Fix: Use process.env.API_KEY directly as per SDK guidelines
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = `
        As a pro FRC scouting analyst, summarize this match performance for Team ${auto.teamScouted} in Match ${auto.matchNumber}:
        AUTONOMOUS: ${JSON.stringify(auto)}
        TELE-OPERATED: ${JSON.stringify(teleop)}
        Give a short, punchy 3-sentence evaluation of this robot's potential for playoffs based on these stats.
      `;
      
      // Fix: Use gemini-3-pro-preview for complex reasoning tasks like scouting strategy analysis
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: prompt,
      });
      
      // Fix: response.text is a property, not a method
      setAiAnalysis(response.text || "Analysis complete.");
    } catch (error) {
      console.error("AI Analysis failed", error);
      setAiAnalysis("Could not generate AI analysis at this time.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="text-center">
        <div className="w-16 h-16 bg-emerald-500/20 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-500/30">
          <CheckCircle2 size={32} />
        </div>
        <h2 className="text-2xl font-bold text-white">Report for Match #{auto.matchNumber}</h2>
        <p className="text-slate-400">Team {auto.teamScouted} Review</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Autonomous Summary */}
        <div className="bg-slate-800/30 rounded-2xl border border-slate-700 p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-indigo-400 font-bold uppercase text-xs tracking-widest">Autonomous</h3>
            <span className="bg-indigo-900/40 text-indigo-200 px-2 py-1 rounded text-[10px] font-bold">SCORE: {auto.totalScore}</span>
          </div>
          <ul className="space-y-2 text-sm">
            <li className="flex justify-between"><span className="text-slate-400">Zone:</span> <span className="text-white font-medium capitalize">{auto.zoneType || 'N/A'}</span></li>
            <li className="flex justify-between"><span className="text-slate-400">Leave/Mobility:</span> <span className={auto.leave ? "text-emerald-400" : "text-red-400"}>{auto.leave ? "Yes" : "No"}</span></li>
            <li className="pt-2 text-[10px] text-slate-500 font-bold uppercase tracking-tighter">Cycle Detail</li>
            {auto.cycles.map(cycle => (
              <li key={cycle.id} className="flex justify-between pl-2">
                <span className="text-slate-500">{cycle.id}:</span> 
                <span className="text-slate-300">{cycle.collected ? '✅' : '❌'} • {cycle.count} pts</span>
              </li>
            ))}
            <li className="flex justify-between pt-2"><span className="text-slate-400">Gate/Intake:</span> <span className="text-white">{auto.openGate ? 'Open' : 'Closed'} / {auto.intake ? 'Used' : 'None'}</span></li>
          </ul>
        </div>

        {/* TeleOp Summary */}
        <div className="bg-slate-800/30 rounded-2xl border border-slate-700 p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-violet-400 font-bold uppercase text-xs tracking-widest">Tele-Operated</h3>
            <span className="bg-violet-900/40 text-violet-200 px-2 py-1 rounded text-[10px] font-bold">SCORE: {teleop.totalScore}</span>
          </div>
          <ul className="space-y-2 text-sm">
            <li className="flex justify-between"><span className="text-slate-400">Intake/Cycles:</span> <span className="text-white font-medium">{teleop.intake} / {teleop.totalScore} pts</span></li>
            <li className="flex justify-between"><span className="text-slate-400">Triangles (S/B):</span> <span className="text-white font-medium">{teleop.long} / {teleop.short}</span></li>
            <li className="flex justify-between"><span className="text-slate-400">Success Status:</span> <span className={teleop.success ? "text-emerald-400" : "text-red-400"}>{teleop.success ? "Success" : "Failed"}</span></li>
            <li className="flex justify-between"><span className="text-slate-400">Fast Rebound:</span> <span className="text-white font-medium">{teleop.fastRebound ? "Yes" : "No"}</span></li>
            <li className="flex justify-between"><span className="text-slate-400">Late Translation:</span> <span className="text-white font-medium">{teleop.lateTranslation ? "Yes" : "No"}</span></li>
          </ul>
        </div>
      </div>

      {/* AI Analysis Block */}
      {aiAnalysis ? (
        <div className="bg-indigo-900/20 rounded-2xl border border-indigo-500/30 p-6 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-3 opacity-20">
            <Sparkles size={40} className="text-indigo-400" />
          </div>
          <h3 className="text-indigo-300 font-bold flex items-center gap-2 mb-3">
            <Wand2 size={18} />
            Gemini Scout Intelligence
          </h3>
          <p className="text-slate-200 leading-relaxed italic">
            "{aiAnalysis}"
          </p>
        </div>
      ) : (
        <button
          onClick={generateAiAnalysis}
          disabled={isAnalyzing}
          className="w-full bg-slate-800 hover:bg-slate-700 border border-indigo-500/30 text-indigo-300 py-4 rounded-xl font-bold flex items-center justify-center gap-3 transition-all disabled:opacity-50"
        >
          {isAnalyzing ? (
            <>
              <div className="w-5 h-5 border-2 border-indigo-300 border-t-transparent rounded-full animate-spin" />
              Processing Match Data...
            </>
          ) : (
            <>
              <Wand2 size={20} />
              Generate AI Match Analysis
            </>
          )}
        </button>
      )}

      {/* Warnings Block */}
      {(teleop.foulGate > 0 || teleop.foulIntake > 0 || teleop.foulParking > 0) && (
        <div className="bg-red-900/20 border border-red-500/30 p-4 rounded-xl flex items-center gap-3 text-red-200 text-sm">
          <AlertCircle size={20} className="text-red-400 shrink-0" />
          Warning: Match had fouls (Gate: {teleop.foulGate}, Intake: {teleop.foulIntake}, Parking: {teleop.foulParking}).
        </div>
      )}

      <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-800">
        <h4 className="text-xs font-bold text-slate-500 uppercase mb-2 flex items-center gap-2">
          <Info size={14} />
          Combined Notes
        </h4>
        <p className="text-sm text-slate-400 mb-1"><span className="text-indigo-400">Auto:</span> {auto.freeText || 'None'}</p>
        <p className="text-sm text-slate-400"><span className="text-violet-400">Tele:</span> {teleop.comments || 'None'}</p>
      </div>

      <div className="flex justify-between pt-6 border-t border-slate-800">
        <button
          onClick={onBack}
          className="text-slate-400 hover:text-white flex items-center gap-2 transition-colors px-4"
        >
          <ArrowLeft size={18} />
          Change Data
        </button>
        <button
          onClick={onFinish}
          className="bg-emerald-600 hover:bg-emerald-500 text-white px-10 py-4 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-emerald-600/20 active:scale-[0.98]"
        >
          <Save size={20} />
          Submit Match Report
        </button>
      </div>
    </div>
  );
};

export default SummaryView;