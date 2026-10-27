import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import BookCard from "../components/BookCard";
import { useAuth } from "../context/useAuth";
import { getDashboard } from "../services/readingService";

function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getDashboard()
      .then(setData)
      .catch((requestError) => setError(requestError.message || "Unable to load your dashboard."));
  }, []);

  if (error) return <main className="app-page"><p className="page-error">{error}</p></main>;
  if (!data) return <main className="app-page page-message">Loading your reading life...</main>;

  const hasBooks = data.stats.read + data.stats.currentlyReading + data.stats.wantToRead > 0;
  return (
    <main className="app-page">
      <header className="page-heading dashboard-heading">
        <div>
          <p className="eyebrow">YOUR READING LIFE</p>
          <h1>Welcome back, <em>{user.displayName}</em></h1>
          <p>Every book you keep is a story worth remembering.</p>
        </div>
        <Link className="primary-action link-button" to="/search?q=fiction">Discover books</Link>
      </header>

      <section className="stats-grid" aria-label="Reading statistics">
        <article className="stat-card"><span>Books read</span><strong>{data.stats.read}</strong></article>
        <article className="stat-card"><span>Currently reading</span><strong>{data.stats.currentlyReading}</strong></article>
        <article className="stat-card"><span>Want to read</span><strong>{data.stats.wantToRead}</strong></article>
      </section>

      {!hasBooks && (
        <section className="empty-library">
          <p className="eyebrow">A FRESH PAGE</p>
          <h2>Your shelves are waiting for their first story.</h2>
          <p>Search Open Library, choose a shelf, and your books will show up here with progress and reading history.</p>
          <Link className="primary-action link-button" to="/search?q=fiction">Find your first book</Link>
        </section>
      )}

      {data.currentBooks.length > 0 && (
        <section className="dashboard-section">
          <div className="section-header"><h2>Currently reading</h2><Link to="/shelves">View shelves</Link></div>
          <div className="current-reading-list">
            {data.currentBooks.map((entry) => (
              <article className="reading-highlight" key={entry.id}>
                <Link to={`/books/${entry.book.openLibraryId}`} className="reading-cover">
                  {entry.book.coverUrl ? <img src={entry.book.coverUrl} alt="" /> : <span>No cover</span>}
                </Link>
                <div className="reading-highlight-info">
                  <h3>{entry.book.title}</h3>
                  <p>{entry.book.authorNames.join(", ") || "Unknown Author"}</p>
                  <p className="progress-copy">
                    {entry.totalPages ? `${entry.currentPage || 0} of ${entry.totalPages} pages` : "Progress tracked without a known page count"}
                  </p>
                  {entry.progressPercent !== null && (
                    <div className="progress-track" aria-label={`${entry.progressPercent}% complete`}>
                      <span style={{ width: `${entry.progressPercent}%` }} />
                    </div>
                  )}
                  <Link to={`/shelves/${entry.shelfId}`}>Update reading progress</Link>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="dashboard-section">
        <div className="section-header"><h2>Your shelves</h2><Link to="/shelves">Manage shelves</Link></div>
        <div className="shelf-summary-grid">
          {data.shelves.map((shelf) => (
            <Link className="shelf-summary-card" to={`/shelves/${shelf.id}`} key={shelf.id}>
              <span>{shelf.name}</span><strong>{shelf.count}</strong>
            </Link>
          ))}
          <Link className="shelf-summary-card create-shelf-card" to="/shelves">+ Create a shelf</Link>
        </div>
      </section>

      {data.recentlyUpdated.length > 0 && (
        <section className="dashboard-section">
          <div className="section-header"><h2>Recently updated</h2><Link to="/shelves">Open your library</Link></div>
          <div className="book-grid">
            {data.recentlyUpdated.map((entry) => (
              <div className="book-tile" key={entry.id}>
                <BookCard book={{
                  openLibraryId: entry.book.openLibraryId,
                  title: entry.book.title,
                  authors: entry.book.authorNames.map((name) => ({ name })),
                  coverUrl: entry.book.coverUrl,
                  firstPublishYear: entry.book.publicationYear,
                }} />
                <p className="entry-shelf-label">{entry.shelf.name}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="profile-shortcut">
        <div><h2>Make your profile yours</h2><p>Add a short bio and choose which shelves you'd like to share.</p></div>
        <Link className="secondary-action link-button" to="/profile/edit">Edit profile</Link>
      </section>
    </main>
  );
}

export default Dashboard;
