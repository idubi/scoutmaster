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
import {ENV}  from "./constants";


const GOOGLE_SHEET_URL = ENV.GOOGLE_SHEET_URL;

const SPREADSHEET_ID = '1AF7CpExwwMI2xDWMYxVkLq0UNls_VPEtwXUQkOMl9i8';


const SHEET_NAME = 'scoutsmaster_ongoing'; // Set your sheet name here

const ALL_HEADERS = [
  // Hebrew Headers (Matching demo-table order)
  'isAutoZoneSmall', 'isAutoZoneBig', 
  'isAutoLeave', 'isTeleopZoneSmall', 'isTeleopZoneBig', 'teleFullParking', 
  // Internal App Headers
  'sessionId', 'timestamp', 'sessionStartTime', 'sessionEndTime', 'name', 
  'allianceColor', 'matchNumber', 'teamScouted', 'role', 
  'autoOpenGate', 'autoIntakeUsed', 'autoBallHit', 'autoBallMiss', 'autoNotes',
  'teleBallHit', 
  'teleBallMiss',
  'teleFieldAwareness',
  'teleLateTranslation', 'teleOverallSuccess', 'teleFastRebound', 'teleIsFrozen', 'teleConfused', 'teleStoppedScoring',
  'teleGateFoul', 'teleParkingFoul', 'teleIntakeFoul', 'teleFoulCount',
  'teleFullParking',
  'teleHumanPlayer', 'teleFloor', 'teleComments', 'aiAnalysis', 'recordType'
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
  console.log("App: Rendering phase", phase);
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
  const [resetKey, setResetKey] = useState(0);
  const [isUpdateMode, setIsUpdateMode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const t = language === Language.HE ? AppTranslation_HE : AppTranslation_EN;

  const handleDeleteGame = () => {
    setUser(null);
    setAutoData(null);
    setTeleopData(null);
    setSummaryError(null);
    setAuthError(null);
    setLastName('');
    setLastMatchNumber('1');
    setResetKey(prev => prev + 1);
    setIsUpdateMode(false);
    setIsSubmitting(false);
    setPhase(ScoutingPhase.AUTH);
  };

  const handleUpdateMetadata = () => {
    setSummaryError(null);
    setIsUpdateMode(true);
    setIsSubmitting(false);
    setPhase(ScoutingPhase.AUTH);
  };

  const checkDuplicate = (historyData: SpreadsheetRow[], team: string, match: string, name: string) => {
    const cleanTeam = String(team || '').trim();
    const cleanMatch = String(match || '').trim();
    const cleanName = String(name || '').trim().toLowerCase();

    return historyData.some(row => {
      const rowTeam = String(row.teamScouted || '').trim();
      const rowMatch = String(row.matchNumber || '').trim();
      const rowName = String(row.name || '').trim().toLowerCase();
      const rowRecordType = row['recordType'];
      
      // Only consider it a duplicate if it's a MATCH_COMPLETE record
      if (rowRecordType !== 'MATCH_COMPLETE') return false;

      return rowTeam === cleanTeam && 
             rowMatch === cleanMatch && 
             rowName === cleanName;
    });
  };

  React.useEffect(() => {
    fetchHistory();
  }, []);

  const handleLogout = () => {
    handleDeleteGame();
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

  const initializeSheet = async () => {
    console.log('Initializing/Recreating sheet:', SHEET_NAME);
    try {
      const resp = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'recreate',
          targetSheetId: SPREADSHEET_ID,
          sheetName: SHEET_NAME,
          headers: ALL_HEADERS
        })
      });
      if (resp.ok) {
        console.log('Sheet initialized successfully');
        // Now that it exists, fetch history again (will likely be empty but headers will exist)
        const historyResp = await fetch(`/api/history?targetSheetId=${SPREADSHEET_ID}&sheetName=${SHEET_NAME}`);
        if (historyResp.ok) {
          const result = await historyResp.json().catch(() => []);
          const dataArray = Array.isArray(result) ? result : (result.data && Array.isArray(result.data) ? result.data : []);
          setHistory(dataArray);
        }
      } else {
        console.error('Failed to initialize sheet:', await resp.text());
      }
    } catch (error) {
      console.error('Error during sheet initialization:', error);
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
      matchNumber: currentAuto?.matchNumber || activeUser.matchNumber,
      allianceColor: activeUser.allianceColor || '',
      teamScouted: currentAuto?.teamScouted || activeUser.teamScouted,
      role: activeUser.role,
      recordType
    };

    if (currentAuto) {
      Object.assign(row, {
        isAutoZoneSmall: currentAuto.isZoneSmall,
        isAutoZoneBig: currentAuto.isZoneBig,
        isAutoLeave: currentAuto.leave,
        autoOpenGate: currentAuto.openGate,
        autoIntakeUsed: currentAuto.intake,
        autoBallHit: currentAuto.ballsSide,
        autoBallMiss: currentAuto.ballsMissed,
        autoNotes: currentAuto.freeText,
      });
    }

    if (currentTeleop) {
      Object.assign(row, {
        teleBallHit: currentTeleop.intake,
        isTeleopZoneSmall: currentTeleop.isSmallTriangle,
        isTeleopZoneBig: currentTeleop.isBigTriangle,
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
        teleFullParking: currentTeleop.fullParkingType,
        teleFoulCount: (currentTeleop.gateFoul ? 1 : 0) + (currentTeleop.parkingFoul ? 1 : 0) + (currentTeleop.intakeFoul ? 1 : 0),
        teleHumanPlayer: currentTeleop.humanPlayer,
        teleFloor: currentTeleop.floor,
        teleComments: currentTeleop.comments,
        aiAnalysis: aiAnalysisText || '',
      });
    }

    // Only sync to spreadsheet for the final record to avoid multiple rows per session
    if (recordType === 'MATCH_COMPLETE') {
      await syncToSpreadsheet(row);
    } else {
      console.log(`Local sync: ${recordType} - Data updated locally, will sync to cloud on finish.`);
    }
  };

  const fetchHistory = async () => {
    setIsFetchingHistory(true);
    console.log('fetchHistory: Requesting data for Spreadsheet:', SPREADSHEET_ID, 'Sheet:', SHEET_NAME);
    try {
      console.log('Fetching history from proxy for sheet:', SHEET_NAME);
      const response = await fetch(`/api/history?targetSheetId=${SPREADSHEET_ID}&sheetName=${SHEET_NAME}`);
      
      if (response.status === 404) {
        console.warn('Sheet not found. Attempting to initialize...');
        await initializeSheet();
        return;
      }

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
    setSummaryError(null);
    
    if (userData.role === 'admin') {
      const sessionStartTime = Date.now();
      const sessionId = generateGUID();
      const enrichedUser: User = { ...userData, sessionId, sessionStartTime };
      setUser(enrichedUser);
      if (mode === 'manage') {
        setPhase(ScoutingPhase.MANAGEMENT);
      } else {
        setPhase(ScoutingPhase.ADMIN);
        fetchHistory();
      }
    } else {
      if (isUpdateMode) {
        const updatedUser = {
          ...userData,
          sessionId: user?.sessionId || generateGUID(),
          sessionStartTime: user?.sessionStartTime || Date.now()
        };
        setUser(updatedUser);
        
        // Update autoData and teleopData to match new metadata
        if (autoData) {
          setAutoData({
            ...autoData,
            matchNumber: updatedUser.matchNumber,
            teamScouted: updatedUser.teamScouted
          });
        }
        
        setIsUpdateMode(false);
        setPhase(ScoutingPhase.SUMMARY);
      } else {
        const sessionStartTime = Date.now();
        const sessionId = generateGUID();
        const enrichedUser: User = { ...userData, sessionId, sessionStartTime };
        setUser(enrichedUser);
        setPhase(ScoutingPhase.AUTONOMOUS);
        syncScoutData('SESSION_START', null, null, enrichedUser);
      }
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
          key={resetKey}
          onSubmit={handleAuthSubmit} 
          language={language} 
          initialName={isUpdateMode ? user?.name : lastName}
          initialMatchNumber={isUpdateMode ? user?.matchNumber : lastMatchNumber}
          initialTeamNumber={isUpdateMode ? user?.teamScouted : ''}
          initialRole={isUpdateMode ? user?.role : 'scouter'}
          initialAllianceColor={isUpdateMode ? user?.allianceColor : 'Red'}
          history={history}
          externalError={authError}
          onDeleteGame={handleDeleteGame}
          onUpdateMetadata={handleUpdateMetadata}
          isUpdateMode={isUpdateMode}
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
            matchNumber: user?.matchNumber || '1',
            teamScouted: user?.teamScouted || '',
            isZoneSmall: false, isZoneBig: false, leave: false,
            cycles: [
              { id: 'Preload', collected: true, count: 0, missCount: 0 },
              { id: '1', collected: false, count: 0, missCount: 0 },
              { id: '2', collected: false, count: 0, missCount: 0 },
              { id: '3', collected: false, count: 0, missCount: 0 },
            ],
            openGate: false, intake: false, ballsSide: 0, ballsMissed: 0, freeText: ''
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
          isSyncing={syncStatus === 'syncing'}
          onDeleteGame={handleDeleteGame}
          onUpdateMetadata={handleUpdateMetadata}
          onLogout={handleLogout}
          onBack={() => setPhase(ScoutingPhase.TELEOP)}
          isSubmitting={isSubmitting}
          onFinish={async (data) => {
            if (isSubmitting) return;
            setIsSubmitting(true);
            setSummaryError(null);
            // Final duplicate check before sync
            setIsFetchingHistory(true);
            try {
              const cacheBuster = Date.now();
              const response = await fetch(`/api/history?targetSheetId=${SPREADSHEET_ID}&sheetName=${SHEET_NAME}&_=${cacheBuster}`);
              if (response.ok) {
                const text = await response.text();
                const result = JSON.parse(text);
                const latestHistory = Array.isArray(result) ? result : (result.data && Array.isArray(result.data) ? result.data : []);
                setHistory(latestHistory);

                const team = autoData?.teamScouted || user?.teamScouted || '';
                const match = autoData?.matchNumber || user?.matchNumber || '';
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
              const currentMatch = parseInt(user.matchNumber);
              setLastMatchNumber(isNaN(currentMatch) ? user.matchNumber : (currentMatch + 1).toString());
            }
            setUser(null); setAutoData(null); setTeleopData(null); setPhase(ScoutingPhase.AUTH);
            setSummaryError(null);
            setIsSubmitting(false);
          }} 
        />;
      case ScoutingPhase.ADMIN:
        return <AdminBinding 
          language={language}
          history={history}
          isLoading={isFetchingHistory}
          sheetName={SHEET_NAME}
          spreadsheetId={SPREADSHEET_ID}
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
        <div className="bg-white rounded-3xl shadow-2xl p-6">
          {renderPhase()}
        </div>
      </div>
    </Layout>
  );
};

export default App;