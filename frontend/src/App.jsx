import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";

import Navbar from "./components/Navbar";
import { AuthProvider } from "./context/AuthContext";
import { useAuth } from "./context/useAuth";
import Home from "./pages/Home";
import Search from "./pages/Search";
import BookDetails from "./pages/BookDetails";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Shelves from "./pages/Shelves";
import ShelfDetails from "./pages/ShelfDetails";
import Profile from "./pages/Profile";
import PublicProfile from "./pages/PublicProfile";
import Friends from "./pages/Friends";
import FavoriteGenres from "./pages/FavoriteGenres";
import BookBuddy from "./components/BookBuddy";

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <main className="page-message">Restoring your session...</main>;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return children;
}

function GuestOnly({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <main className="page-message">Restoring your session...</main>;
  if (user) {
    const pendingBook = location.state?.pendingBook;
    if (pendingBook?.openLibraryId) {
      return <Navigate to={`/books/${pendingBook.openLibraryId}`} replace state={{ openAddToShelf: true }} />;
    }
    const from = location.state?.from;
    if (from) return <Navigate to={`${from.pathname}${from.search || ""}`} replace />;
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}

function AppRoutes() {
  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/search" element={<Search />} />
        <Route path="/books/:openLibraryId" element={<BookDetails />} />
        <Route path="/login" element={<GuestOnly><Auth /></GuestOnly>} />
        <Route path="/register" element={<GuestOnly><Auth /></GuestOnly>} />
        <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
        <Route path="/shelves" element={<RequireAuth><Shelves /></RequireAuth>} />
        <Route path="/shelves/:shelfId" element={<RequireAuth><ShelfDetails /></RequireAuth>} />
        <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />
        <Route path="/profile/edit" element={<RequireAuth><Profile edit /></RequireAuth>} />
        <Route path="/profile/genres" element={<RequireAuth><FavoriteGenres /></RequireAuth>} />
        <Route path="/users/:userId" element={<PublicProfile />} />
        <Route path="/friends" element={<RequireAuth><Friends /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <BookBuddy />
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;