import { Link } from "react-router-dom";

function BookCard({ book }) {
  return (
    <Link to={`/books/${book.openLibraryId}`} className="book-card">
      <div className="book-cover">
        {book.coverUrl ? (
          <img
            src={book.coverUrl}
            alt={book.title}
          />
        ) : (
          <div className="no-cover">
            No Cover
          </div>
        )}
      </div>

      <div className="book-info">
        <h3>{book.title}</h3>

        <p>
          {book.authors?.length
            ? book.authors[0].name
            : "Unknown Author"}
        </p>

        {book.firstPublishYear && (
          <span>{book.firstPublishYear}</span>
        )}
      </div>
    </Link>
  );
}

export default BookCard;