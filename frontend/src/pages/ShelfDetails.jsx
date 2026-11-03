import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { deleteShelf, getShelves, removeReading, updateReading, updateShelf } from "../services/readingService";
import BookRow from "../components/BookRow";

function ReadingEntryCard({ entry, shelves, onChanged }) {
  const isCurrentlyReading = entry.shelf?.status === "CURRENTLY_READING" || entry.status === "CURRENTLY_READING";
  const [currentPage, setCurrentPage] = useState(entry.currentPage ?? "");
  const [totalPages, setTotalPages] = useState(entry.totalPages ?? entry.book.pageCount ?? "");
  const [rating, setRating] = useState(entry.personalRating ?? "");
  const [notes, setNotes] = useState(entry.notes || "");
  const [targetShelf, setTargetShelf] = useState(entry.shelfId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await updateReading(entry.id, {
        shelfId: targetShelf,
        ...(isCurrentlyReading ? {
          currentPage: currentPage === "" ? null : Number(currentPage),
          totalPages: totalPages === "" ? null : Number(totalPages),
        } : {}),
        personalRating: rating === "" ? null : Number(rating),
        notes: notes || null,
      });
      await onChanged();
    } catch (requestError) {
      setError(requestError.message || "Unable to update this book.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    setError("");
    try {
      await removeReading(entry.id);
      await onChanged();
    } catch (requestError) {
      setError(requestError.message || "Unable to remove this book.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <BookRow
      className="managed-book"
      book={entry.book}
      entry={entry}
      shelves={shelves.filter((shelf) => shelf.books.some((shelfEntry) => shelfEntry.bookId === entry.bookId))}
    >
      {isCurrentlyReading && (
        <div className="reading-progress">
          {entry.totalPages ? (
            <>
              <div
                className="progress-track"
                role="progressbar"
                aria-label="Reading progress"
                aria-valuemin="0"
                aria-valuemax="100"
                aria-valuenow={entry.progressPercent || 0}
              >
                <span style={{ width: `${entry.progressPercent || 0}%` }} />
              </div>
              <p>{entry.currentPage || 0} / {entry.totalPages} pages · {entry.progressPercent || 0}%</p>
            </>
          ) : <p className="progress-copy">Add the total page count to see a progress percentage.</p>}
        </div>
      )}
      <form className="entry-edit-form" onSubmit={save}>
        {isCurrentlyReading && (
          <div className="entry-field-row">
            <label>Current page<input type="number" min="0" max={totalPages || 100000} value={currentPage} onChange={(event) => setCurrentPage(event.target.value)} /></label>
            <label>Total pages<input type="number" min="1" max="100000" value={totalPages} onChange={(event) => setTotalPages(event.target.value)} placeholder="Unknown" /></label>
          </div>
        )}
        <div className="entry-field-row">
          <label>Personal rating<select value={rating} onChange={(event) => setRating(event.target.value)}><option value="">Not rated</option>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value} / 5</option>)}</select></label>
          <label>Move to shelf<select value={targetShelf} onChange={(event) => setTargetShelf(event.target.value)}>{shelves.map((shelf) => <option key={shelf.id} value={shelf.id}>{shelf.name}</option>)}</select></label>
        </div>
        <label>Private notes<textarea rows="3" maxLength="5000" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Your notes are private." /></label>
        {error && <p className="form-message error" role="alert">{error}</p>}
        <div className="entry-actions">
          <button type="submit" className="primary-action" disabled={saving}>{saving ? "Saving..." : isCurrentlyReading ? "Update progress" : "Save updates"}</button>
          <button type="button" className="text-button danger-text" disabled={saving} onClick={remove}>Remove book</button>
        </div>
      </form>
    </BookRow>
  );
}

