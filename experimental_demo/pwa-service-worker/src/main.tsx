import React from 'react';
import ReactDOM from 'react-dom/client';

function App() {
  return (
    <div style={{ padding: 16, fontFamily: 'system-ui' }}>
      <h1>Spike 8: PWA 验证</h1>
      <p>如果你能看到这个页面，说明 React 正常渲染。</p>
      <p>Service Worker 状态: <span id="sw-status">检测中...</span></p>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
