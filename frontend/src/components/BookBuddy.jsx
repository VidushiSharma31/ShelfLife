import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import AddToShelfButton from "./AddToShelfButton";
import { useAuth } from "../context/useAuth";
import { chatWithBookBuddy } from "../services/recommendationService";
import bookBuddyImage from "../assets/book-buddy.avif";

const STARTER_PROMPTS = [
  "Recommend a fantasy book with clever twists.",
  "Find a mystery novel with a shocking ending.",
  "Suggest a short book for the weekend.",
  "Recommend something similar to a book I enjoyed.",
];

const assistantWelcome = {
  id: "welcome",
  role: "assistant",
  text: "Hi! I’m Book Buddy. Tell me what you’re in the mood to read, and I’ll look for real books in the Open Library catalog.",
};

const findLastIndex = (items, predicate) => {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index])) return index;
  }
  return -1;
};

function BookBuddy() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([assistantWelcome]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [retryMessage, setRetryMessage] = useState("");
  const inputRef = useRef(null);
  const transcriptRef = useRef(null);
  const sendingRef = useRef(false);
  const messageSequenceRef = useRef(0);
  const nextMessageId = () => {
    messageSequenceRef.current += 1;
    return `buddy-${messageSequenceRef.current}`;
  };

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (open && transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [messages, open, sending, error]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  const request = async (message, conversation, appendUser) => {
    if (sendingRef.current || !message.trim()) return;
    sendingRef.current = true;
    setSending(true);
    setError("");
    setRetryMessage("");

    const nextMessages = appendUser
      ? [...conversation, { id: nextMessageId(), role: "user", text: message }]
      : conversation;
    if (appendUser) setMessages(nextMessages);

    try {
      const currentUserIndex = findLastIndex(nextMessages, (item) => item.role === "user");
      const history = nextMessages
        .slice(0, currentUserIndex)
        .filter((item) => item.role === "user" || item.role === "assistant")
        .slice(-8)
        .map(({ role, text }) => ({ role, content: text }));
      const result = await chatWithBookBuddy({
        message: message.trim(),
        history,
        preferences: user ? undefined : { genres: [] },
      });
      setMessages((current) => [...current, {
        id: nextMessageId(),
        role: "assistant",
        text: result.message,
        recommendations: result.recommendations || [],
      }]);
    } catch (requestError) {
      setError(requestError.message || "Book Buddy couldn't respond. Please try again.");
      setRetryMessage(message);
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const send = async (event) => {
    event.preventDefault();
    const message = draft.trim();
    if (!message || sending) return;
    setDraft("");
    await request(message, messages, true);
  };

  const retry = () => {
    const currentUserIndex = findLastIndex(
      messages,
      (item) => item.role === "user" && item.text === retryMessage,
    );
    const conversation = currentUserIndex < 0 ? messages : messages.slice(0, currentUserIndex + 1);
    request(retryMessage, conversation, false);
  };

  return (
    <aside className="book-buddy" aria-label="ShelfLife Book Buddy">
      {open && (
        <section id="book-buddy-panel" className="book-buddy-panel" role="dialog" aria-modal="false" aria-labelledby="book-buddy-title">
          <header className="book-buddy-header">
            <div className="book-buddy-brand">
              <span className="book-buddy-mark" aria-hidden="true"><img
                  src={bookBuddyImage}
                  alt=""
                  className="book-buddy-icon"
                />
              </span>
              <div>
                <h2 id="book-buddy-title">Book Buddy</h2>
                <p>Real books, picked for your mood</p>
              </div>
            </div>
            <button type="button" className="book-buddy-close" aria-label="Close Book Buddy" onClick={() => setOpen(false)}>×</button>
          </header>

          <div className="book-buddy-transcript" ref={transcriptRef} aria-live="polite" aria-relevant="additions text">
            {messages.map((message) => (
              <article className={`book-buddy-message ${message.role}`} key={message.id}>
                <p>{message.text}</p>
                {!!message.recommendations?.length && (
                  <div className="book-buddy-recommendations">
                    {message.recommendations.map(({ book, reason }) => (
                      <article className="book-buddy-book" key={book.openLibraryId}>
                        <Link className="book-buddy-cover" to={`/books/${book.openLibraryId}`} onClick={() => setOpen(false)}>
                          {book.coverUrl ? <img src={book.coverUrl} alt="" loading="lazy" /> : <span aria-label="Cover unavailable">No cover</span>}
                        </Link>
                        <div className="book-buddy-book-info">
                          <h3><Link to={`/books/${book.openLibraryId}`} onClick={() => setOpen(false)}>{book.title}</Link></h3>
                          <p className="book-buddy-author">
                            {book.authors?.map((author) => author.name).filter(Boolean).join(", ") || "Unknown Author"}
                          </p>
                          <p className="book-buddy-reason">{reason}</p>
                          <div className="book-buddy-book-actions">
                            <Link className="secondary-action link-button" to={`/books/${book.openLibraryId}`} onClick={() => setOpen(false)}>View book</Link>
                            <AddToShelfButton book={book} guestLabel="Sign in to save" />
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </article>
            ))}

            {messages.length === 1 && !sending && (
              <div className="book-buddy-prompts" aria-label="Suggested prompts">
                {STARTER_PROMPTS.map((prompt) => (
                  <button type="button" key={prompt} onClick={() => request(prompt, messages, true)}>{prompt}</button>
                ))}
              </div>
            )}

            {sending && (
              <p className="book-buddy-typing" role="status">
                <span aria-hidden="true"><i /><i /><i /></span>
                Book Buddy is searching and thinking…
              </p>
            )}
            {error && (
              <div className="book-buddy-error" role="alert">
                <p>{error}</p>
                <button type="button" onClick={retry} disabled={sending}>Try again</button>
              </div>
            )}
          </div>

          <form className="book-buddy-composer" onSubmit={send}>
            {!user && <p className="book-buddy-guest-note">Sign in any time to personalize ideas with your favorite genres.</p>}
            <label className="visually-hidden" htmlFor="book-buddy-input">Message Book Buddy</label>
            <textarea
              id="book-buddy-input"
              ref={inputRef}
              rows="2"
              maxLength="1000"
              value={draft}
              placeholder="What would you like to read?"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              disabled={sending}
            />
            <div className="book-buddy-composer-footer">
              <span>Enter to send · Shift+Enter for a new line</span>
              <button type="submit" className="book-buddy-send" disabled={sending || !draft.trim()} aria-label="Send message">↑</button>
            </div>
          </form>
        </section>
      )}
      <button
        type="button"
        className="book-buddy-toggle"
        aria-label={open ? "Close Book Buddy" : "Open Book Buddy"}
        aria-expanded={open}
        aria-controls="book-buddy-panel"
        onClick={() => setOpen((isOpen) => !isOpen)}
      >
        <span aria-hidden="true">{open ? "×" : "📖"}</span>
        {!open && <span className="book-buddy-toggle-label">Book Buddy</span>}
      </button>
    </aside>
  );
}

export default BookBuddy;
