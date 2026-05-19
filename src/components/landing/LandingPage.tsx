import { LandingSite } from './LandingSite';

interface LandingPageProps {
  onLogin: () => void;
}

/** @deprecated Use LandingSite — thin wrapper for App.tsx */
export function LandingPage({ onLogin }: LandingPageProps) {
  return <LandingSite onLogin={onLogin} />;
}
