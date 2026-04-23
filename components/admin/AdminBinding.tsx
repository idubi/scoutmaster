import React from 'react';
import { Language, SpreadsheetRow } from "../../types";
import AdminView from "./AdminView";


interface AdminBindingProps {
  language: Language;
  history: SpreadsheetRow[];
  isLoading: boolean;
  sheetName: string;
  spreadsheetId: string;
  onBack: () => void;
  onLogout: () => void;
}

const AdminBinding: React.FC<AdminBindingProps> = ({ 
  language, 
  history, 
  isLoading, 
  sheetName, 
  spreadsheetId,
  onBack, 
  onLogout 
}) => {
  const [isSeeding, setIsSeeding] = React.useState(false);
  const [teamsGrades, setTeamsGrades] = React.useState<any[]>([]);
  const [isLoadingGrades, setIsLoadingGrades] = React.useState(false);
  const [lastConsolidationTime, setLastConsolidationTime] = React.useState<string | null>(null);
  
  // System Settings State
  const [settings, setSettings] = React.useState({
    isAutoCalcActive: false,
    calcIntervalSeconds: 80
  });

  const fetchSettings = React.useCallback(async () => {
    try {
      const response = await fetch('/api/settings');
      if (response.ok) {
        const data = await response.json();
        setSettings({
          isAutoCalcActive: data.isAutoCalcActive,
          calcIntervalSeconds: data.calcIntervalSeconds
        });
        if (data.lastConsolidationTime) {
          setLastConsolidationTime(new Date(data.lastConsolidationTime).toLocaleString());
        }
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
  }, []);

  const handleUpdateSettings = async (newSettings: { isAutoCalcActive?: boolean, calcIntervalSeconds?: number }) => {
    // Optimistic update
    const updated = { ...settings, ...newSettings };
    setSettings(updated);

    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...updated,
          targetSheetId: spreadsheetId
        })
      });
    } catch (error) {
      console.error('Error updating settings:', error);
      // Revert if failed
      fetchSettings();
    }
  };

  const fetchTeamsGrades = React.useCallback(async () => {
    setIsLoadingGrades(true);
    try {
      const response = await fetch(`/api/history?targetSheetId=${spreadsheetId}&sheetName=TEAMS_GRADES`);
      if (response.ok) {
        const data = await response.json();
        setTeamsGrades(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error('Error fetching TEAMS_GRADES:', error);
    } finally {
      setIsLoadingGrades(false);
    }
  }, [spreadsheetId]);

  React.useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSeedData = async () => {
    if (!window.confirm('This will generate 18 test records (6 for each team: 15811, 15928, 25041) and sync them to Google Sheets. Continue?')) return;
    
    setIsSeeding(true);
    const teams = ['15811', '15928', '25041'];
    const scouterNames = ['TestScouter1', 'TestScouter2', 'TestScouter3'];
    const ALL_HEADERS = [
      'sessionId', 'timestamp', 'sessionStartTime', 'sessionEndTime', 'name', 
      'matchNumber', 'teamScouted', 'role',  
      'isAutoLeave', 
      'autoOpenGate', 'autoIntakeUsed', 'autoBallHit', 'autoBallMiss', 'autoNotes',
      'teleBallHit', 'teleBallMiss',
      'isTeleopZoneSmall', 'isTeleopZoneBig',
      'isAutoZoneSmall', 'isAutoZoneBig',
      'teleFieldAwareness',
      'teleLateTranslation', 'teleOverallSuccess', 'teleFastRebound', 'teleIsFrozen', 'teleConfused', 'teleStoppedScoring',
      'teleGateFoul', 'teleParkingFoul', 'teleIntakeFoul', 'teleFoulCount',
      'teleFullParking',
      'teleHumanPlayer', 'teleFloor', 'teleComments', 'aiAnalysis', 'recordType'
    ];

    try {
      for (const team of teams) {
        for (let i = 1; i <= 6; i++) {
          const autoBallHit = Math.floor(Math.random() * 5);
          const autoMobility = Math.random() > 0.3;
          
          const teleBallHit = Math.floor(Math.random() * 15);

          const row = {
            sessionId: `seed-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date().toLocaleString(),
            sessionStartTime: new Date().toISOString(),
            sessionEndTime: new Date().toISOString(),
            name: scouterNames[Math.floor(Math.random() * scouterNames.length)],
            matchNumber: i.toString(),
            teamScouted: team,
            role: 'scouter',
            isAutoLeave: autoMobility,
            isAutoZoneSmall: Math.random() > 0.5,
            isAutoZoneBig: Math.random() > 0.5,
            autoOpenGate: Math.random() > 0.8,
            autoIntakeUsed: Math.random() > 0.5,
            autoBallHit: autoBallHit,
            autoBallMiss: Math.floor(Math.random() * 3),
            autoNotes: 'Automated test data',
            teleBallHit: teleBallHit,
            isTeleopZoneSmall: Math.random() > 0.5,
            isTeleopZoneBig: Math.random() > 0.5,
            teleBallMiss: Math.floor(Math.random() * 5),
            teleFieldAwareness: Math.random() > 0.2,
            teleLateTranslation: Math.random() > 0.8,
            teleOverallSuccess: true,
            teleFastRebound: Math.random() > 0.5,
            teleIsFrozen: Math.random() > 0.9,
            teleConfused: Math.random() > 0.9,
            teleStoppedScoring: Math.random() > 0.9,
            teleGateFoul: Math.random() > 0.9,
            teleParkingFoul: Math.random() > 0.9,
            teleIntakeFoul: Math.random() > 0.9,
            teleFoulCount: 0,
            teleFullParking: Math.random() > 0.5,
            teleHumanPlayer: Math.random() > 0.5,
            teleFloor: Math.random() > 0.5,
            teleComments: 'Test comments',
            aiAnalysis: 'Test analysis',
            recordType: 'MATCH_COMPLETE',
            targetSheetId: spreadsheetId,
            sheetName: 'scoutsmaster_ongoing',
            headers: ALL_HEADERS
          };

          await fetch('/api/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(row)
          });
          
          await new Promise(r => setTimeout(r, 300));
        }
      }
      alert('Seeding complete! Please refresh the admin view to see the new data.');
      fetchTeamsGrades();
    } catch (error) {
      console.error('Seeding failed:', error);
      alert('Seeding failed. Check console for details.');
    } finally {
      setIsSeeding(false);
    }
  };

  const [isRecalculating, setIsRecalculating] = React.useState(false);
  const handleRecalculate = async () => {
    setIsRecalculating(true);
    try {
      const response = await fetch('/api/recalculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetSheetId: spreadsheetId })
      });
      if (response.ok) {
        setLastConsolidationTime(new Date().toLocaleString());
        alert('Recalculation complete! The TEAMS_GRADES sheet has been consolidated.');
        fetchTeamsGrades();
      } else {
        const errData = await response.json().catch(() => ({ error: 'Unknown error' }));
        alert(`Recalculation failed:\n\n${errData.error}`);
      }
    } catch (error) {
      console.error('Recalculation error:', error);
      alert('Error during recalculation.');
    } finally {
      setIsRecalculating(false);
    }
  };

  return (
    <AdminView 
      language={language} 
      history={history} 
      isLoading={isLoading || isLoadingGrades}
      teamsGrades={teamsGrades}
      sheetName={sheetName}
      onBack={onBack} 
      onLogout={onLogout}
      onSeed={handleSeedData}
      onRecalculate={handleRecalculate}
      isSeeding={isSeeding}
      isRecalculating={isRecalculating}
      lastConsolidationTime={lastConsolidationTime}
      autoCalcActive={settings.isAutoCalcActive}
      autoCalcSeconds={settings.calcIntervalSeconds}
      onUpdateSettings={handleUpdateSettings}
      onFetchGrades={fetchTeamsGrades}
    />
  );
};

export default AdminBinding;
