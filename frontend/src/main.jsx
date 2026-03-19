import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Kiểm tra query parameter ?debug=1
const urlParams = new URLSearchParams(window.location.search);
const debug = urlParams.get('debug') === '1';

if (debug) {
  // Dynamic import vConsole để không làm tăng kích thước bundle cho người dùng thường
  import('vconsole').then((module) => {
    const VConsole = module.default;
    new VConsole();
    console.log('🔧 vConsole enabled');
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);