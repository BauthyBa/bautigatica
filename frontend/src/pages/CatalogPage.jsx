import { Link } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import '../App.css';
import { supabase } from '../lib/supabaseClient';

const FALLBACK_PRODUCTS = [
  {
    id: 'demo-1',
    name: 'Pan de masa madre',
    description: 'Horneado lentamente con fermento natural y harina orgánica.',
    price_transfer: 4200,
    price_card: 4700,
    image:
      'https://images.unsplash.com/photo-1608198093002-ad4e005484ec?auto=format&fit=crop&w=800&q=80',
    payment_link: 'https://mpago.li/2i3s2r8',
  },
  {
    id: 'demo-2',
    name: 'Medialunas artesanales',
    description: 'Dobladas a mano, con manteca y glaseado liviano.',
    price_transfer: 2500,
    price_card: 2800,
    image:
      'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=800&q=80',
    payment_link: 'https://mpago.li/2i3s2r8',
  },
  {
    id: 'demo-3',
    name: 'Tarta frutal',
    description: 'Base de manteca con crema pastelera y frutas de estación.',
    price_transfer: 5300,
    price_card: 5800,
    image:
      'https://images.unsplash.com/photo-1517430816045-df4b7de11d1d?auto=format&fit=crop&w=800&q=80',
    payment_link: 'https://mpago.li/2i3s2r8',
  },
];

const normalizeProduct = (product) => {
  const transferRaw = Number(product.price_transfer ?? product.price ?? 0);
  const transfer = Number.isNaN(transferRaw) ? 0 : transferRaw;
  const cardRaw = Number(product.price_card);
  const cardValue =
    product.price_card === null || product.price_card === undefined || Number.isNaN(cardRaw)
      ? null
      : cardRaw;

  return {
    ...product,
    price_transfer: transfer,
    price_card: cardValue,
    price: transfer,
  };
};

