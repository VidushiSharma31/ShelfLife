import { useEffect, useState } from "react";

import { useAuth } from "../context/useAuth";
import { getFavoriteGenres, updateFavoriteGenres } from "../services/profileService";

function FavoriteGenres() {
  const { user, updateUser } = useAuth();
  const [supportedGenres, setSupportedGenres] = useState([]);
  const [selectedGenres, setSelectedGenres] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    getFavoriteGenres()
      .then(({ genres, supportedGenres: available }) => {
        setSelectedGenres(genres);
        setSupportedGenres(available);
      })
      .catch((requestError) => setError(requestError.message || "Unable to load your favorite genres."))
      .finally(() => setLoading(false));
  }, []);

  const toggleGenre = (genre) => {
    setSuccess("");
    setSelectedGenres((current) => current.includes(genre)
      ? current.filter((value) => value !== genre)
      : [...current, genre]);
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const { genres } = await updateFavoriteGenres(selectedGenres);
      setSelectedGenres(genres);
      updateUser({ ...user, favoriteGenres: genres });
      setSuccess("Your favorite genres have been saved.");
    } catch (requestError) {
      setError(requestError.message || "Unable to save your favorite genres.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <main className="app-page page-message">Loading your favorite genres...</main>;

  return (
    <main className="app-page narrow-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">YOUR DISCOVER PAGE</p>
          <h1>Favorite genres</h1>
          <p>Choose what you love to read. You can change these any time.</p>
        </div>
      </header>
      <form className="genre-settings-form" onSubmit={save}>
        <div className="genre-chips">
          {supportedGenres.map((genre) => {
            const selected = selectedGenres.includes(genre);
            return (
              <label className={selected ? "genre-chip selected" : "genre-chip"} key={genre}>
                <input
                  type="checkbox"
                  checked={selected}
                  disabled={saving}
                  onChange={() => toggleGenre(genre)}
                />
                {genre}
              </label>
            );
          })}
        </div>
        {error && <p className="form-message error" role="alert">{error}</p>}
        {success && <p className="form-message success" role="status">{success}</p>}
        <div className="entry-actions">
          <button type="submit" className="primary-action" disabled={saving}>
            {saving ? "Saving..." : "Save genres"}
          </button>
          <button
            type="button"
            className="secondary-action"
            disabled={saving || selectedGenres.length === 0}
            onClick={() => { setSelectedGenres([]); setSuccess(""); }}
          >
            Clear selection
          </button>
        </div>
      </form>
    </main>
  );
}

export default FavoriteGenres;
