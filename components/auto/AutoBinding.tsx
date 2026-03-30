
import React, { useState, useMemo } from 'react';
import { AutoData, Language } from '../../types';
import AutoForm from './AutoForm';

interface AutoBindingProps {
  onNext: (data: AutoData) => void;
  onBack: () => void;
  onLogout: () => void;
  initialData: AutoData;
  language: Language;
}

const AutoBinding: React.FC<AutoBindingProps> = ({ onNext, onBack, onLogout, initialData, language }) => {
  const [data, setData] = useState(initialData);

  const totalCyclesScore = 0; // Cycles removed from UI

  const totalScore = useMemo(() => {
    // Scoring logic: Each ball hit counts as 1 point + Leave bonus (2 points)
    return data.ballsSide + (data.leave ? 2 : 0);
  }, [data.ballsSide, data.leave]);

  const handleZoneToggle = (zoneType: string) => {
    setData(prev => ({ ...prev, zoneType: prev.zoneType === zoneType ? '' : zoneType }));
  };

  const handleLeaveToggle = () => {
    setData(prev => ({ ...prev, leave: !prev.leave }));
  };

  const handleBallsChange = (delta: number) => {
    setData(prev => ({ 
      ...prev, 
      ballsSide: Math.max(0, prev.ballsSide + delta) 
    }));
  };

  const handleMissChange = (delta: number) => {
    setData(prev => ({ ...prev, ballsMissed: Math.max(0, prev.ballsMissed + delta) }));
  };

  const handleNext = () => {
    onNext({ ...data, totalScore });
  };

  return (
    <AutoForm 
      {...data}
      language={language}
      totalScore={totalScore}
      totalCyclesScore={totalCyclesScore}
      onZoneToggle={handleZoneToggle}
      onLeaveToggle={handleLeaveToggle}
      onCycleUpdate={() => {}} // No cycles in UI
      onBallsChange={handleBallsChange}
      onMissChange={handleMissChange}
      onGateToggle={() => setData(p => ({ ...p, openGate: !p.openGate }))}
      onIntakeToggle={() => setData(p => ({ ...p, intake: !p.intake }))}
      onTextChange={(freeText) => setData(p => ({ ...p, freeText }))}
      onNext={handleNext}
      onBack={onBack}
      onLogout={onLogout}
    />
  );
};

export default AutoBinding;
