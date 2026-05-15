import { 
  signInWithPopup, 
  signInWithRedirect
} from 'firebase/auth';
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
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
      
      try {
        await signInWithPopup(auth, googleProvider);
      } catch (popupErr: any) {
        console.error("Login error:", popupErr);
        if (popupErr.code === 'auth/unauthorized-domain') {
          setError("도메인이 승인되지 않았습니다. Firebase 콘솔에서 현재 사이트 주소를 '승인된 도메인'에 추가해주세요.");
        } else if (popupErr.code === 'auth/popup-blocked' && isStandalone) {
          await signInWithRedirect(auth, googleProvider);
        } else {
          setError("로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
        }
      }
    } catch (err: any) {
      setError("로그인 중 예기치 못한 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-[#fcfcf9]">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm space-y-12"
      >
        <div className="space-y-6">
          <div className="flex justify-center">
            <div className="w-24 h-24 bg-primary rounded-[32px] flex items-center justify-center text-white shadow-2xl relative">
              <Sparkles className="w-12 h-12" />
            </div>
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-display font-bold tracking-tight text-gray-900">
              네 언어 해석기
            </h1>
            <p className="text-gray-400 text-sm font-medium">
              더 나은 대화를 위한 AI 코칭
            </p>
          </div>
        </div>

        <div className="bg-white p-8 rounded-[40px] shadow-sm border border-[#e5e5d8] space-y-6">
          <h2 className="text-lg font-bold text-gray-900">시작하기</h2>
          
          {error && (
            <div className="p-4 bg-red-50 rounded-2xl flex items-start gap-3 text-left">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-[11px] text-red-600 font-medium leading-relaxed">{error}</p>
            </div>
          )}

          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full bg-primary text-white py-4 rounded-2xl font-bold shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-3"
          >
            {loading ? "연결 중..." : (
              <>
                <img src="https://www.google.com/favicon.ico" className="w-4 h-4 brightness-0 invert" alt="" />
                Google 계정으로 시작
              </>
            )}
          </button>

          <p className="text-[10px] text-gray-400 font-medium leading-relaxed px-4">
            구글 계정으로 간편하게 가입하고<br/>
            나의 대화 성향을 분석해보세요.
          </p>
        </div>

        <div className="flex justify-center gap-8 opacity-40">
            <div className="w-1 h-1 bg-gray-400 rounded-full" />
            <div className="w-1 h-1 bg-gray-400 rounded-full" />
            <div className="w-1 h-1 bg-gray-400 rounded-full" />
        </div>

        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
          AI 기반 심리 커뮤니케이션 앱
        </p>
      </motion.div>
    </div>
  );
}
