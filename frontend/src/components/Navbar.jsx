import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";

function Navbar() {
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const navigate = useNavigate();
  const { user, loading, signOut } = useAuth();

  const handleSearch = (e) => {
    e.preventDefault();

    const trimmedQuery = query.trim();

    if (!trimmedQuery) return;

    navigate(`/search?q=${encodeURIComponent(trimmedQuery)}`);
  };

  const handleLogout = async () => {
    setLogoutError("");
    try {
      await signOut();
      navigate("/", { replace: true });
    } catch (error) {
      console.error("Could not log out:", error);
      setLogoutError("Logout failed. Please try again.");
    }
  };

  return (
    <nav className="navbar">
      <div className="nav-left">
        <Link to="/" className="logo">
          ShelfLife
        </Link>

        <div className={menuOpen ? "nav-links open" : "nav-links"} onClick={() => setMenuOpen(false)}>
          <Link to="/">Discover</Link>
          {user ? (
            <>
              <Link to="/dashboard">My Dashboard</Link>
              <Link to="/shelves">My Shelves</Link>
              <Link to="/friends">Friends</Link>
              <Link to="/profile">Profile</Link>
            </>
          ) : !loading && (
            <>
              <Link to="/login">Account</Link>
              <Link to="/register">Join</Link>
            </>
          )}
        </div>
      </div>

      <form className="navbar-search" onSubmit={handleSearch}>
        <input
          type="text"
          placeholder="Search books or authors..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <button type="submit">
          Search
        </button>
      </form>

      <button
        type="button"
        className="nav-menu-toggle"
        aria-label={menuOpen ? "Close navigation" : "Open navigation"}
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
      >
        {menuOpen ? "×" : "☰"}
      </button>

      <div className="nav-actions">
        {user ? (
          <button type="button" className="nav-button" onClick={handleLogout}>Log out</button>
        ) : !loading && (
          <>
            <Link to="/login" className="nav-button">Log in</Link>
            <Link to="/register" className="signup-btn">Sign up</Link>
          </>
        )}
      </div>
      {logoutError && <p className="nav-error" role="alert">{logoutError}</p>}
    </nav>
  );
}

export default Navbar;