import { Link } from "react-router-dom";

const displayDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
};

function BookRow({ book, entry, shelves = [], actions, children, className = "" }) {
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
        {entry && (
          <dl className="book-row-log">
            <div>
              <dt>Personal rating</dt>
              <dd>
                {entry.personalRating ? (
                  <span className="book-row-rating" aria-label={`${entry.personalRating} out of 5 stars`}>
                    <span aria-hidden="true">{"★".repeat(entry.personalRating)}{"☆".repeat(5 - entry.personalRating)}</span>
                    <span>{entry.personalRating}/5</span>
                  </span>
                ) : "Not rated"}
              </dd>
            </div>
            <div>
              <dt>Shelf</dt>
              <dd>{shelves.length ? shelves.map((shelf) => shelf.name).join(", ") : entry.shelf?.name || "Unknown shelf"}</dd>
            </div>
            <div>
              <dt>Date added</dt>
              <dd>{displayDate(entry.dateAdded) || "Not available"}</dd>
            </div>
            {entry.completionDate && (
              <div>
                <dt>Completed</dt>
                <dd>{displayDate(entry.completionDate) || "Not available"}</dd>
              </div>
            )}
          </dl>
        )}
        {children}
      </div>
      {actions && <div className="book-row-actions">{actions}</div>}
    </article>
  );
}

export default BookRow;
