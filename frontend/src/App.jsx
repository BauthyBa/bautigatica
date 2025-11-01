import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AdminPage } from './pages/AdminPage.jsx';
import { CatalogPage } from './pages/CatalogPage.jsx';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<CatalogPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
