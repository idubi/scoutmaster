
import fetch from 'node-fetch';

const GOOGLE_SHEET_URL = 'https://script.google.com/macros/s/AKfycbyIwBD5iPSNDoLt0fwdQ0wGJTsqGWV2pS8rS65mzHg96lSb-n4Ul2OAtR-t2DsHbD7G/exec';
const SPREADSHEET_ID = '1pA-8L0iNw4WJqKXqVHcXLoAUxZDVrJHl_8bYR7pg64Y';
const SHEET_NAME = 'liortestmapping';

const TEAMS = ['15811', '15928', '25041', '6798'];
const MATCHES = [1, 2, 3, 4, 5, 6];
const POSITIONS = ['Red 1', 'Red 2', 'Blue 1', 'Blue 2'];

const ALL_HEADERS = [
  'Timestamp', 'שם הסקאוטר', 'מספר קבוצה', 'מספר מקצה', '.', 'אוטונומי - מיקום', 
  'אוטונומי - נסע מהמקום', 'אוטונומי - כדור מנוקד', 'אוטונומי - כדורים שהוחטאו', 
  'הרובוט עשה leave?', 'טלאופ - כדור מנוקד', 'טלאופ - חניה', 'טווח ירי', 'איסוף ', 
  'הערות (אסטרטגיית הגנה, עשה הרבה פאולים, וכו)',
  'sessionId', 'timestamp', 'sessionStartTime', 'sessionEndTime', 'scouterName', 
  'gameNumber', 'scouterRole', 'matchNumber', 'teamScouted', 'autoZoneType', 
  'autoMobility_Leave', 
  'autoOpenGate', 'autoIntakeUsed', 'autoBallHit', 'autoBallMiss', 'autoNotes', 'autoTotalScore',
  'teleBallHit', 'teleSmallTriangle_Long', 'teleBigTriangle_Short',
  'teleBallMiss',
  'teleFieldAwareness',
  'teleLateTranslation', 'teleOverallSuccess', 'teleFastRebound', 'teleIsFrozen', 'teleConfused', 'teleStoppedScoring',
  'teleGateFoul', 'teleParkingFoul', 'teleIntakeFoul', 'teleFoulCount',
  'teleHumanPlayer', 'teleFloor', 'teleComments', 'teleTotalScore', 'aiAnalysis', 'recordType', 'targetSheetId'
];

async function syncToSpreadsheet(data: any) {
  const payload = { ...data, targetSheetId: SPREADSHEET_ID, sheetName: SHEET_NAME, headers: ALL_HEADERS };
  try {
    const response = await fetch('http://localhost:3000/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const text = await response.text();
    console.log(`Synced Match ${data.matchNumber} for Team ${data.teamScouted} (${data.scouterRole}): ${text}`);
  } catch (error) {
    console.error('Sync error:', error);
  }
}

function generateData(team: string, match: number, position: string) {
  const scouterName = "AI Synthetic Bot";
  const zoneType = Math.random() > 0.5 ? 'big' : 'small';
  const leave = Math.random() > 0.3;
  const autoBallHit = Math.floor(Math.random() * 8);
  const autoBallMiss = Math.floor(Math.random() * 4);
  
  const teleBallHit = Math.floor(Math.random() * 30) + 5;
  const long = Math.floor(Math.random() * 15);
  const short = Math.floor(Math.random() * 15);
  const lift = Math.random() > 0.7;
  const full = !lift && Math.random() > 0.5;
  const floor = Math.random() > 0.4;
  const human = Math.random() > 0.4;

  const row: any = {
    sessionId: 'synthetic-' + Math.random().toString(36).substr(2, 9),
    timestamp: new Date().toLocaleString(),
    sessionStartTime: new Date().toISOString(),
    sessionEndTime: new Date().toISOString(),
    scouterName: scouterName,
    gameNumber: match.toString(),
    scouterRole: position,
    matchNumber: match.toString(),
    teamScouted: team,
    autoZoneType: zoneType,
    autoMobility_Leave: leave,
    autoOpenGate: Math.random() > 0.5,
    autoIntakeUsed: Math.random() > 0.5,
    autoBallHit: autoBallHit,
    autoBallMiss: autoBallMiss,
    autoNotes: 'Synthetic data generation',
    autoTotalScore: autoBallHit * 5 + (leave ? 2 : 0),
    teleBallHit: teleBallHit,
    teleSmallTriangle_Long: long,
    teleBigTriangle_Short: short,
    teleBallMiss: Math.floor(Math.random() * 5),
    teleFieldAwareness: true,
    teleLateTranslation: false,
    teleOverallSuccess: true,
    teleFastRebound: Math.random() > 0.5,
    teleIsFrozen: false,
    teleConfused: false,
    teleStoppedScoring: false,
    teleGateFoul: false,
    teleParkingFoul: false,
    teleIntakeFoul: false,
    teleFoulCount: 0,
    teleHumanPlayer: human,
    teleFloor: floor,
    teleComments: 'Good performance in match ' + match,
    teleTotalScore: teleBallHit * 2 + (lift ? 10 : (full ? 6 : 0)),
    aiAnalysis: 'Synthetic analysis',
    recordType: 'MATCH_COMPLETE',
    targetSheetId: SPREADSHEET_ID,

    // Hebrew Mapping
    'Timestamp': new Date().toISOString(),
    'שם הסקאוטר': scouterName,
    'מספר קבוצה': team,
    'מספר מקצה': match.toString(),
    '.': '',
    'אוטונומי - מיקום': zoneType === 'big' ? 'משולש גדול' : 'משולש קטן',
    'אוטונומי - נסע מהמקום': leave ? 'כן' : 'לא',
    'אוטונומי - כדור מנוקד': autoBallHit,
    'אוטונומי - כדורים שהוחטאו': autoBallMiss,
    'הרובוט עשה leave?': leave ? 'leave' : 'לא',
    'טלאופ - כדור מנוקד': teleBallHit,
    'טלאופ - חניה': lift ? 'מעלית' : (full ? 'חניה מלאה' : 'לא מעלית'),
    'טווח ירי': `${long > 0 ? 'משולש קטן' : ''}${long > 0 && short > 0 ? ', ' : ''}${short > 0 ? 'משולש גדול' : ''}` || 'לא ירו',
    'איסוף ': `${floor ? 'איסוף מהרצפה' : ''}${floor && human ? ', ' : ''}${human ? 'איסוף מהשחקן האנושי' : ''}` || 'לא אספו',
    'הערות (אסטרטגיית הגנה, עשה הרבה פאולים, וכו)': 'מידע סינתטי - משחק ' + match
  };
  return row;
}

async function run() {
  console.log("Starting synthetic data generation...");
  for (const match of MATCHES) {
    // Shuffle teams for each match
    const shuffledTeams = [...TEAMS].sort(() => Math.random() - 0.5);
    for (let i = 0; i < 4; i++) {
      const team = shuffledTeams[i];
      const position = POSITIONS[i];
      const data = generateData(team, match, position);
      await syncToSpreadsheet(data);
      // Small delay to avoid hitting rate limits too hard
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  console.log("Synthetic data generation complete.");
}

run();
