import { useEffect, useState } from 'react';
import { doc, getDoc, updateDoc, collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { UserProfile, Message } from '../types';
import { getTraitAnalysis } from '../lib/gemini';
import { motion } from 'motion/react';
import { 
  Brain, 
  Target, 
  AlertCircle, 
  RefreshCw, 
  CheckCircle2,
  Sparkles,
  Heart,
  Quote,
  User as UserIcon,
  ShieldCheck
} from 'lucide-react';

export default function ProfilePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [calculationLog, setCalculationLog] = useState<string[]>([]);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!auth.currentUser) return;
      const docRef = doc(db, 'users', auth.currentUser.uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setProfile({ uid: docSnap.id, ...docSnap.data() } as UserProfile);
      }
      setLoading(false);
    };
    fetchProfile();
  }, []);

  const updateTraitAnalysis = async () => {
    if (!auth.currentUser || !profile) return;
    setAnalyzing(true);
    setCalculationLog(["[ENGINE] 분석 엔진 가동...", "[DB] 기저 대화 데이터 로드 중..."]);

    try {
      // Get recent messages for analysis
      const conversationsSnap = await getDocs(
        query(collection(db, 'users', auth.currentUser.uid, 'conversations'), orderBy('lastMessageAt', 'desc'), limit(5))
      );
      
      setCalculationLog(prev => [...prev, `[PROC] ${conversationsSnap.size}개의 활성 세션 감지.`]);
      
      let recentMessages: { role: string, content: string }[] = [];
      for (const convDoc of conversationsSnap.docs) {
        const msgsSnap = await getDocs(
          query(collection(db, 'users', auth.currentUser.uid, 'conversations', convDoc.id, 'messages'), orderBy('createdAt', 'desc'), limit(15))
        );
        recentMessages = [...recentMessages, ...msgsSnap.docs.map(d => ({ role: d.data().role, content: d.data().content }))];
      }

      setCalculationLog(prev => [...prev, `[MATH] 총 ${recentMessages.length}개의 발화 샘플링 완료.`]);

      if (recentMessages.length < 5) {
        alert("데이터가 아직 부족합니다. 최소 5개 이상의 대화 데이터가 필요합니다.");
        setAnalyzing(false);
        return;
      }

      setCalculationLog(prev => [...prev, "[AI] 언어 패턴 및 애착 유형 다차원 분석 중..."]);
      const analysis = await getTraitAnalysis(recentMessages);
      
      setCalculationLog(prev => [...prev, "[SYSTEM] 성향 가중치 테이블 업데이트 시작."]);
      
      const userRef = doc(db, 'users', auth.currentUser.uid);
      const updateData = {
        'traitProfile.attachmentStyle': analysis.attachmentStyle,
        'traitProfile.communicationStyle': analysis.communicationStyle,
        'traitProfile.triggers': analysis.triggers,
        'traitProfile.advice': analysis.advice,
        'traitProfile.lastUpdatedAt': new Date().toISOString()
      };
      
      await updateDoc(userRef, updateData);
      
      setCalculationLog(prev => [...prev, "[SYSTEM] 성향 프로필 동기화 완료."]);

      setTimeout(() => {
        setProfile(prev => prev ? {
          ...prev,
          traitProfile: {
            ...prev.traitProfile,
            ...analysis,
            lastUpdatedAt: updateData['traitProfile.lastUpdatedAt']
          }
        } : null);
        setAnalyzing(false);
        alert('성향 프로필이 최신 데이터로 업데이트되었습니다!');
      }, 1000);

    } catch (err) {
      console.error(err);
      setAnalyzing(false);
    }
  };

  const toggleSetting = async (key: keyof NonNullable<UserProfile['settings']>) => {
    if (!auth.currentUser || !profile) return;
    
    // Default settings if they don't exist
    const currentSettings = profile.settings || {
      realTimeCoaching: true,
      shareAnonymousData: false
    };
    
    const newSettings = {
      ...currentSettings,
      [key]: !currentSettings[key]
    };

    try {
      const userRef = doc(db, 'users', auth.currentUser.uid);
      await updateDoc(userRef, {
        settings: newSettings
      });
      
      setProfile(prev => prev ? {
        ...prev,
        settings: newSettings
      } : null);
    } catch (err) {
      console.error('Failed to update settings:', err);
    }
  };

  if (loading) return null;

  const userSettings = profile?.settings || {
    realTimeCoaching: true,
    shareAnonymousData: false
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col items-center text-center space-y-4">
        <div className="w-24 h-24 bg-white rounded-[32px] border-2 border-primary flex items-center justify-center p-2 shadow-xl">
           <div className="w-full h-full bg-bg-base rounded-[24px] flex items-center justify-center">
              <UserIcon className="w-10 h-10 text-primary" />
           </div>
        </div>
        <div>
          <h1 className="text-3xl font-display font-bold">성향 프로필</h1>
          <div className="flex items-center justify-center gap-2 mt-1">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">{profile?.email}</p>
            {profile?.traitProfile?.lastUpdatedAt && (
              <>
                <div className="w-1 h-1 bg-gray-300 rounded-full" />
                <p className="text-[10px] font-bold text-primary/60 uppercase tracking-widest">
                  Updated {new Date(profile.traitProfile.lastUpdatedAt).toLocaleDateString()}
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      {analyzing ? (
        <div className="py-12 space-y-6">
           <div className="bg-gray-900 border border-white/10 rounded-[32px] p-8 font-mono text-[11px] text-green-400 overflow-hidden h-56 flex flex-col-reverse shadow-2xl relative">
              <div className="absolute top-4 right-6 flex items-center gap-2">
                 <RefreshCw className="w-3 h-3 animate-spin text-green-500" />
                 <span className="text-[9px] font-bold text-green-800 uppercase tracking-widest">Processing</span>
              </div>
              {calculationLog.slice().reverse().map((log, i) => (
                <motion.div 
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="mb-1.5"
                >
                  <span className="opacity-40">{">"}</span> {log}
                </motion.div>
              ))}
           </div>
           <p className="text-center text-xs text-gray-400 font-medium animate-pulse">
              AI가 최근 대화 패턴을 정밀하게 재구성하고 있습니다...
           </p>
        </div>
      ) : (
        <div className="space-y-4">
          <TraitCard 
            label="성향 1: 애착 유형" 
            value={profile?.traitProfile?.attachmentStyle || '분석 중...'} 
            icon={Heart}
            color="bg-primary text-white"
          />
          <TraitCard 
            label="성향 2: 소통 스타일" 
            value={profile?.traitProfile?.communicationStyle || '분석 중...'} 
            icon={Target}
            color="bg-white text-secondary border border-[#e5e5d8]"
          />
          
          {profile?.traitProfile?.advice && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-8 bg-accent rounded-[40px] border border-[#e5e5d8] border-dashed"
            >
              <div className="flex items-center gap-2 mb-4 text-primary">
                <Sparkles className="w-4 h-4" />
                <span className="text-[10px] font-bold uppercase tracking-widest">성장 추천 제안</span>
              </div>
              <p className="text-gray-700 leading-relaxed text-sm">
                "{profile.traitProfile.advice}"
              </p>
            </motion.div>
          )}

          {profile?.traitProfile?.triggers && profile.traitProfile.triggers.length > 0 && (
            <div className="pt-2">
               <div className="flex items-center gap-2 mb-3">
                 <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                 <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-400">나의 취약점 (Trigger Points)</h4>
               </div>
               <div className="flex flex-wrap gap-2">
                 {profile.traitProfile.triggers.map((t, i) => (
                   <span key={i} className="px-3 py-1.5 bg-red-50 text-red-500 rounded-full text-[11px] font-bold border border-red-100 italic">
                     #{t}
                   </span>
                 ))}
               </div>
            </div>
          )}
        </div>
      )}

      <div className="pt-4 space-y-4">
        <button
          onClick={updateTraitAnalysis}
          disabled={analyzing}
          className="w-full flex items-center justify-center gap-3 bg-white border border-[#e5e5d8] text-primary px-8 py-5 rounded-[32px] font-bold hover:bg-gray-50 transition-all shadow-sm disabled:opacity-50"
        >
          {analyzing ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
          <span className="uppercase text-xs tracking-widest">{analyzing ? '패턴 분석 중...' : '나의 성향 업데이트'}</span>
        </button>

        {/* App Info Menu Section */}
        <div className="bg-[#f5f5f0] rounded-[40px] p-8 space-y-6 border border-[#e5e5d8]">
           {/* Experience & Privacy Settings */}
           <div className="pt-8 space-y-6">
              <div className="flex items-center gap-3 text-secondary mb-2">
                <ShieldCheck className="w-4 h-4" />
                <span className="text-[10px] font-bold uppercase tracking-widest">경험 개선 및 프라이버시</span>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h5 className="text-sm font-bold">실공간 실시간 코칭</h5>
                    <p className="text-[10px] text-gray-400 font-medium">대화 중 실시간으로 AI 팁을 노출합니다.</p>
                  </div>
                  <div 
                    onClick={() => toggleSetting('realTimeCoaching')}
                    className={`w-12 h-6 rounded-full relative p-1 cursor-pointer transition-colors ${userSettings.realTimeCoaching ? 'bg-secondary' : 'bg-gray-200'}`}
                  >
                    <motion.div 
                      animate={{ x: userSettings.realTimeCoaching ? 24 : 0 }}
                      className="w-4 h-4 bg-white rounded-full" 
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <h5 className="text-sm font-bold">인사이트 익명 데이터 공유</h5>
                    <p className="text-[10px] text-gray-400 font-medium">사용자 통계 데이터 품질 개선에 참여합니다.</p>
                  </div>
                  <div 
                    onClick={() => toggleSetting('shareAnonymousData')}
                    className={`w-12 h-6 rounded-full relative p-1 cursor-pointer transition-colors ${userSettings.shareAnonymousData ? 'bg-secondary' : 'bg-gray-200'}`}
                  >
                    <motion.div 
                      animate={{ x: userSettings.shareAnonymousData ? 24 : 0 }}
                      className="w-4 h-4 bg-white rounded-full" 
                    />
                  </div>
                </div>
              </div>
           </div>

           <div className="flex items-center gap-3 text-gray-400 mb-2 pt-6">
             <AlertCircle className="w-4 h-4" />
             <span className="text-[10px] font-bold uppercase tracking-widest">계정 및 앱 정보</span>
           </div>
           
           <div className="space-y-4">
              <div className="flex justify-between items-center py-2 border-b border-gray-200">
                 <span className="text-xs font-bold text-gray-500">사용자 이름</span>
                 <span className="text-xs font-bold text-primary">{auth.currentUser?.displayName || '익명'}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-200">
                 <span className="text-xs font-bold text-gray-500">이메일</span>
                 <span className="text-xs font-bold text-primary">{auth.currentUser?.email}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-200">
                 <span className="text-xs font-bold text-gray-500">상태</span>
                 <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3 h-3 text-green-500" />
                    <span className="text-[10px] font-bold text-green-600 uppercase">인증됨</span>
                 </div>
              </div>
              <div className="flex justify-between items-center py-2">
                 <span className="text-xs font-bold text-gray-500">앱 버전</span>
                 <span className="text-[10px] font-bold text-gray-400">v1.0.5 (Beta)</span>
              </div>
           </div>

           <div className="pt-4 text-center">
              <p className="text-[9px] text-gray-400 font-medium leading-relaxed">
                네 언어 해석기는 AI를 통해 건강한 대화를 돕는 심리 분석 도구입니다.<br/>
                © 2026 AI Dialogue Lab. All rights reserved.
              </p>
           </div>
        </div>
      </div>
    </div>
  );
}

function TraitCard({ label, value, icon: Icon, color }: any) {
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      whileInView={{ opacity: 1, scale: 1 }}
      className={`p-6 rounded-[32px] flex items-center gap-6 shadow-sm ${color}`}
    >
      <div className={`p-4 rounded-2xl ${color.includes('bg-primary') ? 'bg-white/10' : 'bg-accent'}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div className="flex-1">
        <h4 className={`text-[10px] font-bold uppercase tracking-widest opacity-60 mb-1`}>{label}</h4>
        <p className="font-bold text-lg leading-tight">{value}</p>
      </div>
    </motion.div>
  );
}
