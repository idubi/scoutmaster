import React, { useState } from 'react';
import dayjs from 'dayjs';
import { ScoutingPhase, User, AutoData, TeleOpData, SpreadsheetRow, Language } from './types';
import AuthBinding from './components/auth/AuthBinding';
import AutoBinding from './components/auto/AutoBinding';
import TeleOpBinding from './components/teleop/TeleOpBinding';
import SummaryBinding from './components/summary/SummaryBinding';
import AdminBinding from './components/admin/AdminBinding';
import { Layout } from './components/Layout';
import { AppTranslation_EN, AppTranslation_HE, AuthTranslation_EN, AuthTranslation_HE } from './components/translations';
import { 
  ClipboardList, 
  Radio, 
  Cpu, 
  BarChart3,
  ArrowLeft,
  X
} from 'lucide-react';

const GOOGLE_SHEET_URL = 'https://script.google.com/macros/s/AKfycbyIwBD5iPSNDoLt0fwdQ0wGJTsqGWV2pS8rS65mzHg96lSb-n4Ul2OAtR-t2DsHbD7G/exec';
const SPREADSHEET_ID = '1pA-8L0iNw4WJqKXqVHcXLoAUxZDVrJHl_8bYR7pg64Y';

const SHEET_NAME = 'liortestmapping'; // Set your sheet name here

const ALL_HEADERS = [
  // Hebrew Headers (Matching demo-table order)
  'Timestamp', 'שם הסקאוטר', 'מספר קבוצה', 'מספר מקצה', 'צבע ברית', 'אוטונומי - מיקום', 
  'אוטונומי - נסע מהמקום', 'אוטונומי - כדור מנוקד', 'אוטונומי - כדורים שהוחטאו', 
  'הרובוט עשה leave?', 'טלאופ - כדור מנוקד', 'טלאופ - חניה', 'טווח ירי', 'איסוף ', 
  'הערות (אסטרטגיית הגנה, עשה הרבה פאולים, וכו)',
  // Internal App Headers
  'sessionId', 'timestamp', 'sessionStartTime', 'sessionEndTime', 'name', 
  'gameNumber', 'allianceColor', 'matchNumber', 'teamScouted', 'role', 'autoZoneType', 
  'autoMobility_Leave', 
  'autoOpenGate', 'autoIntakeUsed', 'autoBallHit', 'autoBallMiss', 'autoNotes', 'autoTotalScore',
  'teleBallHit', 'teleSmallTriangle_Long', 'teleBigTriangle_Short',
  'teleBallMiss',
  'teleFieldAwareness',
  'teleLateTranslation', 'teleOverallSuccess', 'teleFastRebound', 'teleIsFrozen', 'teleConfused', 'teleStoppedScoring',
  'teleGateFoul', 'teleParkingFoul', 'teleIntakeFoul', 'teleFoulCount',
  'teleHumanPlayer', 'teleFloor', 'teleComments', 'teleTotalScore', 'aiAnalysis', 'recordType', 'targetSheetId'
];

