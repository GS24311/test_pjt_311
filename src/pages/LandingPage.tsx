import { signInWithPopup, signInWithRedirect } from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import { motion } from 'motion/react';
import { Sparkles, AlertCircle } from 'lucide-react';
import { useState } from 'react';

export default function LandingPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      // In standalone PWA mode, popups are often blocked. 
      // We check for standalone and try Popup first, then fall back or warn.
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
      
      try {
        await signInWithPopup(auth, googleProvider);
      } catch (popupErr: any) {
        console.error("Popup login failed:", popupErr);
        if (popupErr.code === 'auth/popup-blocked' || popupErr.code === 'auth/cancelled-popup-request') {
          setError("팝업이 차단되었습니다. 브라우저 설정에서 팝업을 허용해주시거나, 일반 브라우저에서 시도해주세요.");
          // Fallback to redirect if popup is blocked and we are in standalone
          if (isStandalone) {
             await signInWithRedirect(auth, googleProvider);
          }
        } else {
          setError(`로그인 오류: ${popupErr.message}`);
        }
      }
    } catch (err: any) {
      setError("로그인 중 예기치 못한 오류가 발생했습니다.");
      console.error(err);
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
          <h2 className="text-xl font-bold font-display underline decoration-primary/30 underline-offset-8">로그인 / 회원가입</h2>
          
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

          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full bg-[#f5f5f0] border border-[#e5e5d8] rounded-2xl py-4 flex items-center justify-center gap-3 font-bold text-sm hover:bg-gray-50 transition-all group disabled:opacity-50"
          >
            {loading ? (
              <span className="animate-pulse">연결 중...</span>
            ) : (
              <>
                <img src="https://www.google.com/favicon.ico" className="w-4 h-4 grayscale group-hover:grayscale-0 transition-all" alt="" />
                Google 계정으로 계속하기
              </>
            )}
          </button>

          <div className="relative py-2">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-[#e5e5d8]"></div></div>
            <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-4 text-gray-400 font-bold">안내</span></div>
          </div>

          <p className="text-[10px] text-gray-400 font-medium leading-relaxed">
            현재는 서비스 체험을 위해 구글 로그인만 제공하고 있습니다.
            위의 버튼을 눌러 바로 시작해보세요!
          </p>

          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full bg-primary text-white py-4 rounded-2xl font-bold shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
          >
            {loading ? "기다려주세요..." : "시작하기"}
          </button>
        </div>

        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
          AI 기반 심리 커뮤니케이션 앱
        </p>
      </motion.div>
    </div>
  );
}
