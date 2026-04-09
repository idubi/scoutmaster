
import React, { useState } from 'react';
import { User, Language, SpreadsheetRow } from '../../types';
import AuthForm from './AuthForm';
import { AuthTranslation_EN, AuthTranslation_HE } from '../translations';

interface AuthBindingProps {
  onSubmit: (user: User, mode?: 'investigate' | 'manage') => void;
  language: Language;
  initialName?: string;
  initialMatchNumber?: string;
  history: SpreadsheetRow[];
  externalError?: string | null;
  onDeleteGame?: () => void;
  onUpdateMetadata?: () => void;
  isUpdateMode?: boolean;
}

const AuthBinding: React.FC<AuthBindingProps> = ({ 
  onSubmit, 
  language, 
  initialName = '',
  initialMatchNumber = '',
  initialTeamNumber = '',
  initialRole = 'scouter',
  initialAllianceColor = 'Red',
  history,
  externalError = null,
  onDeleteGame,
  onUpdateMetadata,
  isUpdateMode = false
}) => {
  const [name, setName] = useState(initialName);
  const [teamScouted, setTeamScouted] = useState(initialTeamNumber);
  const [gameNumber, setGameNumber] = useState(initialMatchNumber);
  const [role, setRole] = useState<'scouter' | 'admin'>(initialRole);
  const [allianceColor, setAllianceColor] = useState<'Red' | 'Blue'>(initialAllianceColor);
  const [error, setError] = useState<string | null>(null);

  const t: any = language === Language.HE ? AuthTranslation_HE : AuthTranslation_EN;

  const handleRoleChange = (newRole: 'scouter' | 'admin') => {
    if (isUpdateMode) return;
    setRole(newRole);
    setError(null);
    if (newRole === 'admin') {
      setTeamScouted('');
      setGameNumber('');
    }
  };

  const handleSubmit = (e: React.FormEvent, mode?: 'investigate' | 'manage') => {
    e.preventDefault();
    setError(null);

    if (role === 'admin') {
      onSubmit({ 
        name: name || 'Admin', 
        teamScouted: '0', 
        gameNumber: '0', 
        role 
      }, mode);
    } else if (name && teamScouted && gameNumber) {
      onSubmit({ name, teamScouted, gameNumber, role, allianceColor });
    }
  };

  const displayError = error || externalError;

  return (
    <AuthForm 
      language={language}
      name={name} setName={setName}
      teamScouted={teamScouted} setTeamScouted={setTeamScouted}
      gameNumber={gameNumber} setGameNumber={setGameNumber}
      role={role} setRole={handleRoleChange}
      allianceColor={allianceColor} setAllianceColor={setAllianceColor}
      onSubmit={handleSubmit}
      onDeleteGame={onDeleteGame}
      onUpdateMetadata={onUpdateMetadata}
      error={displayError}
      isUpdateMode={isUpdateMode}
    />
  );
};

export default AuthBinding;
