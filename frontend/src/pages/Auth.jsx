import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../context/useAuth";

const GENRES = [
  "Fantasy",
  "Science Fiction",
  "Mystery",
  "Thriller",
  "Romance",
  "Historical Fiction",
  "Horror",
  "Biography",
  "History",
  "Self-Help",
  "Philosophy",
  "Poetry",
  "Contemporary Fiction",
];

function Auth() {
  const location = useLocation();
  const navigate = useNavigate();
  const { signIn, signUp } = useAuth();
  const mode = location.pathname === "/register" ? "register" : "login";
  const [form, setForm] = useState({
    displayName: "",
    email: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [favoriteGenres, setFavoriteGenres] = useState([]);
  const [genresSkipped, setGenresSkipped] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const payload = mode === "login"
        ? { email: form.email, password: form.password }
        : { ...form, favoriteGenres };

      const result = mode === "login"
        ? await signIn(payload)
        : await signUp(payload);

      setSuccess(mode === "login"
        ? `Welcome back, ${result.user.displayName}!`
        : `Account created for ${result.user.displayName}.`);
      const pendingBook = location.state?.pendingBook;
      if (pendingBook?.openLibraryId) {
        navigate(`/books/${pendingBook.openLibraryId}`, {
          replace: true,
          state: { openAddToShelf: true },
        });
      } else {
        const from = location.state?.from;
        navigate(from ? `${from.pathname}${from.search || ""}` : "/dashboard", { replace: true });
      }
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-tabs">
          <button
            type="button"
            className={mode === "login" ? "tab active" : "tab"}
            onClick={() => { navigate("/login", { state: location.state }); setError(""); setSuccess(""); }}
            disabled={loading}
          >
            Log in
          </button>
          <button
            type="button"
            className={mode === "register" ? "tab active" : "tab"}
            onClick={() => { navigate("/register", { state: location.state }); setError(""); setSuccess(""); }}
            disabled={loading}
          >
            Sign up
          </button>
        </div>

        <h1>{mode === "login" ? "Welcome back" : "Create your account"}</h1>
        <p className="auth-intro">
          {mode === "login"
            ? "Sign in to pick up where your reading journey left off."
            : "Create a free account to build shelves and track your reading."}
        </p>

        <form onSubmit={handleSubmit} className="auth-form">
          {mode === "register" && (
            <label>
              Display name
              <input
                type="text"
                name="displayName"
                value={form.displayName}
                onChange={handleChange}
                required
                minLength={2}
                maxLength={60}
              />
            </label>
          )}

          {mode === "register" && (
            <fieldset className="genre-picker">
              <legend>What do you enjoy reading? <span>Optional</span></legend>
              <p>Choose a few genres to personalize your Discover page.</p>
              <div className="genre-chips">
                {GENRES.map((genre) => {
                  const selected = favoriteGenres.includes(genre);
                  return (
                    <label className={selected ? "genre-chip selected" : "genre-chip"} key={genre}>
                      <input
                        type="checkbox"
                        checked={selected}
                        disabled={loading}
                        onChange={() => {
                          setGenresSkipped(false);
                          setFavoriteGenres((current) => selected
                            ? current.filter((value) => value !== genre)
                            : [...current, genre]);
                        }}
                      />
                      {genre}
                    </label>
                  );
                })}
              </div>
              <button
                type="button"
                className="text-button genre-skip"
                disabled={loading}
                onClick={() => {
                  setFavoriteGenres([]);
                  setGenresSkipped(true);
                }}
              >
                {genresSkipped ? "Genres skipped" : "Skip for now"}
              </button>
            </fieldset>
          )}

          <label>
            Email
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              required
            />
          </label>

          <label>
            Password
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              required
              minLength={8}
              maxLength={128}
            />
          </label>

          {error && <p className="form-message error">{error}</p>}
          {success && <p className="form-message success">{success}</p>}

          <button type="submit" className="primary-action" disabled={loading}>
            {loading ? "Please wait..." : mode === "login" ? "Log in" : "Sign up"}
          </button>
        </form>
        <p className="auth-switch">
          {mode === "login" ? "New to ShelfLife?" : "Already have an account?"}{" "}
          <Link to={mode === "login" ? "/register" : "/login"} state={location.state}>
            {mode === "login" ? "Join now" : "Log in"}
          </Link>
        </p>
      </section>
    </main>
  );
}

export default Auth;
