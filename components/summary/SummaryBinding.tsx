import React, { useState } from 'react';
import { AutoData, TeleOpData, User, SpreadsheetRow, Language } from '../../types';
import SummaryView from './SummaryView';
import { GoogleGenAI } from "@google/genai";

interface SummaryBindingProps {
  auto: AutoData;
  teleop: TeleOpData;
  user: User;
  targetSheetId: string;
  onFinish: (data: SpreadsheetRow) => void;
  onBack: () => void;
  onLogout: () => void;
  language: Language;
  error?: string | null;
}

const SummaryBinding: React.FC<SummaryBindingProps> = ({ auto, teleop, user, targetSheetId, onFinish, onBack, onLogout, language, error }) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);

  const generateAi = async () => {
    setIsAnalyzing(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const promptText = language === Language.HE 
        ? `הערך את ביצועי קבוצה ${auto.teamScouted} במשחק ${auto.matchNumber}. 
           נתוני אוטונומי: ${JSON.stringify(auto)}. 
           נתוני טלאופ: ${JSON.stringify(teleop)}. 
           ספק סיכום סקאוטינג קצר וקולע עבור מאמן הנהיגה שלנו. השב בעברית בלבד.`
        : `Evaluate Team ${auto.teamScouted} Match ${auto.matchNumber}: 
           Auto Data: ${JSON.stringify(auto)}, 
           TeleOp Data: ${JSON.stringify(teleop)}. 
           Provide a punchy scouting summary for our drive coach. Respond in English only.`;

      const response = await ai.models.generateContent({ 
        model: 'gemini-3-pro-preview', 
        contents: promptText 
      });
      
      setAiAnalysis(response.text || (language === Language.HE ? "נותח." : "Analyzed."));
    } catch (e) {
      console.error(e);
      setAiAnalysis(language === Language.HE ? "שירות ה-AI אינו זמין כרגע." : "AI logic currently unavailable.");
    } finally { setIsAnalyzing(false); }
  };

  const finalize = () => {
    const row: SpreadsheetRow = {
      sessionId: user.sessionId || '',
      timestamp: new Date().toLocaleString(),
      sessionStartTime: user.sessionStartTime ? new Date(user.sessionStartTime).toISOString() : '',
      sessionEndTime: new Date().toISOString(),
      name: user.name,
      gameNumber: user.gameNumber,
      allianceColor: user.allianceColor || '',
      matchNumber: auto.matchNumber,
      teamScouted: auto.teamScouted,
      role: user.role,
      autoZoneType: auto.zoneType,
      autoMobility_Leave: auto.leave,
      autoOpenGate: auto.openGate,
      autoIntakeUsed: auto.intake,
      autoBallHit: auto.ballsSide,
      autoBallMiss: auto.ballsMissed,
      autoNotes: auto.freeText,
      autoTotalScore: auto.totalScore,
      teleBallHit: teleop.intake,
      teleSmallTriangle_Long: teleop.long,
      teleBigTriangle_Short: teleop.short,
      teleBallMiss: teleop.gateOverflow,
      teleFieldAwareness: teleop.fieldAwareness,
      teleLateTranslation: teleop.lateTranslation,
      teleOverallSuccess: teleop.success,
      teleFastRebound: teleop.fastRebound,
      teleIsFrozen: teleop.isFrozen,
      teleConfused: teleop.confused,
      teleStoppedScoring: teleop.stoppedScoring,
      teleGateFoul: teleop.gateFoul,
      teleParkingFoul: teleop.parkingFoul,
      teleIntakeFoul: teleop.intakeFoul,
      teleFoulCount: (teleop.gateFoul ? 1 : 0) + (teleop.parkingFoul ? 1 : 0) + (teleop.intakeFoul ? 1 : 0),
      teleHumanPlayer: teleop.humanPlayer,
      teleFloor: teleop.floor,
      teleComments: teleop.comments,
      teleTotalScore: teleop.totalScore,
      aiAnalysis: aiAnalysis || '',
      recordType: 'MATCH_COMPLETE',
      targetSheetId,

      // Hebrew Mapping
      'Timestamp': new Date().toISOString(),
      'שם הסקאוטר': user.name,
      'מספר קבוצה': auto.teamScouted,
      'מספר מקצה': auto.matchNumber,
      'צבע ברית': user.allianceColor || '',
      'אוטונומי - מיקום': auto.zoneType === 'big' ? 'משולש גדול' : (auto.zoneType === 'small' ? 'משולש קטן' : auto.zoneType),
      'אוטונומי - נסע מהמקום': auto.leave ? 'כן' : 'לא',
      'אוטונומי - כדור מנוקד': auto.ballsSide,
      'אוטונומי - כדורים שהוחטאו': auto.ballsMissed,
      'הרובוט עשה leave?': auto.leave ? 'leave' : 'לא',
      'טלאופ - כדור מנוקד': teleop.intake,
      'טלאופ - חניה': teleop.liftParkingType ? 'מעלית' : (teleop.fullParkingType ? 'חניה מלאה' : 'לא מעלית'),
      'טווח ירי': `${teleop.long > 0 ? 'משולש קטן' : ''}${teleop.long > 0 && teleop.short > 0 ? ', ' : ''}${teleop.short > 0 ? 'משולש גדול' : ''}` || 'לא ירו',
      'איסוף ': `${teleop.floor ? 'איסוף מהרצפה' : ''}${teleop.floor && teleop.humanPlayer ? ', ' : ''}${teleop.humanPlayer ? 'איסוף מהשחקן האנושי' : ''}` || 'לא אספו',
      'הערות (אסטרטגיית הגנה, עשה הרבה פאולים, וכו)': teleop.comments
    };
    onFinish(row);
  };

  return (
    <SummaryView 
      language={language} 
      auto={auto} 
      teleop={teleop} 
      user={user}
      aiAnalysis={aiAnalysis} 
      isAnalyzing={isAnalyzing} 
      onBack={onBack} 
      onFinish={finalize} 
      onGenerateAi={generateAi} 
      onLogout={onLogout}
      error={error}
    />
  );
};

export default SummaryBinding;