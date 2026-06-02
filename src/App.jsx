import React from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import MergePDF from './pages/MergePDF';
import SplitPDF from './pages/SplitPDF';
import EditorPDF from './pages/EditorPDF';
import ProtectPDF from './pages/ProtectPDF';
import UnlockPDF from './pages/UnlockPDF';

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="merge" element={<MergePDF />} />
          <Route path="split" element={<SplitPDF />} />
          <Route path="editor" element={<EditorPDF />} />
          <Route path="protect" element={<ProtectPDF />} />
          <Route path="unlock" element={<UnlockPDF />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}

export default App;


