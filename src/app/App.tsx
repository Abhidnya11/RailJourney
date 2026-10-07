import { lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AppFooter } from '@/components/layout/AppFooter';
import { AppHeader } from '@/components/layout/AppHeader';
import { Skeleton } from '@/components/ui';
import HomePage from '@/pages/HomePage';

// Route-based code splitting: journey screens (and MapLibre) load on demand.
const JourneyPage = lazy(() => import('@/pages/JourneyPage'));
const SharedJourneyPage = lazy(() => import('@/pages/SharedJourneyPage'));
const ResolveTrainPage = lazy(() => import('@/pages/ResolveTrainPage'));
const LivePage = lazy(() => import('@/pages/LivePage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false } },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <a href="#main" className="sr-only">
          Skip to content
        </a>
        <div className="app-shell">
          <AppHeader />
          <main id="main" className="app-main">
            <Suspense fallback={<Skeleton label="Loading" rows={3} />}>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/live" element={<LivePage />} />
                <Route path="/train/:number" element={<ResolveTrainPage />} />
                <Route path="/journey/share/:shareId" element={<SharedJourneyPage />} />
                <Route path="/journey/:journeyId" element={<JourneyPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </Suspense>
          </main>
          <AppFooter />
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
