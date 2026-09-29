import { useParams } from 'react-router-dom';
import Placeholder from '../components/Placeholder.jsx';

export default function DayPage() {
  const { game, date } = useParams();
  return (
    <Placeholder title="Day" phase={8}>
      <p className="hint">{game === 'pokemon' ? 'Pokémon' : 'Magic'} · {date}</p>
    </Placeholder>
  );
}
