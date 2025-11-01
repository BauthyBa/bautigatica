import { useEffect, useRef, useState } from 'react';
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
  const [imageFile, setImageFile] = useState(null);
  const fileInputRef = useRef(null);

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

    let imageUrl = productForm.image || null;

    if (imageFile) {
      const fileExtension = imageFile.name.split('.').pop() || 'jpg';
      const sanitizedName = imageFile.name
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9.-]/g, '');
      const path = `products/${Date.now()}-${sanitizedName || `imagen.${fileExtension}`}`;

      const { error: storageError } = await supabase.storage
        .from('product-images')
        .upload(path, imageFile, {
          cacheControl: '3600',
          upsert: false,
        });

      if (storageError) {
        console.error('Storage upload error', storageError);
        setFeedback('No se pudo subir la imagen. Revisá el archivo e intentá de nuevo.');
        setSubmitting(false);
        return;
      }

      const { data: publicData } = supabase.storage.from('product-images').getPublicUrl(path);
      imageUrl = publicData?.publicUrl ?? null;
    }

    const payload = {
      name: productForm.name,
      description: productForm.description || null,
      price: Number(productForm.price),
      image: imageUrl,
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
        setImageFile(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
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
          <label>
            Cargar imagen (opcional)
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.target.files?.[0];
                setImageFile(file ?? null);
              }}
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
