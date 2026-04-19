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
  matchNumber: string; // The match/game number
  role: 'scouter' | 'admin' | 'guest';
  allianceColor?: 'Red' | 'Blue';
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
  name: string;
  matchNumber: string;
  allianceColor?: string;
  teamScouted: string;
  role?: string;
  isAutoZoneSmall: boolean;
  isAutoZoneBig: boolean;
  isAutoLeave: boolean;
  autoOpenGate: boolean;
  autoIntakeUsed: boolean;
  autoBallHit: number;
  autoBallMiss: number;
  autoNotes: string;
  teleBallHit: number;
  isTeleopZoneSmall: boolean;
  isTeleopZoneBig: boolean;
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
  aiAnalysis?: string;
  recordType: 'SESSION_START' | 'AUTO_COMPLETE' | 'TELEOP_COMPLETE' | 'MATCH_COMPLETE';
  sheetName?: string;
  headers?: string[];

  // Hebrew Mapped Fields for demo-table
  '.'?: string;
  'teleFullParking'?: boolean;
}

export interface TeamAggregatedData {
  TeamNumber: string;
  GAMES_COUNT: number;
  TOTAL_TELEOP_HIT: number;
  TOTAL_AUTONOMUS_HIT: number;
  TOTAL_TELEOP_MISS: number;
  TOTAL_AUTONOMUS_MISS: number;
  TOTAL_IS_FULL_PARKING: number;
  TOTAL_AUTO_ZONE_SMALL: number;
  TOTAL_AUTO_ZONE_BIG: number;
  TOTAL_TELEOP_ZONE_SMALL: number;
  TOTAL_TELEOP_ZONE_BIG: number;
  TOTAL_AUTO_LEAVE: number;
  TOTAL_FOULS: number;
  TOTAL_GATE_FOULS: number;
  TOTAL_PARKING_FOULS: number;
  TOTAL_INTAKE_FOULS: number;
  GRADE: number;
  RATIO: number;
  RANK: number;
}

export interface TeamGradeResult {
  grade: number;
  ratio: number;
}
