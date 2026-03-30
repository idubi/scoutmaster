export enum ScoutingPhase {
  AUTH = 'AUTH',
  AUTONOMOUS = 'AUTONOMOUS',
  TELEOP = 'TELEOP',
  SUMMARY = 'SUMMARY',
  ADMIN = 'ADMIN',
  MANAGEMENT = 'MANAGEMENT'
}

export enum Language {
  EN = 'EN',
  HE = 'HE'
}

export interface User {
  teamScouted: string; // The team we are scouting
  name: string; // The name of the scouter
  gameNumber: string; // The match/game number
  role: 'scouter' | 'admin' | 'guest';
  allianceColor?: 'Red' | 'Blue';
  scouterRole?: 'Small Triangle' | 'Near Big Goal';
  sessionId?: string;
  sessionStartTime?: number;
}

export interface AutoCycle {
  id: string;
  collected: boolean;
  count: number;
  missCount: number; 
}

export interface AutoData {
  matchNumber: string;
  teamScouted: string;
  zoneType: string; 
  leave: boolean;
  cycles: AutoCycle[];
  openGate: boolean;
  intake: boolean;
  ballsSide: number; 
  ballsMissed: number; 
  freeText: string;
  totalScore: number;
}

export interface TeleOpData {
  intake: number;
  long: number;
  short: number;
  gateOpen: number;
  gateOverflow: number;
  fieldAwareness: boolean;
  lateTranslation: boolean;
  success: boolean;
  fastRebound: boolean;
  isFrozen: boolean;
  confused: boolean;
  stoppedScoring: boolean;
  fullParkingType: boolean;
  liftParkingType: boolean;
  noParkingType: boolean;
  gateFoul: boolean;
  parkingFoul: boolean;
  intakeFoul: boolean;
  humanPlayer: boolean;
  floor: boolean;
  comments: string;
  totalScore: number;
}

export interface SpreadsheetRow {
  sessionId: string;
  timestamp: string;
  sessionStartTime: string;
  sessionEndTime?: string;
  scouterName: string;
  gameNumber: string;
  scouterRole: string;
  allianceColor?: string;
  matchNumber: string;
  teamScouted: string;
  autoZoneType: string;
  autoMobility_Leave: boolean;
  autoOpenGate: boolean;
  autoIntakeUsed: boolean;
  autoBallHit: number;
  autoBallMiss: number;
  autoNotes: string;
  autoTotalScore: number;
  teleBallHit: number;
  teleSmallTriangle_Long: number;
  teleBigTriangle_Short: number;
  teleBallMiss: number;
  teleFieldAwareness: boolean;
  teleLateTranslation: boolean;
  teleOverallSuccess: boolean;
  teleFastRebound: boolean;
  teleIsFrozen: boolean;
  teleConfused: boolean;
  teleStoppedScoring: boolean;
  teleGateFoul: boolean;
  teleParkingFoul: boolean;
  teleIntakeFoul: boolean;
  teleFoulCount: number;
  teleHumanPlayer: boolean;
  teleFloor: boolean;
  teleComments: string;
  teleTotalScore: number;
  aiAnalysis?: string;
  recordType: 'SESSION_START' | 'MATCH_COMPLETE';
  targetSheetId: string;
  sheetName?: string;
  headers?: string[];

  // Hebrew Mapped Fields for demo-table
  'Timestamp'?: string;
  'שם הסקאוטר'?: string;
  'מספר קבוצה'?: string;
  'מספר מקצה'?: string;
  'צבע ברית'?: string;
  '.'?: string;
  'אוטונומי - מיקום'?: string;
  'אוטונומי - נסע מהמקום'?: string;
  'אוטונומי - כדור מנוקד'?: number;
  'אוטונומי - כדורים שהוחטאו'?: number;
  'הרובוט עשה leave?'?: string;
  'טלאופ - כדור מנוקד'?: number;
  'טלאופ - חניה'?: string;
  'טווח ירי'?: string;
  'איסוף '?: string;
  'הערות (אסטרטגיית הגנה, עשה הרבה פאולים, וכו)'?: string;
}