function ShelfDetails() {
  const { shelfId } = useParams();
  const navigate = useNavigate();
  const [shelves, setShelves] = useState([]);
  const [shelf, setShelf] = useState(null);
  const [error, setError] = useState("");
  const [loadFailure, setLoadFailure] = useState(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState("PRIVATE");
  const [savingShelf, setSavingShelf] = useState(false);
  const [loadedShelfId, setLoadedShelfId] = useState("");

  const applyShelves = useCallback((resultShelves) => {
    setShelves(resultShelves);
    const selected = resultShelves.find((item) => item.id === shelfId);
    setShelf(selected || null);
    if (selected) {
      setName(selected.name);
      setDescription(selected.description || "");
      setVisibility(selected.visibility);
    }
    setLoadedShelfId(shelfId);
  }, [shelfId]);

  const load = useCallback(async () => {
    const result = await getShelves();
    applyShelves(result.shelves);
  }, [applyShelves]);

  useEffect(() => {
    let active = true;
    getShelves()
      .then(({ shelves: resultShelves }) => {
        if (active) applyShelves(resultShelves);
      })
      .catch((requestError) => setLoadFailure({
        shelfId,
        message: requestError.message || "Unable to load this shelf.",
      }));
    return () => { active = false; };
  }, [applyShelves, shelfId]);

  const saveShelf = async (event) => {
    event.preventDefault();
    setSavingShelf(true);
    setError("");
    try {
      await updateShelf(shelfId, {
        ...(shelf.status ? {} : { name }),
        description: description || null,
        visibility,
      });
      await load();
    } catch (requestError) {
      setError(requestError.message || "Unable to save this shelf.");
    } finally {
      setSavingShelf(false);
    }
  };

  const removeShelf = async () => {
    setError("");
    try {
      await deleteShelf(shelfId);
      navigate("/shelves", { replace: true });
    } catch (requestError) {
      setError(requestError.message || "Unable to delete this shelf.");
    }
  };

  const loadError = loadFailure?.shelfId === shelfId ? loadFailure.message : "";
  if (loadedShelfId !== shelfId && !loadError) return <main className="app-page page-message">Opening your shelf...</main>;
  if (!shelf || shelf.id !== shelfId) return <main className="app-page"><p className="page-error">{loadError || "Shelf not found."}</p><Link to="/shelves">Back to shelves</Link></main>;

  return (
    <main className="app-page">
      <Link to="/shelves" className="back-link">← All shelves</Link>
      <header className="page-heading shelf-detail-heading">
        <div><p className="eyebrow">{shelf.visibility === "PUBLIC" ? "PUBLIC SHELF" : "PRIVATE SHELF"}</p><h1>{shelf.name}</h1><p>{shelf.books.length} {shelf.books.length === 1 ? "book" : "books"}</p></div>
      </header>
      {error && <p className="form-message error">{error}</p>}

      <section className="shelf-settings">
        <h2>Shelf settings</h2>
        <form className="shelf-settings-form" onSubmit={saveShelf}>
          <label>Shelf name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} disabled={Boolean(shelf.status)} required /></label>
          <label>Description<input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={300} /></label>
          <label>Visibility<select value={visibility} onChange={(event) => setVisibility(event.target.value)}><option value="PRIVATE">Private</option><option value="PUBLIC">Public on my profile</option></select></label>
          <button className="secondary-action" type="submit" disabled={savingShelf}>{savingShelf ? "Saving..." : "Save shelf settings"}</button>
        </form>
        {!shelf.status && <button className="text-button danger-text" type="button" onClick={removeShelf}>Delete custom shelf</button>}
      </section>

      <section className="dashboard-section">
        {shelf.books.length ? (
          <div className="managed-book-list">
            {shelf.books.map((entry) => <ReadingEntryCard key={entry.id} entry={entry} shelves={shelves} onChanged={load} />)}
          </div>
        ) : (
          <div className="empty-library">
            <p className="eyebrow">NOTHING HERE YET</p>
            <h2>Start filling this shelf with books.</h2>
            <p>Search the Open Library catalog and add a title directly to this shelf.</p>
            <Link className="primary-action link-button" to="/search?q=fiction">Discover books</Link>
          </div>
        )}
      </section>
    </main>
  );
}

export default ShelfDetails;
