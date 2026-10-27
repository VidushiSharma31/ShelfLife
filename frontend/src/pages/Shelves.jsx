import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { createShelf, getShelves } from "../services/readingService";

function Shelves() {
  const [shelves, setShelves] = useState([]);
  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState("PRIVATE");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadShelves = () => getShelves().then(({ shelves: result }) => setShelves(result));
  useEffect(() => {
    loadShelves()
      .catch((requestError) => setError(requestError.message || "Unable to load your shelves."))
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await createShelf({ name, visibility });
      setName("");
      await loadShelves();
    } catch (requestError) {
      setError(requestError.message || "Unable to create the shelf.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <main className="app-page page-message">Loading your shelves...</main>;
  return (
    <main className="app-page">
      <header className="page-heading">
        <div><p className="eyebrow">YOUR LIBRARY</p><h1>My shelves</h1><p>Keep every book in the right place.</p></div>
        <Link className="secondary-action link-button" to="/dashboard">Back to dashboard</Link>
      </header>
      {error && <p className="form-message error">{error}</p>}
      <section className="shelf-list-grid">
        {shelves.map((shelf) => (
          <Link className="shelf-list-card" key={shelf.id} to={`/shelves/${shelf.id}`}>
            <div className="shelf-card-top"><span>{shelf.visibility === "PUBLIC" ? "Public" : "Private"}</span><span>{shelf.books.length} {shelf.books.length === 1 ? "book" : "books"}</span></div>
            <h2>{shelf.name}</h2>
            <span className="shelf-card-link">Open shelf →</span>
          </Link>
        ))}
      </section>
      <section className="create-shelf-panel">
        <div><p className="eyebrow">MAKE IT YOURS</p><h2>Create a custom shelf</h2><p>Organize your books with a collection of your own.</p></div>
        <form className="stacked-form" onSubmit={handleCreate}>
          <label>Shelf name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} required /></label>
          <label>Visibility<select value={visibility} onChange={(event) => setVisibility(event.target.value)}><option value="PRIVATE">Private</option><option value="PUBLIC">Public on my profile</option></select></label>
          <button className="primary-action" type="submit" disabled={saving}>{saving ? "Creating..." : "Create shelf"}</button>
        </form>
      </section>
    </main>
  );
}

export default Shelves;
