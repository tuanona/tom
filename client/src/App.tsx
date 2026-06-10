import { useState } from 'react';
import { Game } from './components/Game';
import { Login } from './components/Login';
import type { AuthSession } from './lib/protocol';

function App() {
  const [session, setSession] = useState<AuthSession | null>(null);

  return session ? (
    <Game session={session} onLogout={() => setSession(null)} />
  ) : (
    <Login onLogin={setSession} />
  );
}

export default App;
