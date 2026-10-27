import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import BookRow from "../components/BookRow";
import AddToShelfButton from "../components/AddToShelfButton";
import { searchBooks } from "../services/bookService";


const SORT_OPTIONS = [
  {
    value: "relevance",
    label: "Relevance",
  },
  {
    value: "editions",
    label: "Most Editions",
  },
  {
    value: "firstPublished",
    label: "First Published",
  },
  {
    value: "mostRecent",
    label: "Most Recent",
  },
  {
    value: "topRated",
    label: "Top Rated",
  },
  {
    value: "readingLog",
    label: "Reading Log",
  },
  {
    value: "trending",
    label: "Trending",
  },
  {
    value: "random",
    label: "Random",
  },
];


function Search() {
  const [searchParams, setSearchParams] =
    useSearchParams();

  const query = searchParams.get("q") || "";

  const sort =
    searchParams.get("sort") || "relevance";


  const [books, setBooks] = useState([]);
  const [totalResults, setTotalResults] =
    useState(0);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");


  useEffect(() => {
    const fetchResults = async () => {
      if (!query.trim()) {
        setBooks([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError("");

        const data = await searchBooks({
          query,
          sort,
        });

        setBooks(data.books);
        setTotalResults(data.totalResults);
      } catch (error) {
        console.error(error);

        setError(
          "Something went wrong while searching."
        );
      } finally {
        setLoading(false);
      }
    };

    fetchResults();
  }, [query, sort]);


  const handleSortChange = (e) => {
    setSearchParams({
      q: query,
      sort: e.target.value,
    });
  };


  return (
    <main className="search-page">

      <section className="search-header">

        <p className="eyebrow">
          SHELF SEARCH
        </p>

        <h1>
          Results for{" "}
          <em>"{query}"</em>
        </h1>

        {!loading && (
          <p className="result-count">
            {totalResults.toLocaleString()}{" "}
            books found
          </p>
        )}

      </section>


      <div className="search-controls">

        <label htmlFor="sort">
          Sort by
        </label>

        <select
          id="sort"
          value={sort}
          onChange={handleSortChange}
        >
          {SORT_OPTIONS.map((option) => (
            <option
              key={option.value}
              value={option.value}
            >
              {option.label}
            </option>
          ))}
        </select>

      </div>


      {loading && (
        <div className="search-message">
          Searching the shelves...
        </div>
      )}


      {error && (
        <div className="search-message error">
          {error}
        </div>
      )}


      {!loading &&
        !error &&
        books.length === 0 && (

        <div className="empty-search">

          <h2>
            No books found
          </h2>

          <p>
            We couldn't find anything
            matching "{query}".
          </p>

        </div>
      )}


      {!loading &&
        !error &&
        books.length > 0 && (

        <section className="search-results">

          <div className="book-row-list">

            {books.map((book) => (
              <BookRow
                key={book.openLibraryId}
                book={book}
                actions={<AddToShelfButton book={book} />}
              />
            ))}

          </div>

        </section>
      )}

    </main>
  );
}

export default Search;