export function CatalogPage() {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [priceCap, setPriceCap] = useState(null);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [quickViewProduct, setQuickViewProduct] = useState(null);
  const handleCloseOverlays = () => {
    setMobileFiltersOpen(false);
    setMobileCartOpen(false);
    setQuickViewProduct(null);
  };

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        maximumFractionDigits: 0,
      }),
    [],
  );

  useEffect(() => {
    const loadProducts = async () => {
      setLoading(true);
      setError('');
      const { data, error: supabaseError } = await supabase
        .from('products')
        .select('id,name,description,price,price_transfer,price_card,image,payment_link');

      if (supabaseError || !data?.length) {
        if (supabaseError) {
          console.error('Supabase error', supabaseError);
          setError('No pudimos cargar los productos. Mostramos algunos de ejemplo.');
        }
        setProducts(FALLBACK_PRODUCTS.map(normalizeProduct));
      } else {
        setProducts(data.map(normalizeProduct));
      }
      setLoading(false);
    };

    loadProducts();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 980px)');
    const handleChange = (event) => {
      setIsMobile(event.matches);
      if (!event.matches) {
        setMobileFiltersOpen(false);
        setMobileCartOpen(false);
      }
    };
    handleChange(mq);
    mq.addEventListener('change', handleChange);
    return () => mq.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (!isMobile) {
      document.body.style.overflow = '';
      return;
    }
    const anyOpen = mobileFiltersOpen || mobileCartOpen || Boolean(quickViewProduct);
    document.body.style.overflow = anyOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobile, mobileFiltersOpen, mobileCartOpen, quickViewProduct]);

  useEffect(() => {
    if (!products.length) return;
    const max = products.reduce((acc, product) => {
      const priceValue = Number(product.price_transfer ?? product.price ?? 0);
      if (!Number.isFinite(priceValue)) return acc;
      return Math.max(acc, priceValue);
    }, 0);
    setPriceCap(max);
  }, [products]);

  const minPrice = useMemo(() => {
    if (!products.length) return 0;
    let min = Infinity;
    for (const product of products) {
      const value = Number(product.price_transfer ?? product.price ?? 0);
      if (Number.isFinite(value)) {
        min = Math.min(min, value);
      }
    }
    return min === Infinity ? 0 : min;
  }, [products]);

  const maxPrice = useMemo(() => {
    if (!products.length) return 0;
    return products.reduce((acc, product) => {
      const value = Number(product.price_transfer ?? product.price ?? 0);
      if (!Number.isFinite(value)) return acc;
      return Math.max(acc, value);
    }, 0);
  }, [products]);

  const cartItems = useMemo(
    () =>
      Object.values(cart).map((item) => {
        const unitPrice = item.price_transfer ?? item.price ?? 0;
        const cardVariant =
          item.price_card !== undefined && item.price_card !== null
            ? item.price_card
            : item.priceCard !== undefined && item.priceCard !== null
            ? item.priceCard
            : null;
        return {
          ...item,
          unitPrice,
          price_card: cardVariant,
          subtotal: item.quantity * unitPrice,
        };
      }),
    [cart],
  );

  const total = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.subtotal, 0),
    [cartItems],
  );

  const filteredProducts = useMemo(() => {
    const normalizedTerm = searchTerm.trim().toLowerCase();
    return products.filter((product) => {
      const searchable = `${product.name ?? ''} ${product.description ?? ''}`.toLowerCase();
      const matchesSearch = normalizedTerm ? searchable.includes(normalizedTerm) : true;
      const priceValue = Number(product.price_transfer ?? product.price ?? 0) || 0;
      const matchesPrice = priceCap ? priceValue <= priceCap : true;
      return matchesSearch && matchesPrice;
    });
  }, [products, searchTerm, priceCap]);

  const clearFilters = () => {
    setSearchTerm('');
    setPriceCap(maxPrice);
  };

  const addToCart = (product) => {
    setCart((prev) => {
      const existing = prev[product.id];
      const quantity = existing ? existing.quantity + 1 : 1;
      return {
        ...prev,
        [product.id]: { ...product, quantity },
      };
    });
  };

  const updateQuantity = (productId, delta) => {
    setCart((prev) => {
      const existing = prev[productId];
      if (!existing) return prev;
      const newQty = existing.quantity + delta;
      if (newQty <= 0) {
        const { [productId]: _removed, ...rest } = prev;
        return rest;
      }
      return {
        ...prev,
        [productId]: { ...existing, quantity: newQty },
      };
    });
  };

  const clearCart = () => setCart({});

  const handleCheckout = () => {
    if (!cartItems.length) return;

    const lines = cartItems.map((item) => {
      const transferLabel = currencyFormatter.format(item.unitPrice);
      const cardLabel =
        item.price_card !== null && item.price_card !== undefined
          ? currencyFormatter.format(item.price_card)
          : null;

      const cardText = cardLabel ? ` / ${cardLabel} tarjeta` : '';
      return `• ${item.name} x${item.quantity} (${transferLabel} transferencia${cardText}) = ${currencyFormatter.format(item.subtotal)}`;
    });

    const message = [
      'Hola Papudo quisiera pedir lo siguente',
      ...lines,
      `Total: ${currencyFormatter.format(total)}`,
    ].join('\n');
    const whatsappNumber = '351530610';
    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodedMessage}`;
    window.open(whatsappUrl, '_blank');
    clearCart();
  };

  return (
    <div className="page page--catalog">
      <header className="hero">
        <h1>Meriendas y Postres</h1>
      </header>

      {loading ? (
        <div className="status">Cargando productos...</div>
      ) : (
        <>
          {error && <div className="status status--error">{error}</div>}
          <section className="layout">
            {isMobile && (
              <div className="mobile-toolbar">
                <button
                  type="button"
                  className="mobile-toolbar__button"
                  onClick={() => {
                    setMobileFiltersOpen(true);
                    setMobileCartOpen(false);
                  }}
                >
                  Filtros
                </button>
                <button
                  type="button"
                  className="mobile-toolbar__button"
                  onClick={() => {
                    setMobileCartOpen(true);
                    setMobileFiltersOpen(false);
                  }}
                >
                  Carrito ({cartItems.length})
                </button>
              </div>
            )}
            <aside
              className={`filters ${
                isMobile ? (mobileFiltersOpen ? 'is-mobile-open' : 'is-mobile-hidden') : ''
              }`}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="filters__header">
                <h2>Filtros</h2>
                <div className="filters__header-actions">
                  <button type="button" onClick={clearFilters}>
                    Limpiar
                  </button>
                  {isMobile && (
                    <button type="button" onClick={() => setMobileFiltersOpen(false)}>
                      Cerrar
                    </button>
                  )}
                </div>
              </div>
              <div className="filters__rows">
                <label className="filters__field">
                  Buscar
                  <input
                    type="search"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Nombre o descripción"
                  />
                </label>
                <div className="filters__field">
                  <span>Precio máximo</span>
                  <div className="filters__range">
                    <input
                      type="range"
                      min={minPrice || 0}
                      max={maxPrice || 0}
                      value={priceCap ?? maxPrice ?? 0}
                      onChange={(event) => setPriceCap(Number(event.target.value))}
                      disabled={!maxPrice}
                    />
                    <span>
                      {maxPrice
                        ? `Hasta ${currencyFormatter.format(priceCap ?? maxPrice ?? 0)}`
                        : 'Todos los precios'}
                    </span>
                  </div>
                </div>
              </div>
            </aside>

            <div className="catalog-area">
              <div className="catalog">
                {filteredProducts.map((product) => (
                  <article
                    key={product.id}
                    className="product-card"
                  >
                    <img
                      src={product.image}
                      alt={product.name}
                      className="product-card__image"
                    />
                  <div className="product-card__body">
                    <h2>{product.name}</h2>
                    <p>{product.description}</p>
                    <div className="product-card__pricing">
                      <div className="product-card__pricing-main">
                        <span className="product-card__amount">
                          {currencyFormatter.format(product.price_transfer ?? 0)}
                        </span>
                        <span className="product-card__label">Transferencia</span>
                      </div>
                      {product.price_card !== null && product.price_card !== undefined && (
                        <div className="product-card__pricing-secondary">
                          <span>{currencyFormatter.format(product.price_card)}</span>
                          <span className="product-card__label">Con tarjeta</span>
                        </div>
                      )}
                    </div>
                  </div>
                    <div className="product-card__actions">
                      <button
                        className="product-card__cta product-card__cta--ghost"
                        type="button"
                        onClick={() => setQuickViewProduct(product)}
                      >
                        Vista rápida
                      </button>
                      <button className="product-card__cta" onClick={() => addToCart(product)}>
                        Agregar al carrito
                      </button>
                      <a
                        className="product-card__cta product-card__cta--link"
                        href={product.payment_link || 'https://mpago.li/2i3s2r8'}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Pagar ahora
                      </a>
                    </div>
                  </article>
                ))}
                {!filteredProducts.length && (
                  <div className="status">No encontramos productos con esos filtros.</div>
                )}
              </div>
            </div>

            <aside
              className={`cart ${
                isMobile ? (mobileCartOpen ? 'is-mobile-open' : 'is-mobile-hidden') : ''
              }`}
              onClick={(event) => event.stopPropagation()}
            >
              {isMobile ? (
                <div className="cart__header-mobile">
                  <h2>Tu carrito</h2>
                  <button type="button" onClick={() => setMobileCartOpen(false)}>
                    Cerrar
                  </button>
                </div>
              ) : (
                <h2>Tu carrito</h2>
              )}
              {!cartItems.length && <p className="cart__empty">Todavía no agregaste productos.</p>}
              {cartItems.length > 0 && (
                <ul className="cart__list">
                  {cartItems.map((item) => (
                    <li key={item.id} className="cart__item">
                      <div>
                        <strong>{item.name}</strong>
                        <div className="cart__item-price">
                          <span className="cart__price-main">
                            {currencyFormatter.format(item.unitPrice)}
                          </span>
                          <span className="cart__price-label">Transferencia</span>
                          {item.price_card !== null && item.price_card !== undefined && (
                            <span className="cart__price-secondary">
                              {currencyFormatter.format(item.price_card)} con tarjeta
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="cart__item-controls">
                        <button onClick={() => updateQuantity(item.id, -1)}>-</button>
                        <span>{item.quantity}</span>
                        <button onClick={() => updateQuantity(item.id, 1)}>+</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {cartItems.length > 0 && (
                <>
                  <div className="cart__total">
                    <span>Total estimado</span>
                    <strong>{currencyFormatter.format(total)}</strong>
                  </div>
                  <button className="cart__checkout" onClick={handleCheckout}>
                    Finalizar compra por WhatsApp
                  </button>
                  <p className="cart__note">Coordinamos la entrega por WhatsApp luego de tu pedido.</p>
                </>
              )}
            </aside>
          </section>
        </>
      )}
      <footer className="catalog-footer">
        <span>¿Sos del equipo de Panaderia Bautista?</span>
        <Link to="/admin">Ingresar al panel</Link>
      </footer>
      {(isMobile && (mobileFiltersOpen || mobileCartOpen)) && (
        <div className="drawer-backdrop" onClick={handleCloseOverlays} />
      )}
      {quickViewProduct && (
        <>
          <div className="drawer-backdrop" onClick={handleCloseOverlays} />
          <div className="quickview" onClick={(event) => event.stopPropagation()}>
            <button className="quickview__close" type="button" onClick={handleCloseOverlays}>
              ×
            </button>
            <div className="quickview__content">
              <img src={quickViewProduct.image} alt={quickViewProduct.name} />
              <div className="quickview__details">
                <h2>{quickViewProduct.name}</h2>
                <p>{quickViewProduct.description}</p>
                <div className="quickview__pricing">
                  <div>
                    <span className="quickview__amount">
                      {currencyFormatter.format(quickViewProduct.price_transfer ?? 0)}
                    </span>
                    <span className="quickview__label">Transferencia</span>
                  </div>
                  <div>
                    <span className="quickview__amount quickview__amount--secondary">
                      {currencyFormatter.format(
                        quickViewProduct.price_card ?? quickViewProduct.price_transfer ?? 0,
                      )}
                    </span>
                    <span className="quickview__label">Con tarjeta</span>
                  </div>
                </div>
                <div className="quickview__actions">
                  <button
                    className="product-card__cta"
                    type="button"
                    onClick={() => {
                      addToCart(quickViewProduct);
                      handleCloseOverlays();
                    }}
                  >
                    Agregar al carrito
                  </button>
                  <a
                    className="product-card__cta product-card__cta--link"
                    href={quickViewProduct.payment_link || 'https://mpago.li/2i3s2r8'}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Pagar ahora
                  </a>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
