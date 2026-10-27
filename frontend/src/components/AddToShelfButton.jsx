import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../context/useAuth";
import { addBookToShelf, getShelves } from "../services/readingService";

function AddToShelfButton({ book, initiallyOpen = false }) {
  const { user, loading: authLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(initiallyOpen);
  const [shelves, setShelves] = useState([]);
  const [shelfId, setShelfId] = useState("");
  const [loading, setLoading] = useState(initiallyOpen);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !user) return;
    let active = true;
    getShelves()
      .then(({ shelves: result }) => {
        if (!active) return;
        setShelves(result);
        setShelfId((current) => current || result.find((shelf) => shelf.status === "WANT_TO_READ")?.id || result[0]?.id || "");
      })
      .catch((requestError) => {
        if (active) setError(requestError.message || "Unable to load your shelves.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, user]);

  const openDialog = () => {
    setError("");
    setMessage("");
    if (!user) {
      navigate("/login", {
        state: { from: location, pendingBook: book },
      });
      return;
    }
    setLoading(true);
    setOpen(true);
  };

  const save = async (event) => {
    event.preventDefault();
    const payload = {
      openLibraryId: book.openLibraryId,
      title: book.title,
      subtitle: book.subtitle || null,
      description: book.description || null,
      coverUrl: book.coverUrl || "",
      authors: (book.authors || []).map((author) => typeof author === "string" ? author : author.name).filter(Boolean),
      subjects: book.subjects || [],
      firstPublishYear: book.firstPublishYear || null,
      pageCount: book.pageCount || null,
      isbn: book.isbn || null,
    };

    setSaving(true);
    setError("");
    try {
      const result = await addBookToShelf(shelfId, payload);
      setMessage(result.alreadyOnShelf ? "This book is already on that shelf." : "Book added to your shelf.");
      window.setTimeout(() => {
        setOpen(false);
        setMessage("");
      }, 1200);
    } catch (requestError) {
      setError(requestError.message || "Unable to add this book.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button type="button" className="shelf-action" onClick={openDialog} disabled={authLoading}>
        + Add to Shelf
      </button>
      {open && user && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}>
          <section className="shelf-modal" role="dialog" aria-modal="true" aria-labelledby="add-book-title">
            <button type="button" className="modal-close" aria-label="Close" onClick={() => setOpen(false)}>×</button>
            <p className="eyebrow">YOUR LIBRARY</p>
            <h2 id="add-book-title">Add {book.title} to a shelf</h2>
            {loading ? <p>Loading your shelves...</p> : (
              <form className="stacked-form" onSubmit={save}>
                <label>
                  Choose a shelf
                  <select value={shelfId} onChange={(event) => setShelfId(event.target.value)} required>
                    {shelves.map((shelf) => <option key={shelf.id} value={shelf.id}>{shelf.name}</option>)}
                  </select>
                </label>
                {error && <p className="form-message error">{error}</p>}
                {message && <p className="form-message success">{message}</p>}
                <button className="primary-action" type="submit" disabled={saving || !shelfId}>
                  {saving ? "Saving..." : "Add book"}
                </button>
              </form>
            )}
          </section>
        </div>
      )}
    </>
  );
}

export default AddToShelfButton;
