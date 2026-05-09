import { useCallback } from 'react';
import { useRouter } from 'next/router';

const ROLE_KEY = 'vesselsync_role';

export default function Home() {
  const router = useRouter();

  const enterCommand = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ROLE_KEY, 'command');
    }
    router.push('/command');
  }, [router]);

  const enterCaptain = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ROLE_KEY, 'captain');
    }
    router.push('/captain');
  }, [router]);

  return (
    <main className="role-gate">
      <div className="role-bg-layer">
        <span className="ocean-grid" />
        <span className="radar-sweep" />
        <span className="ship-dot ship-dot-a" />
        <span className="ship-dot ship-dot-b" />
        <span className="ship-dot ship-dot-c" />
        <span className="storm-flicker storm-flicker-a" />
        <span className="storm-flicker storm-flicker-b" />
      </div>
      <section className="role-gate-card cinematic">
        <h1>VesselSync Command Intelligence System</h1>
        <p>
          Real-time maritime situational awareness, predictive routing, and emergency coordination powered by AI.
        </p>
        <div className="role-actions">
          <button className="btn-primary" onClick={enterCommand}>
            🚢 Enter Command Center
          </button>
          <button className="btn-secondary" onClick={enterCaptain}>
            🧑‍✈️ Enter Captain View
          </button>
        </div>
        <div className="feature-strip">
          <span>Live Fleet Simulation</span>
          <span>Predictive Route Intelligence</span>
          <span>AI Emergency Detection</span>
        </div>
      </section>
    </main>
  );
}
