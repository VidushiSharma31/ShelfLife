import { Link } from "react-router-dom";

function Friends() {
  return (
    <main className="app-page narrow-page">
      <p className="eyebrow">READING TOGETHER</p>
      <h1 className="standalone-title">Friends</h1>
      <section className="empty-library">
        <h2>Friend connections are coming later.</h2>
        <p>For now, you can share your public profile and shelves with other readers.</p>
        <Link className="primary-action link-button" to="/profile">View your profile</Link>
      </section>
    </main>
  );
}

export default Friends;
