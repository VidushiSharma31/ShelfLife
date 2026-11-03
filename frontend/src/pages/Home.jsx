import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import BookCard from "../components/BookCard";
import { useAuth } from "../context/useAuth";
import { searchBooks } from "../services/bookService";

function Home() {
  const { user, loading: authLoading } = useAuth();
  const favoriteGenres = useMemo(
    () => (user?.favoriteGenres || []).slice(0, 3),
    [user?.favoriteGenres],
  );
  const genreKey = favoriteGenres.join("|");
  const [books, setBooks] = useState([]);
  const [recommendationState, setRecommendationState] = useState({ genreKey: "", groups: [], error: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [trendingRetry, setTrendingRetry] = useState(0);
  const [genreRetry, setGenreRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    searchBooks({ query: "fiction", sort: "trending", limit: 20 })
      .then((data) => { if (active) setBooks(data.books); })
      .catch((requestError) => {
        console.error("Could not load Discover books:", requestError);
        if (active) setError(requestError.message || "The book catalog is temporarily unavailable. Please try again.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [trendingRetry]);

  useEffect(() => {
    if (!user || authLoading || favoriteGenres.length === 0) {
      setRecommendationState({ genreKey, groups: [], error: "" });
      return undefined;
    }

    let active = true;
    setRecommendationState({ genreKey, groups: [], error: "" });
    Promise.all(favoriteGenres.map(async (genre) => {
      const result = await searchBooks({ query: genre, limit: 5, sort: "relevance" });
      return { genre, books: result.books };
    }))
      .then((groups) => { if (active) setRecommendationState({ genreKey, groups, error: "" }); })
      .catch((requestError) => {
        console.error("Could not load genre discoveries:", requestError);
        if (active) {
          setRecommendationState({
            genreKey,
            groups: [],
            error: requestError.message || "Your personalized discoveries are temporarily unavailable.",
          });
        }
      });
    return () => { active = false; };
  }, [authLoading, favoriteGenres, genreKey, genreRetry, user]);

  const recommendations = recommendationState.genreKey === genreKey ? recommendationState.groups : [];
  const recommendationError = recommendationState.genreKey === genreKey ? recommendationState.error : "";

  return (
    <main className="home">
      <section className="hero">
        <p className="eyebrow">WELCOME TO SHELFLIFE</p>
        <h1>Find your next<br /><em>great read.</em></h1>
        <p className="hero-description">
          Discover books, keep track of what you're reading, and find your next favorite story.
        </p>
      </section>

      {user && !authLoading && (
        <section className="book-section discover-personalized">
          <div className="section-header">
            <h2>Picked for your interests</h2>
            <Link to="/profile/genres">Edit genres</Link>
          </div>
          {!!favoriteGenres.length && (
            <p className="genre-discovery-note">
              Showing books for up to three of your favorite genres to keep discovery requests efficient.
            </p>
          )}
          {!favoriteGenres.length ? (
            <div className="empty-panel">
              <p>Choose your favorite genres to see relevant books here.</p>
              <Link to="/profile/genres">Choose favorite genres</Link>
            </div>
          ) : recommendationError ? (
            <div className="search-message error" role="alert">
              <p>{recommendationError}</p>
              <button type="button" className="secondary-action" onClick={() => setGenreRetry((attempt) => attempt + 1)}>
                Retry personalized discoveries
              </button>
            </div>
          ) : !recommendations.length ? (
            <p className="search-message">Finding books by your favorite genres...</p>
          ) : recommendations.map(({ genre, books: genreBooks }) => (
            <section className="genre-discovery" key={genre}>
              <div className="section-header"><h3>{genre}</h3></div>
              {genreBooks.length ? (
                <div className="book-grid">
                  {genreBooks.map((book) => (
                    <BookCard key={book.openLibraryId} book={book} />
                  ))}
                </div>
              ) : <p className="empty-panel">No titles found for {genre} right now.</p>}
            </section>
          ))}
        </section>
      )}

      <section className="book-section">
        <div className="section-header"><h2>Trending Books</h2></div>
        {loading ? (
          <div className="search-message">Discovering books...</div>
        ) : error ? (
          <div className="search-message error" role="alert">
            <p>{error}</p>
            <button type="button" className="secondary-action" onClick={() => setTrendingRetry((attempt) => attempt + 1)}>
              Retry
            </button>
          </div>
        ) : !books.length ? (
          <div className="empty-panel">
            <p>No books were found right now.</p>
            <button type="button" className="secondary-action" onClick={() => setTrendingRetry((attempt) => attempt + 1)}>
              Try again
            </button>
          </div>
        ) : (
          <div className="book-grid">
            {books.map((book) => (
              <BookCard key={book.openLibraryId} book={book} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

export default Home;
