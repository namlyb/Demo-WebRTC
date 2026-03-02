import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SocketProvider } from "./context/SocketContext";
import Home from "./page/home.jsx";
import Call from "./page/call.jsx";

function App() {
  return (
    <SocketProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/call/:roomCode" element={<Call />} />
        </Routes>
      </BrowserRouter>
    </SocketProvider>
  );
}

export default App;