const generateGUID = () => {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

const App: React.FC = () => {
  const [phase, setPhase] = useState<ScoutingPhase>(ScoutingPhase.AUTH);
  const [language, setLanguage] = useState<Language>(Language.HE);
  const [user, setUser] = useState<User | null>(null);
  const [autoData, setAutoData] = useState<AutoData | null>(null);
  const [teleopData, setTeleopData] = useState<TeleOpData | null>(null);
  const [history, setHistory] = useState<SpreadsheetRow[]>([]);
  const [isFetchingHistory, setIsFetchingHistory] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [initStatus, setInitStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'error' | 'success'>('idle');
  const [lastName, setLastName] = useState('');
  const [lastMatchNumber, setLastMatchNumber] = useState('1');
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isNavExpanded, setIsNavExpanded] = useState(false);

  const t = language === Language.HE ? AppTranslation_HE : AppTranslation_EN;

  const checkDuplicate = (historyData: SpreadsheetRow[], team: string, match: string, name: string) => {
    return historyData.some(row => {
      const rowTeam = row['מספר קבוצה'] || row.teamScouted;
      const rowMatch = row['מספר מקצה'] || row.gameNumber || row.matchNumber;
      const rowName = row['שם הסקאוטר'] || row.name;
      const rowRecordType = row['recordType'];
      
      // Only consider it a duplicate if it's a MATCH_COMPLETE record
      if (rowRecordType !== 'MATCH_COMPLETE') return false;

      return String(rowTeam) === String(team) && 
             String(rowMatch) === String(match) &&
             String(rowName).trim().toLowerCase() === String(name).trim().toLowerCase();
    });
  };

  React.useEffect(() => {
    fetchHistory();
  }, []);

  const handleLogout = () => {
    setUser(null);
    setPhase(ScoutingPhase.AUTH);
  };

  const syncToSpreadsheet = async (data: Partial<SpreadsheetRow>) => {
    setSyncStatus('syncing');

    const payload = { ...data, targetSheetId: SPREADSHEET_ID, sheetName: SHEET_NAME, headers: ALL_HEADERS };

    try {
      await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      setSyncStatus('success');
      setTimeout(() => setSyncStatus('idle'), 3000);
    } catch (error) {
      console.error('Sync error:', error);
      setSyncStatus('error');
    }
  };

  const syncScoutData = async (
    recordType: 'SESSION_START' | 'AUTO_COMPLETE' | 'TELEOP_COMPLETE' | 'MATCH_COMPLETE',
    currentAuto?: AutoData | null,
    currentTeleop?: TeleOpData | null,
    currentUser?: User | null,
    aiAnalysisText?: string | null
  ) => {
    const activeUser = currentUser || user;
    if (!activeUser) return;

    const row: Partial<SpreadsheetRow> = {
      sessionId: activeUser.sessionId || '',
      timestamp: new Date().toLocaleString(),
      sessionStartTime: activeUser.sessionStartTime ? new Date(activeUser.sessionStartTime).toISOString() : '',
      sessionEndTime: recordType === 'MATCH_COMPLETE' ? new Date().toISOString() : '',
      name: activeUser.name,
      gameNumber: activeUser.gameNumber,
      allianceColor: activeUser.allianceColor || '',
      matchNumber: currentAuto?.matchNumber || activeUser.gameNumber,
      teamScouted: currentAuto?.teamScouted || activeUser.teamScouted,
      role: activeUser.role,
      recordType,
      
      // Hebrew Mapping
      'Timestamp': new Date().toISOString(),
      'שם הסקאוטר': activeUser.name,
      'מספר קבוצה': currentAuto?.teamScouted || activeUser.teamScouted,
      'מספר מקצה': currentAuto?.matchNumber || activeUser.gameNumber,
      'צבע ברית': activeUser.allianceColor || '',
      'הערות (אסטרטגיית הגנה, עשה הרבה פאולים, וכו)': recordType
    };

    if (currentAuto) {
      Object.assign(row, {
        autoZoneType: currentAuto.zoneType,
        autoMobility_Leave: currentAuto.leave,
        autoOpenGate: currentAuto.openGate,
        autoIntakeUsed: currentAuto.intake,
        autoBallHit: currentAuto.ballsSide,
        autoBallMiss: currentAuto.ballsMissed,
        autoNotes: currentAuto.freeText,
        autoTotalScore: currentAuto.totalScore,
        'אוטונומי - מיקום': currentAuto.zoneType === 'big' ? 'משולש גדול' : (currentAuto.zoneType === 'small' ? 'משולש קטן' : currentAuto.zoneType),
        'אוטונומי - נסע מהמקום': currentAuto.leave ? 'כן' : 'לא',
        'אוטונומי - כדור מנוקד': currentAuto.ballsSide,
        'אוטונומי - כדורים שהוחטאו': currentAuto.ballsMissed,
        'הרובוט עשה leave?': currentAuto.leave ? 'leave' : 'לא',
      });
    }

    if (currentTeleop) {
      Object.assign(row, {
        teleBallHit: currentTeleop.intake,
        teleSmallTriangle_Long: currentTeleop.long,
        teleBigTriangle_Short: currentTeleop.short,
        teleBallMiss: currentTeleop.gateOverflow,
        teleFieldAwareness: currentTeleop.fieldAwareness,
        teleLateTranslation: currentTeleop.lateTranslation,
        teleOverallSuccess: currentTeleop.success,
        teleFastRebound: currentTeleop.fastRebound,
        teleIsFrozen: currentTeleop.isFrozen,
        teleConfused: currentTeleop.confused,
        teleStoppedScoring: currentTeleop.stoppedScoring,
        teleGateFoul: currentTeleop.gateFoul,
        teleParkingFoul: currentTeleop.parkingFoul,
        teleIntakeFoul: currentTeleop.intakeFoul,
        teleFoulCount: (currentTeleop.gateFoul ? 1 : 0) + (currentTeleop.parkingFoul ? 1 : 0) + (currentTeleop.intakeFoul ? 1 : 0),
        teleHumanPlayer: currentTeleop.humanPlayer,
        teleFloor: currentTeleop.floor,
        teleComments: currentTeleop.comments,
        teleTotalScore: currentTeleop.totalScore,
        aiAnalysis: aiAnalysisText || '',
        'טלאופ - כדור מנוקד': currentTeleop.intake,
        'טלאופ - חניה': currentTeleop.liftParkingType ? 'מעלית' : (currentTeleop.fullParkingType ? 'חניה מלאה' : 'לא מעלית'),
        'טווח ירי': `${currentTeleop.long > 0 ? 'משולש קטן' : ''}${currentTeleop.long > 0 && currentTeleop.short > 0 ? ', ' : ''}${currentTeleop.short > 0 ? 'משולש גדול' : ''}` || 'לא ירו',
        'איסוף ': `${currentTeleop.floor ? 'איסוף מהרצפה' : ''}${currentTeleop.floor && currentTeleop.humanPlayer ? ', ' : ''}${currentTeleop.humanPlayer ? 'איסוף מהשחקן האנושי' : ''}` || 'לא אספו',
        'הערות (אסטרטגיית הגנה, עשה הרבה פאולים, וכו)': currentTeleop.comments || recordType
      });
    }

    await syncToSpreadsheet(row);
  };

  const fetchHistory = async () => {
    setIsFetchingHistory(true);
    console.log('fetchHistory: Requesting data for Spreadsheet:', SPREADSHEET_ID, 'Sheet:', SHEET_NAME);
    try {
      console.log('Fetching history from proxy for sheet:', SHEET_NAME);
      const response = await fetch(`/api/history?targetSheetId=${SPREADSHEET_ID}&sheetName=${SHEET_NAME}`);
      if (response.ok) {
        const text = await response.text();
        // Check for specific Google Apps Script errors that mean "empty sheet"
        if (text.includes("Der Bereich muss mindestens 1 Spalte enthalten") || 
            text.includes("The range must contain at least one column")) {
          console.warn('Sheet is empty or missing headers. Setting history to empty array.');
          setHistory([]);
          return;
        }

        try {
          const result = JSON.parse(text);
          console.log('History data received:', result);
          const dataArray = Array.isArray(result) ? result : (result.data && Array.isArray(result.data) ? result.data : []);
          setHistory(dataArray);
        } catch (parseError) {
          console.error('Failed to parse history JSON:', text);
          setHistory([]);
        }
      } else {
        console.error('Fetch history failed with status:', response.status);
        setHistory([]);
      }
    } catch (error) {
      console.error('Fetch history error:', error);
      setHistory([]);
    } finally {
      setIsFetchingHistory(false);
    }
  };

  const handleAuthSubmit = async (userData: User, mode?: 'investigate' | 'manage') => {
    setAuthError(null);
    
    const sessionStartTime = Date.now();
    const sessionId = generateGUID();
    const enrichedUser: User = { ...userData, sessionId, sessionStartTime };
    setUser(enrichedUser);
    
    if (userData.role === 'admin') {
      if (mode === 'manage') {
        setPhase(ScoutingPhase.MANAGEMENT);
      } else {
        setPhase(ScoutingPhase.ADMIN);
        fetchHistory();
      }
    } else {
      setPhase(ScoutingPhase.AUTONOMOUS);
      syncScoutData('SESSION_START', null, null, enrichedUser);
    }
  };

  const handlePhaseChange = (newPhase: ScoutingPhase) => {
    if (newPhase === ScoutingPhase.ADMIN) {
      fetchHistory();
    }
    setPhase(newPhase);
  };

  const handleInitSheet = async () => {
    setIsInitializing(true);
    setInitStatus('loading');
    try {
      const timestamp = dayjs().format('DDMMYYYYHHmm');
      const newSheetName = `${SHEET_NAME} ${timestamp}`;
      
      const response = await fetch('/api/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetSheetId: SPREADSHEET_ID,
          oldSheetName: SHEET_NAME,
          newSheetName: newSheetName,
          headers: ALL_HEADERS
        })
      });

      if (response.ok) {
        // Proactively ensure headers are in the new sheet by sending a dummy sync
        // This helps if the script's 'init' action doesn't handle headers correctly
        try {
          await fetch('/api/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              targetSheetId: SPREADSHEET_ID,
              sheetName: SHEET_NAME,
              headers: ALL_HEADERS,
              recordType: 'INIT_MARKER',
              timestamp: dayjs().toISOString(),
              name: 'SYSTEM',
              role: 'admin'
            })
          });
        } catch (syncError) {
          console.warn('Proactive header sync failed, but init succeeded:', syncError);
        }

        setInitStatus('success');
        setTimeout(() => setInitStatus('idle'), 3000);
        fetchHistory(); // Refresh history
      } else {
        setInitStatus('error');
      }
    } catch (error) {
      console.error('Init sheet error:', error);
      setInitStatus('error');
    } finally {
      setIsInitializing(false);
    }
  };

  const renderPhase = () => {
    switch (phase) {
      case ScoutingPhase.AUTH: 
        return <AuthBinding 
          onSubmit={handleAuthSubmit} 
          language={language} 
          initialName={lastName}
          initialMatchNumber={lastMatchNumber}
          history={history}
          externalError={authError}
        />;
      case ScoutingPhase.AUTONOMOUS: 
        return <AutoBinding 
          language={language}
          onNext={(d) => { 
            setAutoData(d); 
            setPhase(ScoutingPhase.TELEOP); 
            syncScoutData('AUTO_COMPLETE', d, null, user);
          }} 
          onBack={() => setPhase(ScoutingPhase.AUTH)}
          onLogout={handleLogout}
          initialData={autoData || {
            matchNumber: user?.gameNumber || '1',
            teamScouted: user?.teamScouted || '',
            zoneType: '', leave: false,
            cycles: [
              { id: 'Preload', collected: true, count: 0, missCount: 0 },
              { id: '1', collected: false, count: 0, missCount: 0 },
              { id: '2', collected: false, count: 0, missCount: 0 },
              { id: '3', collected: false, count: 0, missCount: 0 },
            ],
            openGate: false, intake: false, ballsSide: 0, ballsMissed: 0, freeText: '', totalScore: 0
          }} 
        />;
      case ScoutingPhase.TELEOP: 
        return <TeleOpBinding 
          language={language}
          onNext={(d) => { 
            setTeleopData(d); 
            setPhase(ScoutingPhase.SUMMARY); 
            syncScoutData('TELEOP_COMPLETE', autoData, d, user);
          }} 
          onBack={() => setPhase(ScoutingPhase.AUTONOMOUS)} 
          onLogout={handleLogout}
          initialData={teleopData || undefined} 
        />;
      case ScoutingPhase.SUMMARY: 
        return <SummaryBinding 
          language={language}
          auto={autoData!} 
          teleop={teleopData!} 
          user={user!}
          targetSheetId={SPREADSHEET_ID}
          error={summaryError}
          onFinish={async (data) => {
            setSummaryError(null);
            // Final duplicate check before sync
            setIsFetchingHistory(true);
            try {
              const response = await fetch(`/api/history?targetSheetId=${SPREADSHEET_ID}&sheetName=${SHEET_NAME}`);
              if (response.ok) {
                const text = await response.text();
                const result = JSON.parse(text);
                const latestHistory = Array.isArray(result) ? result : (result.data && Array.isArray(result.data) ? result.data : []);
                setHistory(latestHistory);

                const team = autoData?.teamScouted || user?.teamScouted || '';
                const match = autoData?.matchNumber || user?.gameNumber || '';
                const name = user?.name || '';

                if (checkDuplicate(latestHistory, team, match, name)) {
                  const authT: any = language === Language.HE ? AuthTranslation_HE : AuthTranslation_EN;
                  const errorMsg = authT.duplicateError
                    .replace('{team}', team)
                    .replace('{match}', match)
                    .replace('{name}', name);
                  setSummaryError(errorMsg);
                  return;
                }
              }
            } catch (e) {
              console.error('Final duplicate check failed:', e);
            } finally {
              setIsFetchingHistory(false);
            }

            await syncScoutData('MATCH_COMPLETE', autoData, teleopData, user, data.aiAnalysis);
            if (user) {
              setLastName(user.name);
              const currentMatch = parseInt(user.gameNumber);
              setLastMatchNumber(isNaN(currentMatch) ? user.gameNumber : (currentMatch + 1).toString());
            }
            setUser(null); setAutoData(null); setTeleopData(null); setPhase(ScoutingPhase.AUTH);
            setSummaryError(null);
          }} 
          onBack={() => setPhase(ScoutingPhase.TELEOP)} 
          onLogout={handleLogout}
        />;
      case ScoutingPhase.ADMIN:
        return <AdminBinding 
          language={language}
          history={history}
          isLoading={isFetchingHistory}
          sheetName={SHEET_NAME}
          onBack={() => setPhase(ScoutingPhase.AUTH)}
          onLogout={handleLogout}
        />;
      case ScoutingPhase.MANAGEMENT:
        return (
          <div className="max-w-4xl mx-auto p-6 bg-white rounded-[2rem] shadow-2xl border border-slate-200 min-h-[400px] flex flex-col items-center justify-center relative overflow-hidden">
            <button 
              onClick={() => setPhase(ScoutingPhase.AUTH)}
              className="absolute top-4 left-4 p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400"
            >
              <ArrowLeft size={24} />
            </button>
            <button 
              onClick={handleLogout}
              className="absolute top-4 right-4 p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400"
            >
              <X size={24} />
            </button>
            
            <div className="text-center mb-12">
              <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter mb-2">Management Panel</h2>
              <p className="text-slate-500 font-medium">System initialization and data management</p>
            </div>

            <div className="grid grid-cols-1 gap-6 w-full max-w-sm">
              <div className="bg-slate-50 p-8 rounded-3xl border border-slate-200 text-center">
                <h3 className="text-lg font-bold text-slate-800 mb-4">Initialize Data Sheet</h3>
                <p className="text-sm text-slate-500 mb-8 leading-relaxed">
                  This will archive the current <b>{SHEET_NAME}</b> sheet by renaming it with a timestamp and create a fresh one for new data.
                </p>
                
                <button 
                  onClick={handleInitSheet}
                  disabled={isInitializing}
                  className={`w-full py-4 rounded-2xl font-black uppercase tracking-widest transition-all transform active:scale-[0.98] flex items-center justify-center gap-3 ${
                    initStatus === 'success' 
                    ? 'bg-emerald-500 text-white' 
                    : initStatus === 'error'
                    ? 'bg-red-500 text-white'
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xl shadow-indigo-600/20'
                  } ${isInitializing ? 'opacity-70 cursor-not-allowed' : ''}`}
                >
                  {isInitializing ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Initializing...
                    </>
                  ) : initStatus === 'success' ? (
                    'Success!'
                  ) : initStatus === 'error' ? (
                    'Error Occurred'
                  ) : (
                    'Clean Database'
                  )}
                </button>
                
                {initStatus === 'success' && (
                  <p className="mt-4 text-xs font-bold text-emerald-600 animate-in fade-in slide-in-from-top-2">
                    Sheet archived successfully.
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      default: 
        return <AuthBinding 
          onSubmit={handleAuthSubmit} 
          language={language} 
          initialName={lastName}
          initialMatchNumber={lastMatchNumber}
          history={history}
        />;
    }
  };

  return (
    <Layout 
      user={user} 
      onLogout={handleLogout}
      language={language}
      onLanguageToggle={() => setLanguage(l => l === Language.HE ? Language.EN : Language.HE)}
      isNavExpanded={isNavExpanded}
      onToggleNav={() => setIsNavExpanded(!isNavExpanded)}
    >
      <div className="max-w-4xl mx-auto px-2 py-4 sm:px-4 sm:py-6" dir={language === Language.HE ? 'rtl' : 'ltr'}>
        {/* Collapsible Progress Area */}
        <div className={`transition-all duration-500 overflow-hidden ${isNavExpanded ? 'max-h-[300px] opacity-100 mb-6' : 'max-h-0 opacity-0 mb-0 pointer-events-none'}`}>
          <div className="flex justify-between items-center mb-4 px-4">
            <div className="flex items-center gap-3">
               <div className={`w-2.5 h-2.5 rounded-full ${syncStatus === 'success' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : syncStatus === 'syncing' ? 'bg-blue-500 animate-pulse' : syncStatus === 'error' ? 'bg-red-500' : 'bg-slate-700'}`} />
               <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                 {syncStatus === 'syncing' ? t.syncing : syncStatus === 'success' ? t.cloud : t.ready}
               </span>
            </div>
          </div>

          {user && (
            <div className="flex items-center justify-between relative px-6 py-4">
              <div className="absolute top-1/2 left-0 w-full h-0.5 bg-slate-800 -translate-y-1/2 z-0" />
              {[
                { p: ScoutingPhase.AUTH, i: Radio, l: t.auth, show: true },
                { p: ScoutingPhase.AUTONOMOUS, i: Cpu, l: t.auto, show: true },
                { p: ScoutingPhase.TELEOP, i: ClipboardList, l: t.tele, show: true },
                { p: ScoutingPhase.SUMMARY, i: BarChart3, l: t.done, show: true },
                { p: ScoutingPhase.ADMIN, i: BarChart3, l: t.admin, show: user.role === 'admin' }
              ].filter(s => s.show).map((step) => (
                <button 
                  key={step.l} 
                  onClick={() => handlePhaseChange(step.p)}
                  className="flex flex-col items-center relative z-10 group outline-none"
                >
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-500 transform ${phase === step.p ? 'bg-indigo-600 text-white shadow-2xl shadow-indigo-500/30 scale-110' : 'bg-slate-800 text-slate-500 border border-slate-700 hover:bg-slate-700 group-hover:scale-105'}`}>
                    <step.i size={20} />
                  </div>
                  <span className={`text-[10px] mt-2 font-black uppercase tracking-widest transition-colors ${phase === step.p ? 'text-indigo-400' : 'text-slate-600 group-hover:text-slate-400'}`}>{step.l}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Dynamic Form Area */}
        <div className="bg-slate-900/40 backdrop-blur-2xl border border-slate-800 rounded-[2.5rem] shadow-3xl p-1.5 sm:p-6 lg:p-10 transition-all duration-500">
          {renderPhase()}
        </div>
      </div>
    </Layout>
  );
};

export default App;