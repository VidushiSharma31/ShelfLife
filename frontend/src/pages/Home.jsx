import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import AddToShelfButton from "../components/AddToShelfButton";
import BookRow from "../components/BookRow";
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

  useEffect(() => {
    let active = true;
    searchBooks({ query: "fiction", sort: "trending", limit: 20 })
      .then((data) => { if (active) setBooks(data.books); })
      .catch((requestError) => {
        console.error("Could not load Discover books:", requestError);
        if (active) setError("Unable to load books right now.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!user || authLoading || favoriteGenres.length === 0) {
      return undefined;
    }

    let active = true;
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
            error: "Your genre discoveries could not be loaded. Please try again later.",
          });
        }
      });
    return () => { active = false; };
  }, [authLoading, favoriteGenres, genreKey, user]);

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
            <p className="search-message error" role="status">{recommendationError}</p>
          ) : !recommendations.length ? (
            <p className="search-message">Finding books by your favorite genres...</p>
          ) : recommendations.map(({ genre, books: genreBooks }) => (
            <section className="genre-discovery" key={genre}>
              <div className="section-header"><h3>{genre}</h3></div>
              {genreBooks.length ? (
                <div className="book-row-list">
                  {genreBooks.map((book) => (
                    <BookRow
                      key={book.openLibraryId}
                      book={book}
                      actions={<AddToShelfButton book={book} />}
                    />
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
          <div className="search-message error" role="alert">{error}</div>
        ) : (
          <div className="book-row-list">
            {books.map((book) => (
              <BookRow key={book.openLibraryId} book={book} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

export default Home;
