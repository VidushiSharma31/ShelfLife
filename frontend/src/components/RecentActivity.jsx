import BookRow from "./BookRow";

const formatDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
};

function RecentActivity({ entries = [] }) {
  return (
    <section className="dashboard-section">
      <div className="section-header"><h2>Recent activity</h2></div>
      {entries.length ? (
        <div className="book-row-list">
          {entries.map((entry) => {
            const date = formatDate(entry.updatedAt);
            return (
              <BookRow key={entry.id} book={entry.book}>
                <p className="entry-shelf-label">
                  {entry.shelf?.name || "Shelf"}{date ? ` · Updated ${date}` : ""}
                </p>
              </BookRow>
            );
          })}
        </div>
      ) : <p className="empty-panel">No recent activity yet. Add a book to one of your shelves to get started.</p>}
    </section>
  );
}

export default RecentActivity;
