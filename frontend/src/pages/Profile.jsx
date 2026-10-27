import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../context/useAuth";
import { getDashboard, getShelves } from "../services/readingService";
import { removeProfilePicture, updateProfile, uploadProfilePicture } from "../services/profileService";
import Avatar from "../components/Avatar";

function Profile({ edit = false }) {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [shelves, setShelves] = useState([]);
  const [form, setForm] = useState({
    displayName: user.displayName,
    bio: user.bio || "",
  });
  const [selectedImage, setSelectedImage] = useState(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [imageError, setImageError] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const previewUrlRef = useRef("");
  const [loading, setLoading] = useState(!edit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

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

  const handleImageChange = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    setImageError("");
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setImageError("Choose a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setImageError("Profile images must be 5 MB or smaller.");
      return;
    }
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = URL.createObjectURL(file);
    setPreviewUrl(previewUrlRef.current);
    setSelectedImage(file);
    setRemoveImage(false);
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    let updatedUser;
    try {
      ({ user: updatedUser } = await updateProfile({
        ...form,
        bio: form.bio || null,
      }));
      if (selectedImage) {
        ({ user: updatedUser } = await uploadProfilePicture(selectedImage));
      } else if (removeImage) {
        ({ user: updatedUser } = await removeProfilePicture());
      }
      updateUser(updatedUser);
      navigate("/profile", { replace: true });
    } catch (requestError) {
      if (updatedUser) updateUser(updatedUser);
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
          <fieldset className="avatar-upload">
            <legend>Profile photo</legend>
            <Avatar
              name={user.displayName}
              src={previewUrl || (removeImage ? "" : user.profilePictureUrl)}
              className="profile-avatar"
            />
            <label className="secondary-action link-button upload-trigger">
              Choose image
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleImageChange} />
            </label>
            {(user.profilePictureUrl || selectedImage) && (
              <button
                type="button"
                className="text-button danger-text"
                onClick={() => {
                  if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
                  previewUrlRef.current = "";
                  setPreviewUrl("");
                  setSelectedImage(null);
                  setRemoveImage(true);
                  setImageError("");
                }}
              >
                Remove photo
              </button>
            )}
            <p className="field-hint">JPEG, PNG, or WebP. Maximum size: 5 MB.</p>
            {imageError && <p className="form-message error" role="alert">{imageError}</p>}
          </fieldset>
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
        <Avatar name={user.displayName} src={user.profilePictureUrl} className="profile-avatar" />
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
