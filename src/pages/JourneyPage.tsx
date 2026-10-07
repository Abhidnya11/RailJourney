import { useParams } from 'react-router-dom';
import { JourneyView } from '@/features/live-journey/JourneyView';

export default function JourneyPage() {
  const { journeyId = '' } = useParams();
  return <JourneyView journeyId={journeyId} />;
}
