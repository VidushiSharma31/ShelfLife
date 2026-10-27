import { Link } from "react-router-dom";

function BookRow({ book, actions, children, className = "" }) {
  const authors = book.authorNames?.length
    ? book.authorNames.join(", ")
    : book.authors?.length
      ? book.authors.map((author) => typeof author === "string" ? author : author.name).filter(Boolean).join(", ")
      : "Unknown Author";
  const year = book.firstPublishYear || book.publicationYear;
  const description = typeof book.description === "string"
    ? book.description
    : Array.isArray(book.description)
      ? book.description.join(" ")
      : "";
  const detailsUrl = book.openLibraryId ? `/books/${book.openLibraryId}` : null;

  return (
    <article className={`book-row ${className}`.trim()}>
      {detailsUrl ? (
        <Link className="book-row-cover" to={detailsUrl} tabIndex={-1} aria-hidden="true">
          {book.coverUrl ? <img src={book.coverUrl} alt="" loading="lazy" /> : <span>No cover</span>}
        </Link>
      ) : (
        <div className="book-row-cover">
          {book.coverUrl ? <img src={book.coverUrl} alt="" loading="lazy" /> : <span>No cover</span>}
        </div>
      )}
      <div className="book-row-main">
        <h2>{detailsUrl ? <Link to={detailsUrl}>{book.title}</Link> : book.title}</h2>
        <p className="book-row-author">{authors}</p>
        {year && <p className="book-row-year">{year}</p>}
        {description && <p className="book-row-description">{description}</p>}
        {!!(book.subjects?.length || book.genres?.length) && (
          <div className="book-row-tags">
            {(book.subjects || book.genres).slice(0, 4).map((genre) => <span key={genre}>{genre}</span>)}
          </div>
        )}
        {children}
      </div>
      {actions && <div className="book-row-actions">{actions}</div>}
    </article>
  );
}

export default BookRow;
