import { useEffect, useMemo, useState } from 'react';
import './App.css';
import { supabase } from './lib/supabaseClient';

const FALLBACK_PRODUCTS = [
  {
    id: 'demo-1',
    name: 'Producto Demo 1',
    description: 'Ejemplo de artículo para mostrar el catálogo.',
    price: 12000,
    image:
      'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=600&q=80',
  },
  {
    id: 'demo-2',
    name: 'Producto Demo 2',
    description: 'Otro artículo de prueba para completar el listado.',
    price: 18500,
    image:
      'https://images.unsplash.com/photo-1512494068027-250ac5ca0f2b?auto=format&fit=crop&w=600&q=80',
  },
];

function App() {
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
    <div className="page">
      <header className="header">
        <h1>Tienda Supabase</h1>
        <p>Explorá el catálogo y completá tu pedido por WhatsApp.</p>
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
    </div>
  );
}

export default App;
