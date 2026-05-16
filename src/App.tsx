import React, { useEffect, useState, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useNavigate, useLocation } from 'react-router-dom';
import { onAuthStateChanged, User, signOut, getRedirectResult } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, testConnection } from './lib/firebase';
import { motion, AnimatePresence } from 'motion/react';
import { 
  MessageSquare, 
  Brain, 
  LogOut, 
  Sparkles,
  History,
  RefreshCw
} from 'lucide-react';

// Lazy load pages for better mobile performance
const Dashboard = lazy(() => import('./pages/Dashboard'));
const ChatPage = lazy(() => import('./pages/ChatPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const LandingPage = lazy(() => import('./pages/LandingPage'));
const ReplayPage = lazy(() => import('./pages/ReplayPage'));
const InsightsPage = lazy(() => import('./pages/InsightsPage'));

const PageLoader = () => (
  <div className="flex-1 flex flex-col items-center justify-center p-20 gap-4">
    <RefreshCw className="w-8 h-8 text-primary/40 animate-spin" />
    <p className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">페이지 준비 중...</p>
  </div>
);

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    testConnection();

    // Handle redirect result for PWA mode
    getRedirectResult(auth).catch(err => {
      console.error("Redirect auth error:", err);
    });

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      try {
        if (user) {
          // Ensure user exists in Firestore
          const userRef = doc(db, 'users', user.uid);
          const userSnap = await getDoc(userRef);
          if (!userSnap.exists()) {
            const defaultName = user.displayName || (user.isAnonymous ? '게스트' : '익명');
            await setDoc(userRef, {
              uid: user.uid,
              name: defaultName,
              email: user.email || null,
              traitProfile: {
                attachmentStyle: '기본형',
                communicationStyle: '분석 준비중...',
                triggers: [],
                notes: ''
              },
              createdAt: serverTimestamp()
            });
          }
          setUser(user);
        } else {
          setUser(null);
        }
      } catch (err) {
        console.error("Auth state handling error:", err);
        if (user) setUser(user);
      } finally {
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-bg-base">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        >
          <Sparkles className="w-12 h-12 text-primary" />
        </motion.div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <div className="min-h-[100dvh] bg-bg-base text-[#1a1a1a] font-sans selection:bg-primary selection:text-white flex flex-col">
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={user ? <Navigate to="/dashboard" /> : <LandingPage />} />
            <Route path="/dashboard" element={user ? <Layout user={user}><Dashboard /></Layout> : <Navigate to="/" />} />
            <Route path="/chat/:id" element={user ? <Layout user={user}><ChatPage /></Layout> : <Navigate to="/" />} />
            <Route path="/profile" element={user ? <Layout user={user}><ProfilePage /></Layout> : <Navigate to="/" />} />
            <Route path="/replay" element={user ? <Layout user={user}><ReplayPage /></Layout> : <Navigate to="/" />} />
            <Route path="/replay/:id" element={user ? <Layout user={user}><ReplayPage /></Layout> : <Navigate to="/" />} />
            <Route path="/insights" element={user ? <Layout user={user}><InsightsPage /></Layout> : <Navigate to="/" />} />
          </Routes>
        </Suspense>
      </div>
    </BrowserRouter>
  );
}

function Layout({ children, user }: { children: React.ReactNode, user: User }) {
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/');
  };

  return (
    <div className="flex flex-col h-full min-h-[100dvh] bg-[#fcfcf9] relative">
      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto pb-32 pt-4 px-4 md:px-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="max-w-md mx-auto w-full min-h-full flex flex-col will-change-transform"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Bottom Navigation (Mobile Style) */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-xl border-t border-[#e5e5d8] px-6 py-4 flex justify-between items-center z-50 max-w-md mx-auto rounded-t-[32px] shadow-2xl shadow-black/5">
        <NavLink to="/dashboard" icon={MessageSquare} label="홈" />
        <NavLink to="/insights" icon={History} label="인사이트" />
        <NavLink to="/profile" icon={Brain} label="성향" />
        <button 
          onClick={handleLogout}
          className="flex flex-col items-center gap-1 text-gray-400 hover:text-red-500 transition-colors"
        >
          <LogOut className="w-6 h-6" />
          <span className="text-[10px] font-bold uppercase truncate">로그아웃</span>
        </button>
      </nav>
    </div>
  );
}

function NavLink({ to, icon: Icon, label }: { to: string, icon: any, label: string }) {
  const isActive = window.location.pathname.startsWith(to);
  return (
    <Link to={to} className={`flex flex-col items-center gap-1 transition-all ${isActive ? 'text-primary scale-110' : 'text-gray-400 hover:text-primary'}`}>
      <div className={`p-1.5 rounded-xl ${isActive ? 'bg-primary/10' : ''}`}>
        <Icon className="w-6 h-6" />
      </div>
      <span className="text-[10px] font-bold uppercase tracking-tighter">{label}</span>
    </Link>
  );
}
