import { Link } from "react-router-dom";
import AddToShelfButton from "./AddToShelfButton";

function BookCard({ book }) {
  const authors = book.authorNames?.length
    ? book.authorNames.join(", ")
    : book.authors?.length
      ? book.authors.map((author) => typeof author === "string" ? author : author.name).filter(Boolean).join(", ")
      : "Unknown Author";
  const detailsUrl = book.openLibraryId ? `/books/${book.openLibraryId}` : null;
  const cover = (
    <div className="book-cover">
      {book.coverUrl ? (
        <img src={book.coverUrl} alt="" loading="lazy" />
      ) : (
        <div className="no-cover">No Cover</div>
      )}
    </div>
  );

  return (
    <article className="book-card">
      {detailsUrl ? (
        <Link to={detailsUrl} className="book-cover-link" aria-label={`View ${book.title}`}>{cover}</Link>
      ) : cover}
      <div className="book-info">
        <h3>{detailsUrl ? <Link to={detailsUrl}>{book.title}</Link> : book.title}</h3>
        <p title={authors}>{authors}</p>
        {(book.firstPublishYear || book.publicationYear) && (
          <span>{book.firstPublishYear || book.publicationYear}</span>
        )}
      </div>
      <AddToShelfButton book={book} />
    </article>
  );
}

export default BookCard;