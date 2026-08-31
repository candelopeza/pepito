import { Link } from 'react-router-dom';

function Navbar() {
  return (
    <header className="navbar">
      <Link to="/" className="logo-link">
        <div className="logo-icon">
          <svg width="32" height="32" viewBox="0 0 40 40" fill="none">
            <circle cx="20" cy="20" r="18" fill="#4FC3F7" />
            <circle cx="20" cy="12" r="6" fill="#FFD54F" />
            <path d="M20 20 C10 30, 10 38, 20 38 C30 38, 30 30, 20 20" fill="#0288D1" />
          </svg>
        </div>
        <div className="logo-text">
          <span className="ciudad">CIUDAD</span>
          <span className="smt">SMT</span>
        </div>
      </Link>
    </header>
  );
}

export default Navbar;