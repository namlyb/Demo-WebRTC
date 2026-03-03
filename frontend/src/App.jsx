import { BrowserRouter, Routes, Route, useSearchParams } from 'react-router-dom';
import Home from './page/home';
import Call from './page/call';

function Root() {
  const [searchParams] = useSearchParams();
  const roomId = searchParams.get('roomId');
  if (roomId) {
    return <Call />;
  }
  return <Home />;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Root />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;