import { useState } from 'react';
import { Game } from './components/Game';
import { Login } from './components/Login';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: '#f1f5f9' }}>
      {!isAuthenticated ? (
        <Login onLogin={() => setIsAuthenticated(true)} />
      ) : (
        <Game />
      )}
    </div>
  );
}

export default App;
