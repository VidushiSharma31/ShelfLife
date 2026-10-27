import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import Avatar from "./Avatar";

function Navbar() {
  const [query, setQuery] = useState("");
  const [navOpen, setNavOpen] = useState(false);
  const [accountMenuPath, setAccountMenuPath] = useState(null);
  const [logoutError, setLogoutError] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  const menuRef = useRef(null);
  const avatarButtonRef = useRef(null);
  const { user, loading, signOut } = useAuth();

  const accountMenuOpen = accountMenuPath === location.pathname;

  useEffect(() => {
    if (!accountMenuOpen) return undefined;
    const closeOnOutsideClick = (event) => {
      if (!menuRef.current?.contains(event.target)) setAccountMenuPath(null);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        setAccountMenuPath(null);
        avatarButtonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [accountMenuOpen]);

  const handleSearch = (event) => {
    event.preventDefault();
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return;
    navigate(`/search?q=${encodeURIComponent(trimmedQuery)}`);
  };

  const handleLogout = async () => {
    setLogoutError("");
    try {
      await signOut();
      setAccountMenuPath(null);
      navigate("/", { replace: true });
    } catch (error) {
      console.error("Could not log out:", error);
      setLogoutError("Logout failed. Please try again.");
    }
  };

  return (
    <nav className="navbar">
      <div className="nav-left">
        <Link to="/" className="logo">ShelfLife</Link>
        <div className={navOpen ? "nav-links open" : "nav-links"} onClick={() => setNavOpen(false)}>
          <Link to="/">Discover</Link>
          {user && (
            <>
              <Link to="/dashboard">My Dashboard</Link>
              <Link to="/shelves">My Books</Link>
            </>
          )}
        </div>
      </div>

      <form className="navbar-search" onSubmit={handleSearch} role="search">
        <input
          type="search"
          aria-label="Search books or authors"
          placeholder="Search books or authors..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button type="submit">Search</button>
      </form>

      <button
        type="button"
        className="nav-menu-toggle"
        aria-label={navOpen ? "Close navigation" : "Open navigation"}
        aria-expanded={navOpen}
        onClick={() => setNavOpen((open) => !open)}
      >
        {navOpen ? "×" : "☰"}
      </button>

      <div className="nav-actions">
        {user ? (
          <div className="nav-account" ref={menuRef}>
            <button
              type="button"
              ref={avatarButtonRef}
              className="nav-avatar-trigger"
              aria-label={`Open ${user.displayName}'s account menu`}
              aria-haspopup="menu"
              aria-expanded={accountMenuOpen}
              onClick={() => setAccountMenuPath((openPath) => (
                openPath === location.pathname ? null : location.pathname
              ))}
            >
              <Avatar name={user.displayName} src={user.profilePictureUrl} />
            </button>
            {accountMenuOpen && (
              <div className="account-menu" role="menu" aria-label="Account">
                <Link to="/profile" role="menuitem" onClick={() => setAccountMenuPath(null)}>View Profile</Link>
                <Link to="/friends" role="menuitem" onClick={() => setAccountMenuPath(null)}>Friends</Link>
                <Link to="/profile/genres" role="menuitem" onClick={() => setAccountMenuPath(null)}>Favorite Genres</Link>
                <button type="button" role="menuitem" onClick={handleLogout}>Log Out</button>
              </div>
            )}
          </div>
        ) : !loading && (
          <>
            <Link to="/login" className="nav-button">Log in</Link>
            <Link to="/register" className="signup-btn">Sign up</Link>
          </>
        )}
      </div>
      {(logoutError) && <p className="nav-error" role="alert">{logoutError}</p>}
    </nav>
  );
}

export default Navbar;
