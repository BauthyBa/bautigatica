import { Link } from 'react-router-dom';
import '../App.css';

export function PaymentApproved() {
  return (
    <div className="page page--thankyou">
      <div className="thankyou-card">
        <span className="thankyou-badge">¡Gracias!</span>
        <h1>Tu pago fue aprobado</h1>
        <p>
          Recibimos la confirmación de Mercado Pago. En breve nos ponemos en contacto para coordinar la
          entrega de tus productos.
        </p>
        <Link to="/" className="thankyou-link">
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}

