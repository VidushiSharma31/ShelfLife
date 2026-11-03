import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../context/useAuth";
import { addBookToShelf, getShelves, updateReading } from "../services/readingService";

function AddToShelfButton({ book, initiallyOpen = false, guestLabel = "", userShelves }) {
  const { user, loading: authLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(initiallyOpen);
  const [shelfState, setShelfState] = useState(null);
  const shelves = shelfState?.userId === user?.id
    ? shelfState.shelves
    : userShelves || [];
  const [shelfId, setShelfId] = useState("");
  const [loading, setLoading] = useState(initiallyOpen);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewRating, setReviewRating] = useState("");
  const [reviewText, setReviewText] = useState("");
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const existingEntry = shelves
    .flatMap((shelf) => shelf.books.map((entry) => ({ ...entry, shelf })))
    .find((entry) => entry.book.openLibraryId === book.openLibraryId);

  useEffect(() => {
    if (!open || !user) return;
    let active = true;
    getShelves()
      .then(({ shelves: result }) => {
        if (!active) return;
        setShelfState({ userId: user.id, shelves: result });
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

  const saveReview = async (event) => {
    event.preventDefault();
    if (!existingEntry) return;
    setReviewSaving(true);
    setReviewError("");
    try {
      const { entry } = await updateReading(existingEntry.id, {
        personalRating: reviewRating === "" ? null : Number(reviewRating),
        notes: reviewText || null,
      });
      setShelfState({ userId: user.id, shelves: shelves.map((shelf) => ({
        ...shelf,
        books: shelf.books.map((shelfEntry) => shelfEntry.id === entry.id ? entry : shelfEntry),
      })) });
      setReviewOpen(false);
    } catch (requestError) {
      setReviewError(requestError.message || "Unable to update this review.");
    } finally {
      setReviewSaving(false);
    }
  };

  const openReview = () => {
    setReviewRating(existingEntry?.personalRating ?? "");
    setReviewText(existingEntry?.notes || "");
    setReviewError("");
    setReviewOpen(true);
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
      setShelfState({
        userId: user.id,
        shelves: shelves.map((shelf) => ({
          ...shelf,
          books: shelf.id === shelfId
            ? [result.entry, ...shelf.books.filter((entry) => entry.id !== result.entry.id)]
            : shelf.books.filter((entry) => entry.id !== result.entry.id),
        })),
      });
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
      {existingEntry && (
        <p className="shelf-book-status" role="status">
          On your <strong>{existingEntry.shelf.name}</strong> shelf
        </p>
      )}
      <div className="shelf-action-group">
        <button type="button" className="shelf-action" onClick={openDialog} disabled={authLoading}>
          {!user && guestLabel ? guestLabel : existingEntry ? "Manage shelf" : "+ Add to Shelf"}
        </button>
        {existingEntry?.shelf.status === "READ" && (
          <button type="button" className="secondary-action" onClick={openReview}>
            Edit review
          </button>
        )}
      </div>
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
                {existingEntry && (
                  <p className="form-message success" role="status">
                    Already in your collection on {existingEntry.shelf.name}. Choose a shelf to move it.
                  </p>
                )}
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
      {reviewOpen && existingEntry?.shelf.status === "READ" && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setReviewOpen(false);
        }}>
          <section className="shelf-modal" role="dialog" aria-modal="true" aria-labelledby="edit-book-review-title">
            <button type="button" className="modal-close" aria-label="Close" onClick={() => setReviewOpen(false)}>×</button>
            <p className="eyebrow">YOUR LIBRARY</p>
            <h2 id="edit-book-review-title">Edit your review</h2>
            <form className="stacked-form" onSubmit={saveReview}>
              <label>
                Personal rating
                <select value={reviewRating} onChange={(event) => setReviewRating(event.target.value)}>
                  <option value="">Not rated</option>
                  {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value} / 5</option>)}
                </select>
              </label>
              <label>
                Review / notes
                <textarea rows="5" maxLength="5000" value={reviewText} onChange={(event) => setReviewText(event.target.value)} placeholder="Your notes are private." />
              </label>
              {reviewError && <p className="form-message error" role="alert">{reviewError}</p>}
              <button className="primary-action" type="submit" disabled={reviewSaving}>
                {reviewSaving ? "Saving..." : "Save review"}
              </button>
            </form>
          </section>
        </div>
      )}
    </>
  );
}

export default AddToShelfButton;
