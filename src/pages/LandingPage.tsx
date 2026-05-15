import { 
  signInWithPopup, 
  signInWithRedirect, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  updateProfile
} from 'firebase/auth';
import { auth, googleProvider, db } from '../lib/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { motion } from 'motion/react';
import { Sparkles, AlertCircle, User, Lock, Mail } from 'lucide-react';
import { useState } from 'react';

export default function LandingPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  
  // Custom auth states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
      try {
        await signInWithPopup(auth, googleProvider);
      } catch (popupErr: any) {
        console.error("Popup login failed:", popupErr);
        if (popupErr.code === 'auth/popup-blocked' || popupErr.code === 'auth/cancelled-popup-request') {
          if (isStandalone) {
             await signInWithRedirect(auth, googleProvider);
          } else {
            setError("팝업이 차단되었습니다. 일반 브라우저에서 시도하시거나 이메일 로그인을 이용해주세요.");
          }
        } else if (popupErr.code === 'auth/unauthorized-domain') {
          setError("구글 로그인 도메인이 승인되지 않았습니다. 이메일 로그인을 이용해주세요.");
        } else {
          setError(`로그인 오류: ${popupErr.message}`);
        }
      }
    } catch (err: any) {
      setError("로그인 중 예기치 못한 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleCustomAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    if (isSignUp && !displayName) {
      setError("이름을 입력해주세요.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (isSignUp) {
        // Create user
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Update profile
        await updateProfile(user, { displayName });

        // Create Firestore profile
        await setDoc(doc(db, 'users', user.uid), {
          name: displayName,
          email: email,
          createdAt: serverTimestamp(),
          settings: {
            theme: 'light',
            notifications: true
          }
        });
      } else {
        // Login
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      console.error("Auth error:", err);
      if (err.code === 'auth/email-already-in-use') {
        setError("이미 사용 중인 이메일입니다.");
      } else if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
        setError("이메일 또는 비밀번호가 일치하지 않습니다.");
      } else if (err.code === 'auth/weak-password') {
        setError("비밀번호는 6자리 이상이어야 합니다.");
      } else if (err.code === 'auth/operation-not-allowed') {
        setError("이메일 로그인이 활성화되지 않았습니다. 관리자에게 문의하세요.");
      } else {
        setError("인증 과정에서 오류가 발생했습니다.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-bg-base">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="w-full max-w-sm space-y-12"
      >
        {/* Starting Window Part */}
        <div className="space-y-6">
          <motion.div 
            initial={{ scale: 0.8, rotate: -10 }}
            animate={{ scale: 1, rotate: 0 }}
            className="flex justify-center"
          >
            <div className="w-32 h-32 bg-primary rounded-[40px] flex items-center justify-center text-white shadow-2xl relative">
              <Sparkles className="w-16 h-16" />
              <div className="absolute -top-2 -right-2 w-8 h-8 bg-white rounded-full border-4 border-primary" />
            </div>
          </motion.div>
          <h1 className="text-4xl font-display font-bold tracking-tight text-[#1a1a1a]">
            네 언어 해석기
          </h1>
        </div>

        {/* Log-in / Signup Window Part */}
        <div className="bg-white p-8 rounded-[48px] shadow-sm border border-[#e5e5d8] space-y-6">
          <h2 className="text-xl font-bold font-display underline decoration-primary/30 underline-offset-8">
            {isSignUp ? '회원가입' : '로그인'}
          </h2>
          
          {error && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 bg-red-50 rounded-2xl flex items-start gap-3 text-left"
            >
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-[11px] text-red-600 font-medium leading-relaxed">{error}</p>
            </motion.div>
          )}

          <form onSubmit={handleCustomAuth} className="space-y-3">
            {isSignUp && (
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input 
                  type="text" 
                  placeholder="이름" 
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full bg-[#f9f9f5] border border-[#e5e5d8] rounded-2xl pl-11 pr-4 py-3.5 text-sm focus:ring-2 focus:ring-primary outline-none transition-all" 
                  required
                />
              </div>
            )}
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input 
                type="email" 
                placeholder="이메일" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#f9f9f5] border border-[#e5e5d8] rounded-2xl pl-11 pr-4 py-3.5 text-sm focus:ring-2 focus:ring-primary outline-none transition-all" 
                required
              />
            </div>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input 
                type="password" 
                placeholder="비밀번호" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#f9f9f5] border border-[#e5e5d8] rounded-2xl pl-11 pr-4 py-3.5 text-sm focus:ring-2 focus:ring-primary outline-none transition-all" 
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-white py-4 rounded-2xl font-bold shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 mt-2"
            >
              {loading ? "기다려주세요..." : (isSignUp ? "가입하기" : "시작하기")}
            </button>
          </form>

          <div className="relative py-2">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-[#e5e5d8]"></div></div>
            <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-4 text-gray-400 font-bold">또는</span></div>
          </div>

          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full bg-[#f5f5f0] border border-[#e5e5d8] rounded-2xl py-4 flex items-center justify-center gap-3 font-bold text-sm hover:bg-gray-50 transition-all group disabled:opacity-50"
          >
            <img src="https://www.google.com/favicon.ico" className="w-4 h-4 grayscale group-hover:grayscale-0 transition-all" alt="" />
            Google 계정으로 계속하기
          </button>

          <button
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-xs font-bold text-gray-400 hover:text-primary transition-colors"
          >
            {isSignUp ? '이미 계정이 있으신가요? 로그인' : '처음이신가요? 회원가입'}
          </button>
        </div>

        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
          AI 기반 심리 커뮤니케이션 앱
        </p>
      </motion.div>
    </div>
  );
}
