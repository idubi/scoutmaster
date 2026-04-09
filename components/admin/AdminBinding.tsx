import React from 'react';
import { Language, SpreadsheetRow } from '../../types';
import AdminView from './AdminView';

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
    fetchTeamsGrades();
  }, [fetchTeamsGrades]);

  const handleSeedData = async () => {
    if (!window.confirm('This will generate 18 test records (6 for each team: 15811, 15928, 25041) and sync them to Google Sheets. Continue?')) return;
    
    setIsSeeding(true);
    const teams = ['15811', '15928', '25041'];
    const scouterNames = ['TestScouter1', 'TestScouter2', 'TestScouter3'];
    const ALL_HEADERS = [
      'sessionId', 'timestamp', 'sessionStartTime', 'sessionEndTime', 'name', 
      'gameNumber', 'matchNumber', 'teamScouted', 'role', 'autoZoneType', 
      'autoMobility_Leave', 
      'autoOpenGate', 'autoIntakeUsed', 'autoBallHit', 'autoBallMiss', 'autoNotes', 'autoTotalScore',
      'teleBallHit', 'teleSmallTriangle_Long', 'teleBigTriangle_Short',
      'teleBallMiss',
      'teleFieldAwareness',
      'teleLateTranslation', 'teleOverallSuccess', 'teleFastRebound', 'teleIsFrozen', 'teleConfused', 'teleStoppedScoring',
      'teleGateFoul', 'teleParkingFoul', 'teleIntakeFoul', 'teleFoulCount',
      'teleHumanPlayer', 'teleFloor', 'teleComments', 'teleTotalScore', 'aiAnalysis', 'recordType', 'targetSheetId'
    ];

    try {
      for (const team of teams) {
        for (let i = 1; i <= 6; i++) {
          const autoBallHit = Math.floor(Math.random() * 5);
          const autoMobility = Math.random() > 0.3;
          const autoTotalScore = autoBallHit + (autoMobility ? 2 : 0);
          
          const teleBallHit = Math.floor(Math.random() * 15);
          const teleSmall = Math.random() > 0.5 ? 1 : 0;
          const teleBig = Math.random() > 0.5 ? 1 : 0;
          const teleGate = Math.random() > 0.7 ? 1 : 0;
          const teleTotalScore = teleBallHit + (teleSmall * 3) + (teleBig * 2) + (teleGate * 1);

          const row = {
            sessionId: `seed-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date().toLocaleString(),
            sessionStartTime: new Date().toISOString(),
            sessionEndTime: new Date().toISOString(),
            name: scouterNames[Math.floor(Math.random() * scouterNames.length)],
            gameNumber: i.toString(),
            matchNumber: i.toString(),
            teamScouted: team,
            role: 'scouter',
            autoZoneType: Math.random() > 0.5 ? 'SMALL' : 'BIG',
            autoMobility_Leave: autoMobility,
            autoOpenGate: Math.random() > 0.8,
            autoIntakeUsed: Math.random() > 0.5,
            autoBallHit: autoBallHit,
            autoBallMiss: Math.floor(Math.random() * 3),
            autoNotes: 'Automated test data',
            autoTotalScore: autoTotalScore,
            teleBallHit: teleBallHit,
            teleSmallTriangle_Long: teleSmall,
            teleBigTriangle_Short: teleBig,
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
            teleHumanPlayer: Math.random() > 0.5,
            teleFloor: Math.random() > 0.5,
            teleComments: 'Test comments',
            teleTotalScore: teleTotalScore,
            aiAnalysis: 'Test analysis',
            recordType: 'MATCH_COMPLETE',
            targetSheetId: '1pA-8L0iNw4WJqKXqVHcXLoAUxZDVrJHl_8bYR7pg64Y',
            sheetName: 'idotest1',
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
    } catch (error) {
      console.error('Seeding failed:', error);
      alert('Seeding failed. Check console for details.');
    } finally {
      setIsSeeding(false);
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
      isSeeding={isSeeding}
    />
  );
};

export default AdminBinding;
