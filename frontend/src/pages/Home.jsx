import { useEffect, useState } from "react";

import BookCard from "../components/BookCard";
import { searchBooks } from "../services/bookService";

function Home() {
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchBooks = async () => {
      try {
        setLoading(true);

        const data = await searchBooks({
          query: "fiction",
          sort: "trending",
          limit: 20,
        });

        setBooks(data.books);
      } catch (error) {
        console.error(error);
        setError("Unable to load books.");
      } finally {
        setLoading(false);
      }
    };

    fetchBooks();
  }, []);

  if (loading) {
    return (
      <main className="home">
        <div className="search-message">
          Discovering books...
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="home">
        <div className="search-message error">
          {error}
        </div>
      </main>
    );
  }

  return (
    <main className="home">
      <section className="hero">
        <p className="eyebrow">WELCOME TO SHELFLIFE</p>

        <h1>
          Find your next
          <br />
          <em>great read.</em>
        </h1>

        <p className="hero-description">
          Discover books, keep track of what you're reading,
          and find your next favorite story.
        </p>
      </section>

      <section className="book-section">
        <div className="section-header">
          <h2>Trending Books</h2>
        </div>

        <div className="book-grid">
          {books.map((book) => (
            <BookCard
              key={book.openLibraryId}
              book={book}
            />
          ))}
        </div>
      </section>
    </main>
  );
}

export default Home;