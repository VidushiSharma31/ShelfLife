import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import BookCard from "../components/BookCard";
import { getPublicProfile } from "../services/profileService";

function PublicProfile() {
  const { userId } = useParams();
  const [result, setResult] = useState(null);
  const [requestFailure, setRequestFailure] = useState(null);

  useEffect(() => {
    getPublicProfile(userId)
      .then((data) => setResult({ userId, data }))
      .catch((requestError) => setRequestFailure({
        userId,
        message: requestError.message || "Unable to load this profile.",
      }));
  }, [userId]);

  const data = result?.userId === userId ? result.data : null;
  const error = requestFailure?.userId === userId ? requestFailure.message : "";
  if (error) return <main className="app-page"><p className="page-error">{error}</p><Link to="/">Discover books</Link></main>;
  if (!data) return <main className="app-page page-message">Loading reader profile...</main>;

  return (
    <main className="app-page">
      <section className="profile-hero">
        <div className="profile-avatar">
          {data.profile.profilePictureUrl
            ? <img src={data.profile.profilePictureUrl} alt="" />
            : data.profile.displayName.slice(0, 1).toUpperCase()}
        </div>
        <div className="profile-intro"><p className="eyebrow">SHELFLIFE READER</p><h1>{data.profile.displayName}</h1><p>{data.profile.bio || "A reader on ShelfLife."}</p></div>
      </section>
      <section className="stats-grid profile-stats">
        <article className="stat-card"><span>Books read</span><strong>{data.stats.read}</strong></article>
        <article className="stat-card"><span>Currently reading</span><strong>{data.stats.currentlyReading}</strong></article>
        <article className="stat-card"><span>Want to read</span><strong>{data.stats.wantToRead}</strong></article>
      </section>
      {data.shelves.length ? data.shelves.map((shelf) => (
        <section className="dashboard-section" key={shelf.id}>
          <div className="section-header"><h2>{shelf.name}</h2><span>{shelf.books.length} books</span></div>
          {shelf.books.length ? (
            <div className="book-grid">
              {shelf.books.map((entry) => (
                <div className="book-tile" key={entry.book.id}>
                  <BookCard book={{
                    openLibraryId: entry.book.openLibraryId,
                    title: entry.book.title,
                    authors: entry.book.authorNames.map((name) => ({ name })),
                    coverUrl: entry.book.coverUrl,
                    firstPublishYear: entry.book.publicationYear,
                  }} />
                </div>
              ))}
            </div>
          ) : <p className="empty-panel">This public shelf is empty.</p>}
        </section>
      )) : <section className="empty-library"><h2>No public shelves yet.</h2><p>This reader hasn't shared any shelves.</p></section>}
    </main>
  );
}

export default PublicProfile;
