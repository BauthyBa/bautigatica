import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AdminPage } from './pages/AdminPage.jsx';
import { CatalogPage } from './pages/CatalogPage.jsx';
import { PaymentApproved } from './pages/PaymentApproved.jsx';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<CatalogPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/pago-aprobado" element={<PaymentApproved />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
