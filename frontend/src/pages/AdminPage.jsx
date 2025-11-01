import { useEffect, useState } from 'react';
import '../App.css';
import { supabase } from '../lib/supabaseClient';

const ADMIN_CREDENTIALS = {
  username: 'bautista',
  password: 'bautista',
};

const SESSION_KEY = 'supabase-admin-session';

export function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(SESSION_KEY) === 'true';
  });
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [productForm, setProductForm] = useState({
    name: '',
    description: '',
    price: '',
    image: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    if (isAuthenticated && typeof window !== 'undefined') {
      window.localStorage.setItem(SESSION_KEY, 'true');
    }
  }, [isAuthenticated]);

  const handleLoginSubmit = (event) => {
    event.preventDefault();
    const { username, password } = loginForm;
    if (
      username.trim().toLowerCase() === ADMIN_CREDENTIALS.username &&
      password === ADMIN_CREDENTIALS.password
    ) {
      setIsAuthenticated(true);
      setLoginError('');
      setLoginForm({ username: '', password: '' });
    } else {
      setLoginError('Credenciales inválidas. Intentá nuevamente.');
    }
  };

  const handleProductSubmit = async (event) => {
    event.preventDefault();
    if (!productForm.name || !productForm.price) {
      setFeedback('Completá al menos nombre y precio.');
      return;
    }

    setSubmitting(true);
    setFeedback('');

    const payload = {
      name: productForm.name,
      description: productForm.description || null,
      price: Number(productForm.price),
      image: productForm.image || null,
    };

    try {
      const { error } = await supabase.from('products').insert(payload);
      if (error) {
        console.error('Supabase insert error', error);
        setFeedback('No pudimos guardar el producto. Probá de nuevo.');
      } else {
        setFeedback('Producto creado con éxito.');
        setProductForm({
          name: '',
          description: '',
          price: '',
          image: '',
        });
      }
    } catch (err) {
      console.error('Unexpected error', err);
      setFeedback('Ocurrió un error inesperado. Intentá más tarde.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(SESSION_KEY);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="admin-page">
        <form className="admin-card" onSubmit={handleLoginSubmit}>
          <h1>Ingresar al panel</h1>
          <label>
            Usuario
            <input
              type="text"
              value={loginForm.username}
              onChange={(event) =>
                setLoginForm((prev) => ({ ...prev, username: event.target.value }))
              }
              placeholder="Usuario"
              autoComplete="username"
            />
          </label>
          <label>
            Contraseña
            <input
              type="password"
              value={loginForm.password}
              onChange={(event) =>
                setLoginForm((prev) => ({ ...prev, password: event.target.value }))
              }
              placeholder="Contraseña"
              autoComplete="current-password"
            />
          </label>
          {loginError && <p className="admin-feedback admin-feedback--error">{loginError}</p>}
          <button type="submit" className="admin-primary">
            Entrar
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div className="admin-card">
        <header className="admin-header">
          <h1>Panel de productos</h1>
          <button type="button" className="admin-secondary" onClick={handleLogout}>
            Cerrar sesión
          </button>
        </header>
        <form className="admin-form" onSubmit={handleProductSubmit}>
          <label>
            Nombre
            <input
              type="text"
              value={productForm.name}
              onChange={(event) =>
                setProductForm((prev) => ({ ...prev, name: event.target.value }))
              }
              placeholder="Ej. Remera básica"
              required
            />
          </label>
          <label>
            Descripción
            <textarea
              value={productForm.description}
              onChange={(event) =>
                setProductForm((prev) => ({ ...prev, description: event.target.value }))
              }
              placeholder="Detalles del producto"
              rows={3}
            />
          </label>
          <label>
            Precio
            <input
              type="number"
              min="0"
              step="0.01"
              value={productForm.price}
              onChange={(event) =>
                setProductForm((prev) => ({ ...prev, price: event.target.value }))
              }
              placeholder="Ej. 12000"
              required
            />
          </label>
          <label>
            URL de imagen
            <input
              type="url"
              value={productForm.image}
              onChange={(event) =>
                setProductForm((prev) => ({ ...prev, image: event.target.value }))
              }
              placeholder="https://..."
            />
          </label>
          {feedback && (
            <p
              className={`admin-feedback ${
                feedback.includes('éxito') ? 'admin-feedback--success' : 'admin-feedback--error'
              }`}
            >
              {feedback}
            </p>
          )}
          <button type="submit" className="admin-primary" disabled={submitting}>
            {submitting ? 'Guardando...' : 'Crear producto'}
          </button>
        </form>
      </div>
    </div>
  );
}

