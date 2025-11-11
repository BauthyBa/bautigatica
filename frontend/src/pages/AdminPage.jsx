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

const normalizeText = (text) =>
  (text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const parseMessageForProducts = (message, productList) => {
  const normalizedMessage = normalizeText(message);
  if (!normalizedMessage) return [];

  const aggregated = new Map();

  for (const product of productList) {
    const normalizedName = normalizeText(product.name);
    if (!normalizedName) continue;
    const tokens = normalizedName.split(' ').filter(Boolean).map(escapeRegex);
    if (!tokens.length) continue;
    const namePattern = tokens.join('\\s+');
    const quantityBeforeRegex = new RegExp(
      `(\\d+(?:[\\.,]\\d*)?)\\s*(?:x|porciones?|porcion|tortas?|torta|u|unidad(?:es)?|porc)?\\s*(?:de\\s+)?${namePattern}\\b`,
      'gi',
    );
    let match;
    while ((match = quantityBeforeRegex.exec(normalizedMessage)) !== null) {
      const quantity = Number.parseFloat(match[1].replace(',', '.')) || 0;
      if (quantity <= 0) continue;
      aggregated.set(product.id, (aggregated.get(product.id) ?? 0) + quantity);
    }

    const quantityAfterRegex = new RegExp(
      `\\b${namePattern}\\s*(?:x|porciones?|porcion|tortas?|torta|u|unidad(?:es)?|porc)?\\s*(\\d+(?:[\\.,]\\d*)?)`,
      'gi',
    );
    while ((match = quantityAfterRegex.exec(normalizedMessage)) !== null) {
      const quantity = Number.parseFloat(match[1].replace(',', '.')) || 0;
      if (quantity <= 0) continue;
      aggregated.set(product.id, (aggregated.get(product.id) ?? 0) + quantity);
    }
  }

  return Array.from(aggregated.entries()).map(([productId, quantity]) => ({
    productId,
    quantity,
  }));
};

const inferProductCategory = (name) => {
  const normalized = normalizeText(name);
  if (!normalized) return null;
  if (/\btorta/.test(normalized)) return 'torta';
  if (/\bporciones?/.test(normalized) || normalized.includes('porcion')) return 'porcion';
  const portionHints = [
    'brownie',
    'budin',
    'alfajor',
    'medialuna',
    'cuadrado',
    'slice',
    'cupcake',
    'muffin',
    'galleta',
    'cookie',
  ];
  if (portionHints.some((hint) => normalized.includes(hint))) return 'porcion';
  return null;
};

const detectGenericUnits = (message) => {
  const normalized = normalizeText(message);
  if (!normalized) return { porciones: 0, tortas: 0 };

  const sumMatches = (regex) => {
    let total = 0;
    let match;
    while ((match = regex.exec(normalized)) !== null) {
      const value = Number.parseFloat(match[1].replace(',', '.')) || 0;
      if (value > 0) total += value;
    }
    return total;
  };

  return {
    porciones: sumMatches(/(\d+(?:[\\.,]\d*)?)\s*(?:x|porciones?|porcion|porc)\b/g),
    tortas: sumMatches(/(\d+(?:[\\.,]\d*)?)\s*(?:x|tortas?|torta)\b/g),
  };
};

const computePurchaseSummary = (items, productList, message) => {
  const productMap = new Map(productList.map((product) => [product.id, product]));
  const totals = { totalItems: 0, porciones: 0, tortas: 0 };

  for (const item of items) {
    const quantity = Number(item.quantity) || 0;
    if (quantity <= 0) continue;
    totals.totalItems += quantity;
    const product = productMap.get(item.productId);
    const declaredCategory =
      typeof item.category === 'string' && item.category.trim().length > 0
        ? item.category.trim()
        : null;
    const category =
      declaredCategory ?? (product ? inferProductCategory(product.name ?? '') : null);
    if (!category) continue;
    if (category === 'torta') totals.tortas += quantity;
    if (category === 'porcion') totals.porciones += quantity;
  }

  const fallback = detectGenericUnits(message);
  if (totals.porciones === 0) totals.porciones = fallback.porciones;
  if (totals.tortas === 0) totals.tortas = fallback.tortas;

  return totals;
};

const computeAmountFromItems = (items, productMap) => {
  if (!Array.isArray(items) || items.length === 0) return 0;
  return items.reduce((sum, item) => {
    const quantity = Number(item.quantity) || 0;
    if (quantity <= 0) return sum;
    const product =
      productMap.get(item.productId ?? item.product_id) ??
      [...productMap.values()].find((candidate) => candidate.name === item.product_name);
    if (!product) return sum;
    const unitPrice = Number(product.price_transfer ?? product.price ?? 0) || 0;
    return sum + quantity * unitPrice;
  }, 0);
};

const getPurchaseAmount = (purchase, productMap) => {
  if (purchase?.total_amount !== null && purchase?.total_amount !== undefined) {
    return Number(purchase.total_amount) || 0;
  }
  return computeAmountFromItems(purchase?.parsed_items ?? [], productMap);
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
  const [whatsappMessage, setWhatsappMessage] = useState('');
  const [parsedItems, setParsedItems] = useState([]);
  const [parseError, setParseError] = useState('');
  const [purchaseFeedback, setPurchaseFeedback] = useState('');
  const [savingPurchase, setSavingPurchase] = useState(false);
  const [purchases, setPurchases] = useState([]);
  const [loadingPurchases, setLoadingPurchases] = useState(false);
  const [purchasesError, setPurchasesError] = useState('');
  const [deletingPurchaseId, setDeletingPurchaseId] = useState(null);
  const [historyFeedback, setHistoryFeedback] = useState('');
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

  const purchaseSummary = useMemo(
    () => computePurchaseSummary(parsedItems, products, whatsappMessage),
    [parsedItems, products, whatsappMessage],
  );

  const productsById = useMemo(() => {
    const map = new Map();
    products.forEach((product) => {
      map.set(product.id, product);
    });
    return map;
  }, [products]);

  const draftTotalAmount = useMemo(
    () => computeAmountFromItems(parsedItems, productsById),
    [parsedItems, productsById],
  );

  const purchaseRevenue = useMemo(
    () => purchases.reduce((sum, purchase) => sum + getPurchaseAmount(purchase, productsById), 0),
    [purchases, productsById],
  );

  const formatDate = (value) => {
    if (!value) return '—';
    try {
      return new Date(value).toLocaleString('es-AR', {
        dateStyle: 'short',
        timeStyle: 'short',
      });
    } catch {
      return value;
    }
  };

  const getStoredItemsTotal = (purchase) => {
    if (purchase?.total_items !== null && purchase?.total_items !== undefined) {
      return Number(purchase.total_items) || 0;
    }
    if (Array.isArray(purchase?.parsed_items)) {
      return purchase.parsed_items.reduce(
        (sum, entry) => sum + (Number(entry.quantity) || 0),
        0,
      );
    }
    return 0;
  };

  const createPurchaseItem = (productId, quantity = 1) => {
    const product = productsById.get(productId);
    return {
      productId,
      quantity,
      category: inferProductCategory(product?.name ?? '') ?? '',
    };
  };

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

  const loadPurchases = async () => {
    setLoadingPurchases(true);
    setPurchasesError('');
    const { data, error } = await supabase
      .from('purchases')
      .select('id, raw_message, parsed_items, total_items, summary, total_amount, created_at')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Error al cargar compras', error);
      setPurchasesError(
        `No pudimos obtener las compras (${error.message ?? 'verificá la tabla "purchases" y las policies'}).`,
      );
      setPurchases([]);
    } else {
      setPurchases(data ?? []);
    }
    setLoadingPurchases(false);
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    loadPurchases();
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

  const resetPurchaseForm = () => {
    setWhatsappMessage('');
    setParsedItems([]);
    setParseError('');
  };

  const handleDetectPurchase = () => {
    if (!whatsappMessage.trim()) {
      setParseError('Pegá el mensaje de WhatsApp para analizarlo.');
      setParsedItems([]);
      return;
    }
    const detected = parseMessageForProducts(whatsappMessage, products);
    if (!detected.length) {
      setParseError('No encontramos coincidencias. Podés cargar la compra manualmente.');
      setParsedItems([]);
      return;
    }
    setParsedItems(detected.map((item) => createPurchaseItem(item.productId, item.quantity)));
    setParseError('');
  };

  const handleAddPurchaseRow = () => {
    if (!products.length) {
      setParseError('Todavía no hay productos cargados para armar la compra.');
      return;
    }
    setParsedItems((prev) => {
      const previousProductId = prev.length > 0 ? prev[prev.length - 1].productId : products[0].id;
      return [...prev, createPurchaseItem(previousProductId, 1)];
    });
    setParseError('');
  };

  const handlePurchaseItemChange = (index, field, value) => {
    setParsedItems((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        if (field === 'quantity') {
          return { ...item, quantity: value };
        }
        if (field === 'productId') {
          const product = productsById.get(value);
          return {
            ...item,
            productId: value,
            category: inferProductCategory(product?.name ?? '') ?? '',
          };
        }
        if (field === 'category') {
          return { ...item, category: value };
        }
        return item;
      }),
    );
  };

  const handleRemovePurchaseItem = (index) => {
    setParsedItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleDeletePurchase = async (purchaseId) => {
    const confirmed = window.confirm('¿Eliminar este registro de compra?');
    if (!confirmed) return;
    setDeletingPurchaseId(purchaseId);
    setHistoryFeedback('');
    try {
      const { error } = await supabase.from('purchases').delete().eq('id', purchaseId);
      if (error) throw error;
      setHistoryFeedback('Compra eliminada.');
      await loadPurchases();
    } catch (error) {
      console.error('Error al eliminar la compra', error);
      setHistoryFeedback(`No pudimos eliminar la compra (${error.message}).`);
    } finally {
      setDeletingPurchaseId(null);
    }
  };

  const handlePurchaseSave = async () => {
    const message = whatsappMessage.trim();
    if (!message) {
      setPurchaseFeedback('Necesitamos el mensaje original para registrar la compra.');
      return;
    }

    const sanitizedItems = parsedItems
      .map((item) => {
        const quantity = Number(item.quantity);
        if (!Number.isFinite(quantity) || quantity <= 0) return null;
        const product = productsById.get(item.productId);
        if (!product) return null;
        return {
          product_id: product.id,
          product_name: product.name,
          quantity,
          category: item.category || inferProductCategory(product.name ?? '') || null,
        };
      })
      .filter(Boolean);

    if (!sanitizedItems.length) {
      setPurchaseFeedback('Agregá al menos un producto válido antes de guardar.');
      return;
    }

    const summary = computePurchaseSummary(parsedItems, products, message);
    const totalAmount = computeAmountFromItems(parsedItems, productsById);

    setSavingPurchase(true);
    setPurchaseFeedback('');
    try {
      const { error } = await supabase
        .from('purchases')
        .insert([
          {
            raw_message: message,
            parsed_items: sanitizedItems,
            total_items: summary.totalItems,
            summary: { porciones: summary.porciones, tortas: summary.tortas },
            total_amount: totalAmount,
          },
        ])
        .select('id');

      if (error) {
        throw error;
      }

      setPurchaseFeedback('Compra guardada correctamente.');
      resetPurchaseForm();
      await loadPurchases();
    } catch (error) {
      console.error('Error al guardar la compra', error);
      setPurchaseFeedback(`No pudimos guardar la compra (${error.message}).`);
    } finally {
      setSavingPurchase(false);
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(SESSION_KEY);
    }
    resetForm();
    setProducts([]);
    setWhatsappMessage('');
    setParsedItems([]);
    setPurchases([]);
    setPurchasesError('');
    setPurchaseFeedback('');
    setParseError('');
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
      <div className="admin-card admin-card--purchases">
        <header className="admin-header">
          <h2>Registro de compras</h2>
          <button
            type="button"
            className="admin-secondary"
            onClick={loadPurchases}
            disabled={loadingPurchases}
          >
            {loadingPurchases ? 'Actualizando...' : 'Recargar historial'}
          </button>
        </header>
        <label>
          Mensaje recibido
          <textarea
            className="purchase-message"
            rows={5}
            value={whatsappMessage}
            onChange={(event) => setWhatsappMessage(event.target.value)}
            placeholder="Pegá acá el mensaje completo que te mandaron por WhatsApp"
          />
        </label>
        <div className="purchase-actions">
          <button
            type="button"
            className="admin-secondary"
            onClick={handleDetectPurchase}
            disabled={!products.length}
          >
            Detectar desde el mensaje
          </button>
          <button
            type="button"
            className="admin-secondary"
            onClick={handleAddPurchaseRow}
            disabled={!products.length}
          >
            Agregar fila manual
          </button>
        </div>
        {parseError && <p className="admin-feedback admin-feedback--error">{parseError}</p>}
        <div className="purchase-items">
          {parsedItems.length ? (
            <table className="purchase-items__table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Cantidad</th>
                  <th>Tipo</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {parsedItems.map((item, index) => (
                  <tr key={`${item.productId}-${index}`}>
                    <td>
                      <select
                        value={item.productId}
                        onChange={(event) =>
                          handlePurchaseItemChange(index, 'productId', event.target.value)
                        }
                      >
                        {products.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={item.quantity}
                        onChange={(event) =>
                          handlePurchaseItemChange(index, 'quantity', event.target.value)
                        }
                      />
                    </td>
                    <td>
                      <select
                        value={item.category ?? ''}
                        onChange={(event) =>
                          handlePurchaseItemChange(index, 'category', event.target.value)
                        }
                      >
                        <option value="">Automático</option>
                        <option value="porcion">Porción</option>
                        <option value="torta">Torta</option>
                      </select>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="admin-secondary admin-secondary--ghost"
                        onClick={() => handleRemovePurchaseItem(index)}
                      >
                        Quitar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="admin-hint">
              Usá el detector o agregá filas manuales para armar la planilla.
            </p>
          )}
        </div>
        {parsedItems.length > 0 && (
          <div className="purchase-summary">
            <div>
              <span>Total de items</span>
              <strong>{purchaseSummary.totalItems}</strong>
            </div>
            <div>
              <span>Porciones</span>
              <strong>{purchaseSummary.porciones || 0}</strong>
            </div>
            <div>
              <span>Tortas</span>
              <strong>{purchaseSummary.tortas || 0}</strong>
            </div>
            <div>
              <span>Ganancia estimada</span>
              <strong>{priceFormatter.format(draftTotalAmount)}</strong>
            </div>
          </div>
        )}
        {purchaseFeedback && (
          <p
            className={`admin-feedback ${
              purchaseFeedback.includes('correctamente')
                ? 'admin-feedback--success'
                : 'admin-feedback--error'
            }`}
          >
            {purchaseFeedback}
          </p>
        )}
        <div className="admin-form__actions">
          <button
            type="button"
            className="admin-primary"
            onClick={handlePurchaseSave}
            disabled={savingPurchase || !parsedItems.length}
          >
            {savingPurchase ? 'Guardando compra...' : 'Guardar compra'}
          </button>
          <button
            type="button"
            className="admin-secondary"
            onClick={() => {
              resetPurchaseForm();
              setPurchaseFeedback('');
            }}
            disabled={savingPurchase}
          >
            Limpiar
          </button>
        </div>
        <section className="purchase-history">
          <div className="purchase-history__header">
            <h3>Historial reciente</h3>
            {purchases.length > 0 && <span>{purchases.length} guardadas</span>}
          </div>
          <div className="purchase-revenue">
            <span>Ganancias acumuladas</span>
            <strong>{priceFormatter.format(purchaseRevenue)}</strong>
          </div>
          {historyFeedback && (
            <p
              className={`admin-feedback ${
                historyFeedback.includes('eliminada') ? 'admin-feedback--success' : 'admin-feedback--error'
              }`}
            >
              {historyFeedback}
            </p>
          )}
          {loadingPurchases && <p className="admin-feedback">Cargando compras...</p>}
          {purchasesError && (
            <p className="admin-feedback admin-feedback--error">{purchasesError}</p>
          )}
          {!loadingPurchases && !purchasesError && purchases.length === 0 && (
            <p className="admin-feedback">Todavía no registraste compras.</p>
          )}
          <ul className="purchase-history__items">
            {purchases.map((purchase) => (
              <li key={purchase.id} className="purchase-history__item">
                <div className="purchase-history__meta">
                  <div className="purchase-history__meta-info">
                    <strong>{formatDate(purchase.created_at)}</strong>
                    <span>{getStoredItemsTotal(purchase)} items</span>
                  </div>
                  <div className="purchase-history__meta-actions">
                    <span className="purchase-history__amount">
                      {priceFormatter.format(getPurchaseAmount(purchase, productsById))}
                    </span>
                    <button
                      type="button"
                      className="admin-secondary admin-secondary--ghost"
                      onClick={() => handleDeletePurchase(purchase.id)}
                      disabled={deletingPurchaseId === purchase.id}
                    >
                      {deletingPurchaseId === purchase.id ? 'Eliminando...' : 'Eliminar'}
                    </button>
                  </div>
                </div>
                {purchase.summary && (
                  <div className="purchase-summary purchase-summary--inline">
                    <div>
                      <span>Porciones</span>
                      <strong>{purchase.summary?.porciones ?? 0}</strong>
                    </div>
                    <div>
                      <span>Tortas</span>
                      <strong>{purchase.summary?.tortas ?? 0}</strong>
                    </div>
                  </div>
                )}
                {Array.isArray(purchase.parsed_items) && purchase.parsed_items.length > 0 && (
                  <table className="purchase-history__table">
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th>Cantidad</th>
                        <th>Tipo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {purchase.parsed_items.map((item, idx) => (
                        <tr key={`${purchase.id}-${idx}`}>
                          <td>{item.product_name ?? 'Producto'}</td>
                          <td>{item.quantity}</td>
                          <td>{item.category ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <details className="purchase-history__raw">
                  <summary>Ver mensaje original</summary>
                  <pre>{purchase.raw_message}</pre>
                </details>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
