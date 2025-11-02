import { useEffect, useMemo, useRef, useState } from 'react';
import '../App.css';
import { supabase } from '../lib/supabaseClient';

const ADMIN_CREDENTIALS = {
  username: 'bautista',
  password: 'bautista',
};

const SESSION_KEY = 'supabase-admin-session';
const STORAGE_BUCKET = 'product-images';

const extractStoragePath = (url) => {
  if (!url) return null;
  try {
    const decoded = decodeURIComponent(url);
    const [, path] = decoded.split(`${STORAGE_BUCKET}/`);
    return path ?? null;
  } catch (error) {
    console.error('No se pudo obtener la ruta del archivo', error);
    return null;
  }
};

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
    priceTransfer: '',
    priceCard: '',
    payment_link: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [productsError, setProductsError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [currentImageUrl, setCurrentImageUrl] = useState('');
  const fileInputRef = useRef(null);
  const priceFormatter = useMemo(
    () =>
      new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        maximumFractionDigits: 0,
      }),
    [],
  );

  useEffect(() => {
    if (isAuthenticated && typeof window !== 'undefined') {
      window.localStorage.setItem(SESSION_KEY, 'true');
    }
  }, [isAuthenticated]);

  const loadProducts = async () => {
    setLoadingProducts(true);
    setProductsError('');
    const { data, error } = await supabase
      .from('products')
      .select('id,name,description,price,price_transfer,price_card,image,payment_link,created_at')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error al cargar productos', error);
      setProductsError(
        `No pudimos obtener los productos (${error.message ?? 'revisá las policies de Supabase'}).`,
      );
      setProducts([]);
    } else {
      setProducts(data ?? []);
    }
    setLoadingProducts(false);
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    loadProducts();
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

  const resetForm = () => {
    setProductForm({
      name: '',
      description: '',
      priceTransfer: '',
      priceCard: '',
      payment_link: '',
    });
    setImageFile(null);
    setEditingId(null);
    setCurrentImageUrl('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleProductSubmit = async (event) => {
    event.preventDefault();
    if (!productForm.name || !productForm.priceTransfer) {
      setFeedback('Completá al menos nombre y el precio por transferencia.');
      return;
    }

    const isEditing = Boolean(editingId);

    setSubmitting(true);
    setFeedback('');

    if (!imageFile && !isEditing) {
      setFeedback('Subí una imagen del producto para continuar.');
      setSubmitting(false);
      return;
    }

    let imageUrl = currentImageUrl;

    if (imageFile) {
      const fileExtension = imageFile.name.split('.').pop() || 'jpg';
      const sanitizedName = imageFile.name
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9.-]/g, '');
      const path = `products/${Date.now()}-${sanitizedName || `imagen.${fileExtension}`}`;

      const { error: storageError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, imageFile, {
          cacheControl: '3600',
          upsert: false,
        });

      if (storageError) {
        console.error('Error al subir la imagen', storageError);
        setFeedback('No se pudo subir la imagen. Revisá el archivo e intentá de nuevo.');
        setSubmitting(false);
        return;
      }

      const { data: publicData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
      imageUrl = publicData?.publicUrl ?? null;
    }

    const priceTransferValue = Number(productForm.priceTransfer) || 0;
    const priceCardRaw = Number(productForm.priceCard);
    const priceCardValue =
      productForm.priceCard === '' || Number.isNaN(priceCardRaw) ? null : priceCardRaw;

    const payload = {
      name: productForm.name,
      description: productForm.description || null,
      price_transfer: priceTransferValue,
      price_card: priceCardValue,
      price: priceTransferValue,
      image: imageUrl,
      payment_link: productForm.payment_link || null,
    };

    try {
      if (isEditing) {
        const { error } = await supabase
          .from('products')
          .update(payload)
          .eq('id', editingId)
          .select();
        if (error) {
          console.error('Error al actualizar el producto', error);
          setFeedback(`No pudimos actualizar el producto. Detalle: ${error.message}`);
        } else {
          setFeedback('Producto actualizado con éxito.');
          resetForm();
          await loadProducts();
        }
      } else {
        const { error } = await supabase.from('products').insert([payload]).select();
        if (error) {
          console.error('Error al crear el producto', error);
          setFeedback(`No pudimos guardar el producto. Detalle: ${error.message}`);
        } else {
          setFeedback('Producto creado con éxito.');
          resetForm();
          await loadProducts();
        }
      }
    } catch (err) {
      console.error('Error inesperado', err);
      setFeedback('Ocurrió un error inesperado. Intentá más tarde.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (product) => {
    setEditingId(product.id);
    setProductForm({
      name: product.name ?? '',
      description: product.description ?? '',
      priceTransfer:
        product.price_transfer !== null && product.price_transfer !== undefined
          ? String(product.price_transfer)
          : product.price
          ? String(product.price)
          : '',
      priceCard:
        product.price_card !== null && product.price_card !== undefined
          ? String(product.price_card)
          : '',
      payment_link: product.payment_link ?? '',
    });
    setCurrentImageUrl(product.image ?? '');
    setImageFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setFeedback('');
  };

  const handleDelete = async (product) => {
    const confirmed = window.confirm(
      `¿Seguro que querés eliminar "${product.name}"? Esta acción no se puede deshacer.`,
    );
    if (!confirmed) return;

    setSubmitting(true);
    setFeedback('');

    const imagePath = extractStoragePath(product.image);

    try {
      const { error } = await supabase.from('products').delete().eq('id', product.id).select();
      if (error) {
        console.error('Error al eliminar el producto', error);
        setFeedback(`No pudimos eliminar el producto. Detalle: ${error.message}`);
      } else {
        if (imagePath) {
          const { error: storageError } = await supabase.storage
            .from(STORAGE_BUCKET)
            .remove([imagePath]);
          if (storageError) {
            console.warn('No se pudo borrar la imagen asociada', storageError);
          }
        }
        setFeedback('Producto eliminado.');
        if (editingId === product.id) {
          resetForm();
        }
        await loadProducts();
      }
    } catch (err) {
      console.error('Error inesperado al eliminar', err);
      setFeedback('Ocurrió un error inesperado al eliminar el producto.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(SESSION_KEY);
    }
    resetForm();
    setProducts([]);
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
              placeholder="Ej. Pan de masa madre"
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
            Precio transferencia
            <input
              type="number"
              min="0"
              step="0.01"
              value={productForm.priceTransfer}
              onChange={(event) =>
                setProductForm((prev) => ({ ...prev, priceTransfer: event.target.value }))
              }
              placeholder="Ej. 1200"
              required
            />
          </label>
          <label>
            Precio con tarjeta (opcional)
            <input
              type="number"
              min="0"
              step="0.01"
              value={productForm.priceCard}
              onChange={(event) =>
                setProductForm((prev) => ({ ...prev, priceCard: event.target.value }))
              }
              placeholder="Ej. 1350"
            />
          </label>
          <label>
            Link de pago (opcional)
            <input
              type="url"
              value={productForm.payment_link}
              onChange={(event) =>
                setProductForm((prev) => ({ ...prev, payment_link: event.target.value }))
              }
              placeholder="https://link.mercadopago.com.ar/..."
            />
          </label>
          <label>
            Imagen del producto
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.target.files?.[0];
                setImageFile(file ?? null);
              }}
            />
            <span className="admin-hint">
              {imageFile
                ? `Archivo seleccionado: ${imageFile.name}`
                : editingId && currentImageUrl
                ? 'Se mantiene la imagen actual. Subí otra para reemplazarla.'
                : 'Subí una foto en formato JPG o PNG.'}
            </span>
          </label>
          {feedback && (
            <p
              className={`admin-feedback ${
                feedback.includes('éxito') || feedback.includes('eliminado')
                  ? 'admin-feedback--success'
                  : 'admin-feedback--error'
              }`}
            >
              {feedback}
            </p>
          )}
          <div className="admin-form__actions">
            <button type="submit" className="admin-primary" disabled={submitting}>
              {submitting
                ? 'Guardando...'
                : editingId
                ? 'Actualizar producto'
                : 'Crear producto'}
            </button>
            {editingId && (
              <button
                type="button"
                className="admin-secondary"
                onClick={resetForm}
                disabled={submitting}
              >
                Cancelar edición
              </button>
            )}
          </div>
        </form>
        {loadingProducts ? (
          <p className="admin-feedback">Cargando productos...</p>
        ) : (
          <div className="admin-list">
            <div className="admin-list__header">
              <h2>Productos cargados</h2>
              <button type="button" className="admin-secondary" onClick={loadProducts}>
                Recargar
              </button>
            </div>
            {productsError && (
              <p className="admin-feedback admin-feedback--error">{productsError}</p>
            )}
            {!productsError && products.length === 0 && (
              <p className="admin-feedback">Todavía no hay productos cargados.</p>
            )}
            <ul className="admin-list__items">
              {products.map((product) => (
                <li key={product.id} className="admin-list__item">
                  <div className="admin-list__info">
                    <strong>{product.name}</strong>
                    <div className="admin-list__prices">
                      <span className="admin-list__price-main">
                        {priceFormatter.format(product.price_transfer ?? product.price ?? 0)}
                      </span>
                      <span className="admin-list__price-label">Transferencia</span>
                      {product.price_card !== null && product.price_card !== undefined && (
                        <span className="admin-list__price-secondary">
                          {priceFormatter.format(product.price_card)} con tarjeta
                        </span>
                      )}
                    </div>
                    {product.description && <p>{product.description}</p>}
                    {product.payment_link && (
                      <a
                        className="admin-list__link"
                        href={product.payment_link}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Link de pago
                      </a>
                    )}
                  </div>
                  <div className="admin-list__actions">
                    <button
                      type="button"
                      className="admin-secondary"
                      onClick={() => handleEdit(product)}
                      disabled={submitting}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="admin-danger"
                      onClick={() => handleDelete(product)}
                      disabled={submitting}
                    >
                      Eliminar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
