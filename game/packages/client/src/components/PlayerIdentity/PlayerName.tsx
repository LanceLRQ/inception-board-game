import { getCharacterSkillSummary } from '../../lib/cards';

export interface PlayerNameProps {
  name: string;
  characterId?: string | null;
}

export function PlayerName({ name, characterId }: PlayerNameProps) {
  const role = characterId ? getCharacterSkillSummary(characterId)?.name : null;
  return (
    <span className="player-name">
      <span>{name}</span>
      {role && <span className="player-name-role"> · {role}</span>}
    </span>
  );
}
