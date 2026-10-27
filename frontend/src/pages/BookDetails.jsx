import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

import { getBookById } from "../services/bookService";
import AddToShelfButton from "../components/AddToShelfButton";

function BookDetails() {
  const { openLibraryId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [book, setBook] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchBook = async () => {
      try {
        setLoading(true);
        setError("");

        const data = await getBookById(openLibraryId);

        setBook(data);
      } catch (error) {
        console.error(error);
        setError("Unable to load this book.");
      } finally {
        setLoading(false);
      }
    };

    fetchBook();
  }, [openLibraryId]);

  useEffect(() => {
    if (location.state?.openAddToShelf && book) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [book, location.pathname, location.state, navigate]);

  if (loading) {
    return (
      <main className="details-page">
        <div className="details-message">
          Opening the book...
        </div>
      </main>
    );
  }

  if (error || !book) {
    return (
      <main className="details-page">
        <div className="details-message error">
          {error || "Book not found."}
        </div>
      </main>
    );
  }

  return (
    <main className="details-page">

      <Link to="/" className="back-link">
        ← Back to books
      </Link>

      <section className="book-details">

        {/* COVER */}
        <div className="details-cover">
          {book.coverUrl ? (
            <img
              src={book.coverUrl}
              alt={book.title}
            />
          ) : (
            <div className="details-no-cover">
              No Cover Available
            </div>
          )}
        </div>


        {/* CONTENT */}
        <div className="details-content">

          <p className="details-label">
            BOOK DETAILS
          </p>

          <h1>{book.title}</h1>


          {/* AUTHORS */}
          {book.authors?.length > 0 && (
            <div className="details-authors">
              {book.authors.map((author, index) => (
                <span key={index}>
                  {author.name || "Unknown Author"}
                  {index < book.authors.length - 1 && ", "}
                </span>
              ))}
            </div>
          )}


          <div className="details-divider" />


          {/* ACTIONS */}
          <div className="book-actions">
            <AddToShelfButton book={book} initiallyOpen={Boolean(location.state?.openAddToShelf)} />
          </div>


          {/* METADATA */}
          <div className="book-meta">

            {book.firstPublishYear && (
              <div className="meta-item">
                <span>
                  First published
                </span>

                <strong>
                  {book.firstPublishYear}
                </strong>
              </div>
            )}

          </div>


          {/* SUBJECTS */}
          {book.subjects?.length > 0 && (
            <div className="subjects">

              <h2>
                Genres & Subjects
              </h2>

              <div className="subject-list">

                {book.subjects
                  .slice(0, 15)
                  .map((subject) => (
                    <span key={subject}>
                      {subject}
                    </span>
                  ))}

              </div>

            </div>
          )}


          {/* DESCRIPTION */}
          {book.description && (
            <div className="description">

              <h2>
                About the book
              </h2>

              <p>
                {book.description}
              </p>

            </div>
          )}

        </div>

      </section>

    </main>
  );
}

export default BookDetails;