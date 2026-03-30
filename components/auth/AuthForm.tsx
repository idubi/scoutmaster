import React from 'react';
import { Users, UserCircle2, Hash, Zap } from 'lucide-react';
import { Language } from '../../types';
import { AuthTranslation_EN, AuthTranslation_HE } from '../translations';

interface AuthFormProps {
  name: string;
  teamScouted: string;
  gameNumber: string;
  role: 'scouter' | 'admin';
  allianceColor: 'Red' | 'Blue';
  scouterRole: 'Small Triangle' | 'Near Big Goal';
  setName: (v: string) => void;
  setTeamScouted: (v: string) => void;
  setGameNumber: (v: string) => void;
  setRole: (v: 'scouter' | 'admin') => void;
  setAllianceColor: (v: 'Red' | 'Blue') => void;
  setScouterRole: (v: 'Small Triangle' | 'Near Big Goal') => void;
  onSubmit: (e: React.FormEvent, mode?: 'investigate' | 'manage') => void;
  language: Language;
}

const AuthForm: React.FC<AuthFormProps> = (props) => {
  const t: any = props.language === Language.HE ? AuthTranslation_HE : AuthTranslation_EN;
  const isRTL = props.language === Language.HE;

  return (
    <div className="max-w-md mx-auto bg-white rounded-[2rem] p-6 shadow-2xl border border-slate-200 font-sans">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-indigo-600/10 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-indigo-100 shadow-sm">
          <Zap size={32} />
        </div>
        <h2 className={`text-2xl font-black text-slate-900 uppercase tracking-tighter ${isRTL ? 'text-2xl' : ''}`}>{t.title}</h2>
        <p className={`text-slate-500 font-medium ${isRTL ? 'text-base' : 'text-sm'}`}>{t.subtitle}</p>
      </div>

      <form onSubmit={props.onSubmit} className="space-y-4">
        <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="relative group">
            <Hash className={`absolute ${isRTL ? 'right-4' : 'left-4'} top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors`} size={18} />
            <input
              type="text" 
              inputMode="numeric"
              disabled={props.role === 'admin'}
              className={`w-full bg-slate-50 border border-slate-200 rounded-xl py-4 ${isRTL ? 'pr-12 pl-4 text-right' : 'pl-12 pr-4 text-left'} text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all placeholder:text-slate-400 font-bold ${isRTL ? 'text-base' : 'text-sm'} ${props.role === 'admin' ? 'opacity-50 cursor-not-allowed bg-slate-100' : ''}`}
              placeholder={t.matchNumber}
              value={props.role === 'admin' ? '' : props.gameNumber}
              onChange={(e) => props.setGameNumber(e.target.value)}
            />
          </div>

          <div className="relative group">
            <UserCircle2 className={`absolute ${isRTL ? 'right-4' : 'left-4'} top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors`} size={18} />
            <input
              type="text"
              className={`w-full bg-slate-50 border border-slate-200 rounded-xl py-4 ${isRTL ? 'pr-12 pl-4 text-right' : 'pl-12 pr-4 text-left'} text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all placeholder:text-slate-400 font-bold ${isRTL ? 'text-base' : 'text-sm'}`}
              placeholder={props.role === 'admin' ? t.adminName : t.scouterName}
              value={props.name}
              onChange={(e) => props.setName(e.target.value)}
            />
          </div>

          <div className="relative group">
            <Users className={`absolute ${isRTL ? 'right-4' : 'left-4'} top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors`} size={18} />
            <input
              type="text" 
              inputMode="numeric"
              disabled={props.role === 'admin'}
              className={`w-full bg-slate-50 border border-slate-200 rounded-xl py-4 ${isRTL ? 'pr-12 pl-4 text-right' : 'pl-12 pr-4 text-left'} text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all placeholder:text-slate-400 font-bold ${isRTL ? 'text-base' : 'text-sm'} ${props.role === 'admin' ? 'opacity-50 cursor-not-allowed bg-slate-100' : ''}`}
              placeholder={t.teamNumber}
              value={props.role === 'admin' ? '' : props.teamScouted}
              onChange={(e) => props.setTeamScouted(e.target.value)}
            />
          </div>
        </div>

        {props.role === 'scouter' && (
          <div className="pt-2 animate-in fade-in slide-in-from-top-2 duration-300">
            <span className={`block font-black text-slate-400 uppercase tracking-widest text-center mb-3 ${isRTL ? 'text-[12px]' : 'text-[10px]'}`}>{t.teamColor}</span>
            <div className="grid grid-cols-2 gap-3">
              {[ 
                { key: 'Red', label: t.red, color: 'bg-red-50 text-red-600 border-red-200', activeColor: 'bg-red-600 border-red-500 text-white' }, 
                { key: 'Blue', label: t.blue, color: 'bg-blue-50 text-blue-600 border-blue-200', activeColor: 'bg-blue-600 border-blue-500 text-white' }
              ].map((pos) => (
                <button
                  key={pos.key} type="button" onClick={() => props.setAllianceColor(pos.key as any)}
                  className={`py-4 px-4 rounded-xl border-2 font-black uppercase tracking-widest transition-all ${
                    props.allianceColor === pos.key 
                    ? pos.activeColor + ' shadow-lg scale-[1.02]' 
                    : pos.color
                  } ${isRTL ? 'text-sm' : 'text-xs'}`}
                >
                  {pos.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {props.role === 'scouter' && (
          <div className="pt-2 animate-in fade-in slide-in-from-top-2 duration-300">
            <span className={`block font-black text-slate-400 uppercase tracking-widest text-center mb-3 ${isRTL ? 'text-[12px]' : 'text-[10px]'}`}>{t.scouterRole}</span>
            <div className="grid grid-cols-2 gap-3">
              {[ 
                { key: 'Small Triangle', label: t.smallTriangle }, 
                { key: 'Near Big Goal', label: t.nearBigGoal }
              ].map((pos) => (
                <button
                  key={pos.key} type="button" onClick={() => props.setScouterRole(pos.key as any)}
                  className={`py-4 px-4 rounded-xl border-2 font-black uppercase tracking-widest transition-all ${
                    props.scouterRole === pos.key 
                    ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg scale-[1.02]' 
                    : 'bg-slate-50 text-slate-600 border-slate-200'
                  } ${isRTL ? 'text-sm' : 'text-xs'}`}
                >
                  {pos.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="pt-2">
          <span className={`block font-black text-slate-400 uppercase tracking-widest text-center mb-3 ${isRTL ? 'text-[12px]' : 'text-[10px]'}`}>{t.accessLevel}</span>
          <div className="grid grid-cols-2 gap-3">
            {[ 
              { key: 'scouter', label: t.scouter }, 
              { key: 'admin', label: t.admin } 
            ].map((r) => (
              <button
                key={r.key} type="button" onClick={() => props.setRole(r.key as 'scouter' | 'admin')}
                className={`py-3.5 px-4 rounded-xl border-2 font-black uppercase tracking-widest transition-all ${
                  props.role === r.key 
                  ? 'bg-emerald-600 border-emerald-500 text-white shadow-lg' 
                  : 'bg-emerald-50 border-emerald-200 text-emerald-600'
                } ${isRTL ? 'text-xs' : 'text-[10px]'}`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {props.role === 'admin' ? (
          <div className="grid grid-cols-2 gap-3 mt-4">
            <button 
              type="button"
              onClick={(e) => props.onSubmit(e as any, 'investigate')}
              className={`bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase tracking-[0.1em] py-5 rounded-2xl transition-all shadow-xl shadow-indigo-600/20 transform active:scale-[0.98] border-b-4 border-indigo-800 ${isRTL ? 'text-base' : 'text-sm'}`}
            >
              {t.investigate}
            </button>
            <button 
              type="button"
              onClick={(e) => props.onSubmit(e as any, 'manage')}
              className={`bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase tracking-[0.1em] py-5 rounded-2xl transition-all shadow-xl shadow-indigo-600/20 transform active:scale-[0.98] border-b-4 border-indigo-800 ${isRTL ? 'text-base' : 'text-sm'}`}
            >
              {t.manage}
            </button>
          </div>
        ) : (
          <button 
            type="submit" 
            className={`w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase tracking-[0.3em] py-5 rounded-2xl transition-all shadow-xl shadow-indigo-600/20 transform active:scale-[0.98] mt-4 border-b-4 border-indigo-800 ${isRTL ? 'text-base' : 'text-sm'}`}
          >
            {t.begin}
          </button>
        )}
      </form>
    </div>
  );
};

export default AuthForm;