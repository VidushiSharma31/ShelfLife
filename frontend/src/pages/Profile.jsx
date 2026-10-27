import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../context/useAuth";
import { getDashboard, getShelves } from "../services/readingService";
import { updateProfile } from "../services/profileService";

function Profile({ edit = false }) {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [shelves, setShelves] = useState([]);
  const [form, setForm] = useState({
    displayName: user.displayName,
    bio: user.bio || "",
    profilePictureUrl: user.profilePictureUrl || "",
  });
  const [loading, setLoading] = useState(!edit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (edit) return;
    Promise.all([getDashboard(), getShelves()])
      .then(([dashboard, shelfData]) => {
        setStats(dashboard.stats);
        setShelves(shelfData.shelves);
      })
      .catch((requestError) => setError(requestError.message || "Unable to load your profile."))
      .finally(() => setLoading(false));
  }, [edit]);

  const handleChange = (event) => {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const { user: updatedUser } = await updateProfile({
        ...form,
        bio: form.bio || null,
        profilePictureUrl: form.profilePictureUrl || null,
      });
      updateUser(updatedUser);
      navigate("/profile", { replace: true });
    } catch (requestError) {
      setError(requestError.message || "Unable to save your profile.");
    } finally {
      setSaving(false);
    }
  };

  if (edit) {
    return (
      <main className="app-page narrow-page">
        <Link to="/profile" className="back-link">← My profile</Link>
        <header className="page-heading"><div><p className="eyebrow">YOUR ACCOUNT</p><h1>Edit profile</h1><p>Your details are saved to your ShelfLife account.</p></div></header>
        <form className="profile-form" onSubmit={save}>
          <label>Display name<input name="displayName" value={form.displayName} onChange={handleChange} minLength={2} maxLength={60} required /></label>
          <label>Biography<textarea name="bio" value={form.bio} onChange={handleChange} rows="5" maxLength={500} placeholder="What do you love to read?" /></label>
          <label>Profile picture URL<input name="profilePictureUrl" value={form.profilePictureUrl} onChange={handleChange} type="url" placeholder="https://example.com/photo.jpg" /></label>
          {error && <p className="form-message error">{error}</p>}
          <div className="entry-actions"><button type="submit" className="primary-action" disabled={saving}>{saving ? "Saving..." : "Save profile"}</button><Link className="secondary-action link-button" to="/profile">Cancel</Link></div>
        </form>
      </main>
    );
  }

  if (loading) return <main className="app-page page-message">Loading your profile...</main>;
  if (error) return <main className="app-page"><p className="page-error">{error}</p></main>;
  const publicShelves = shelves.filter((shelf) => shelf.visibility === "PUBLIC");

  return (
    <main className="app-page">
      <section className="profile-hero">
        <div className="profile-avatar">
          {user.profilePictureUrl ? <img src={user.profilePictureUrl} alt="" /> : user.displayName.slice(0, 1).toUpperCase()}
        </div>
        <div className="profile-intro">
          <p className="eyebrow">MY PROFILE</p><h1>{user.displayName}</h1>
          <p>{user.bio || "A reader building a library, one book at a time."}</p>
        </div>
        <Link className="secondary-action link-button" to="/profile/edit">Edit profile</Link>
      </section>
      <section className="stats-grid profile-stats">
        <article className="stat-card"><span>Books read</span><strong>{stats?.read ?? 0}</strong></article>
        <article className="stat-card"><span>Currently reading</span><strong>{stats?.currentlyReading ?? 0}</strong></article>
        <article className="stat-card"><span>Want to read</span><strong>{stats?.wantToRead ?? 0}</strong></article>
      </section>
      <section className="dashboard-section">
        <div className="section-header"><h2>Public shelves</h2><Link to="/shelves">Manage visibility</Link></div>
        {publicShelves.length ? (
          <div className="shelf-list-grid">
            {publicShelves.map((shelf) => (
              <Link className="shelf-list-card" key={shelf.id} to={`/shelves/${shelf.id}`}>
                <div className="shelf-card-top"><span>Public</span><span>{shelf.books.length} books</span></div>
                <h2>{shelf.name}</h2>
                <p>{shelf.description || "Shared on your profile"}</p>
              </Link>
            ))}
          </div>
        ) : (
          <div className="empty-panel"><p>You don't have any public shelves yet. Choose a shelf and set its visibility to Public to share it.</p><Link to="/shelves">Choose a shelf</Link></div>
        )}
      </section>
      <p className="public-profile-link">Public profile: <Link to={`/users/${user.id}`}>View what others see</Link></p>
    </main>
  );
}

export default Profile;
