import { Link } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import '../App.css';
import { supabase } from '../lib/supabaseClient';

const FALLBACK_PRODUCTS = [
  {
    id: 'demo-1',
    name: 'Pan de masa madre',
    description: 'Horneado lentamente con fermento natural y harina orgánica.',
    price: 4200,
    image:
      'https://images.unsplash.com/photo-1608198093002-ad4e005484ec?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'demo-2',
    name: 'Medialunas artesanales',
    description: 'Dobladas a mano, con manteca y glaseado liviano.',
    price: 2500,
    image:
      'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'demo-3',
    name: 'Tarta frutal',
    description: 'Base de manteca con crema pastelera y frutas de estación.',
    price: 5300,
    image:
      'https://images.unsplash.com/photo-1517430816045-df4b7de11d1d?auto=format&fit=crop&w=800&q=80',
  },
];

export function CatalogPage() {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadProducts = async () => {
      setLoading(true);
      setError('');
      const { data, error: supabaseError } = await supabase
        .from('products')
        .select('id,name,description,price,image');

      if (supabaseError || !data?.length) {
        if (supabaseError) {
          console.error('Supabase error', supabaseError);
          setError('No pudimos cargar los productos. Mostramos algunos de ejemplo.');
        }
        setProducts(FALLBACK_PRODUCTS);
      } else {
        setProducts(data);
      }
      setLoading(false);
    };

    loadProducts();
  }, []);

  const cartItems = useMemo(
    () =>
      Object.values(cart).map((item) => ({
        ...item,
        subtotal: item.quantity * item.price,
      })),
    [cart],
  );

  const total = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.subtotal, 0),
    [cartItems],
  );

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
    const formatter = new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      maximumFractionDigits: 0,
    });

    const lines = cartItems.map(
      (item) =>
        `• ${item.name} x${item.quantity} (${formatter.format(item.price)} c/u) = ${formatter.format(item.subtotal)}`,
    );

    const message = [
      'Hola! Quisiera hacer la siguiente compra:',
      ...lines,
      `Total: ${formatter.format(total)}`,
    ].join('\n');

    const whatsappNumber = '3515306105';
    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodedMessage}`;
    window.open(whatsappUrl, '_blank');
    clearCart();
  };

  return (
    <div className="page page--catalog">
      <header className="hero">
        <div className="hero__badge">Hecho en Córdoba</div>
        <h1>Panaderia Bautista</h1>
        <p>Pan fresco, facturas y tortas caseras listas para tu mesa cada mañana.</p>
      </header>

      {loading ? (
        <div className="status">Cargando productos...</div>
      ) : (
        <>
          {error && <div className="status status--error">{error}</div>}
          <section className="layout">
            <div className="catalog">
              {products.map((product) => (
                <article key={product.id} className="product-card">
                  <img
                    src={product.image}
                    alt={product.name}
                    className="product-card__image"
                  />
                  <div className="product-card__body">
                    <h2>{product.name}</h2>
                    <p>{product.description}</p>
                    <span className="product-card__price">
                      ${Number(product.price || 0).toLocaleString('es-AR')}
                    </span>
                  </div>
                  <button className="product-card__cta" onClick={() => addToCart(product)}>
                    Agregar al carrito
                  </button>
                </article>
              ))}
              {!products.length && (
                <div className="status">No hay productos disponibles en este momento.</div>
              )}
            </div>

            <aside className="cart">
              <h2>Tu carrito</h2>
              {!cartItems.length && <p className="cart__empty">Todavía no agregaste productos.</p>}
              {cartItems.length > 0 && (
                <ul className="cart__list">
                  {cartItems.map((item) => (
                    <li key={item.id} className="cart__item">
                      <div>
                        <strong>{item.name}</strong>
                        <p className="cart__item-price">
                          ${Number(item.price || 0).toLocaleString('es-AR')}
                        </p>
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
                    <strong>${total.toLocaleString('es-AR')}</strong>
                  </div>
                  <button className="cart__checkout" onClick={handleCheckout}>
                    Finalizar compra por WhatsApp
                  </button>
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
    </div>
  );
}
