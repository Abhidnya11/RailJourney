import { HomeHero } from '@/features/home/HomeHero';
import { PinnedCommutes } from '@/features/home/PinnedCommutes';
import { WeatherCard } from '@/features/home/WeatherCard';
import { RecentSearchList } from '@/features/recent-searches/RecentSearchList';
import { TrainSearch } from '@/features/search/TrainSearch';

export default function HomePage() {
  return (
    <div className="home">
      <div className="container container--home hero">
        <HomeHero />
        <TrainSearch />
      </div>
      <div className="container container--home home__deck">
        <div className="home__grid">
          <div className="span-7">
            <RecentSearchList />
          </div>
          <div className="home__aside span-5">
            <PinnedCommutes />
            <WeatherCard />
          </div>
        </div>
      </div>
    </div>
  );
}
