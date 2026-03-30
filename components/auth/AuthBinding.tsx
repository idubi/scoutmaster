
import React, { useState } from 'react';
import { User, Language } from '../../types';
import AuthForm from './AuthForm';

interface AuthBindingProps {
  onSubmit: (user: User, mode?: 'investigate' | 'manage') => void;
  language: Language;
  initialName?: string;
  initialMatchNumber?: string;
}

const AuthBinding: React.FC<AuthBindingProps> = ({ 
  onSubmit, 
  language, 
  initialName = '',
  initialMatchNumber = '' 
}) => {
  const [name, setName] = useState(initialName);
  const [teamScouted, setTeamScouted] = useState('');
  const [gameNumber, setGameNumber] = useState(initialMatchNumber);
  const [role, setRole] = useState<'scouter' | 'admin'>('scouter');
  const [allianceColor, setAllianceColor] = useState<'Red' | 'Blue'>('Red');
  const [scouterRole, setScouterRole] = useState<'Small Triangle' | 'Near Big Goal'>('Small Triangle');

  const handleRoleChange = (newRole: 'scouter' | 'admin') => {
    setRole(newRole);
    if (newRole === 'admin') {
      setTeamScouted('');
      setGameNumber('');
    }
  };

  const handleSubmit = (e: React.FormEvent, mode?: 'investigate' | 'manage') => {
    e.preventDefault();
    if (role === 'admin') {
      onSubmit({ 
        name: name || 'Admin', 
        teamScouted: '0', 
        gameNumber: '0', 
        role 
      }, mode);
    } else if (name && teamScouted && gameNumber) {
      onSubmit({ name, teamScouted, gameNumber, role, allianceColor, scouterRole });
    }
  };

  return (
    <AuthForm 
      language={language}
      name={name} setName={setName}
      teamScouted={teamScouted} setTeamScouted={setTeamScouted}
      gameNumber={gameNumber} setGameNumber={setGameNumber}
      role={role} setRole={handleRoleChange}
      allianceColor={allianceColor} setAllianceColor={setAllianceColor}
      scouterRole={scouterRole} setScouterRole={setScouterRole}
      onSubmit={handleSubmit}
    />
  );
};

export default AuthBinding;
