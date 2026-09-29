import { useParams } from 'react-router-dom';
import Placeholder from '../components/Placeholder.jsx';

export default function CollectionPage() {
  const { id } = useParams();
  return (
    <Placeholder title="Collection" phase={7}>
      <p className="hint">Collection {id}</p>
    </Placeholder>
  );
}
