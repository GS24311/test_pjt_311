import { useEffect, useState } from 'react';
import { doc, getDoc, updateDoc, collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { UserProfile } from '../types';
import { getTraitAnalysis } from '../lib/gemini';
import { motion } from 'motion/react';
import { 
  Radar, 
  RadarChart, 
  PolarGrid, 
  PolarAngleAxis, 
  ResponsiveContainer 
} from 'recharts';
import { 
  Brain, 
  Target, 
  AlertCircle, 
  RefreshCw, 
  CheckCircle2,
  Sparkles,
  Heart,
  User as UserIcon,
  ShieldCheck,
  Zap,
  Fingerprint,
  Info
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
      const now = new Date();
      
      const updateData = {
        'traitProfile.archetype': analysis.archetype,
        'traitProfile.attachmentStyle': analysis.attachmentStyle,
        'traitProfile.communicationStyle': analysis.communicationStyle,
        'traitProfile.triggers': analysis.triggers,
        'traitProfile.advice': analysis.advice,
        'traitProfile.scores': analysis.scores,
        'traitProfile.lastUpdatedAt': now.toISOString()
      };
      
      console.log("Saving trait profile update...");
      await updateDoc(userRef, updateData);
      
      setCalculationLog(prev => [...prev, "[SYSTEM] 성향 프로필 동기화 완료."]);

      setTimeout(() => {
        setProfile(prev => {
          if (!prev) return null;
          return {
            ...prev,
            traitProfile: {
              ...(prev.traitProfile || {}),
              ...analysis,
              lastUpdatedAt: now.toISOString()
            }
          };
        });
        setAnalyzing(false);
        alert('성향 프로필이 최신 데이터로 업데이트되었습니다!');
      }, 1000);

    } catch (err: any) {
      console.error("Profile update failed:", err);
      setCalculationLog(prev => [...prev, `[ERROR] 저장 실패: ${err.message}`]);
      alert('저장 중에 문제가 발생했습니다. 권한 설정을 확인하거나 나중에 다시 시도해주세요.');
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

  const chartData = profile?.traitProfile?.scores ? [
    { subject: '공감력', A: profile.traitProfile.scores.empathy, fullMark: 100 },
    { subject: '논리성', A: profile.traitProfile.scores.logic, fullMark: 100 },
    { subject: '유연성', A: profile.traitProfile.scores.flexibility, fullMark: 100 },
    { subject: '능동성', A: profile.traitProfile.scores.initiative, fullMark: 100 },
    { subject: '자기조절', A: profile.traitProfile.scores.control, fullMark: 100 },
  ] : [];

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col items-center text-center space-y-4">
        <div className="relative">
          <div className="w-24 h-24 bg-white rounded-[32px] border-2 border-primary flex items-center justify-center p-2 shadow-xl">
             <div className="w-full h-full bg-bg-base rounded-[24px] flex items-center justify-center">
                <UserIcon className="w-10 h-10 text-primary" />
             </div>
          </div>
          <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-secondary rounded-xl flex items-center justify-center shadow-lg border-2 border-white">
             <Fingerprint className="w-4 h-4 text-white" />
          </div>
        </div>
        <div>
          <h1 className="text-3xl font-display font-bold">성향 프로필</h1>
          <div className="flex items-center justify-center gap-2 mt-1">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">{profile?.email}</p>
          </div>
        </div>
      </div>

      {analyzing ? (
        <div className="py-8 space-y-6">
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
        </div>
      ) : (
        <div className="space-y-6">
          {/* Archetype Highlight */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-primary p-8 rounded-[40px] text-white text-center shadow-2xl relative overflow-hidden group"
          >
             <div className="absolute top-[-20%] right-[-10%] w-40 h-40 bg-white/10 rounded-full blur-3xl" />
             <div className="absolute bottom-[-20%] left-[-10%] w-40 h-40 bg-secondary/20 rounded-full blur-3xl opacity-50" />
             
             <div className="relative z-10 space-y-2">
                <div className="flex items-center justify-center gap-2 mb-2">
                   <Zap className="w-4 h-4 text-yellow-300" />
                   <span className="text-[10px] font-bold uppercase tracking-[0.3em] opacity-70">Communication Archetype</span>
                </div>
                <h2 className="text-4xl font-display font-black leading-none">
                  {profile?.traitProfile?.archetype || '관찰하는 탐구자'}
                </h2>
                <div className="pt-4 flex justify-center gap-4">
                   <div className="px-3 py-1 bg-white/10 rounded-full text-[10px] font-bold border border-white/10 backdrop-blur-sm">
                      #{profile?.traitProfile?.attachmentStyle || '분석 중'}
                   </div>
                </div>
             </div>
          </motion.div>

          {/* 5-Dimensional Scores */}
          <div className="bg-white p-8 rounded-[40px] border border-[#e5e5d8] shadow-sm">
             <div className="flex items-center justify-between mb-8">
                <div>
                   <h3 className="text-lg font-bold text-gray-800">대화 역량 분석</h3>
                   <p className="text-[10px] text-gray-400 font-medium font-mono uppercase">Multi-Dimensional Mapping</p>
                </div>
                <div className="w-10 h-10 bg-accent rounded-2xl flex items-center justify-center">
                   <Brain className="w-5 h-5 text-secondary" />
                </div>
             </div>
             
             {profile?.traitProfile?.scores ? (
               <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="80%" data={chartData}>
                      <PolarGrid stroke="#e5e5d8" />
                      <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fontWeight: 700, fill: '#666' }} />
                      <Radar
                        name="Competency"
                        dataKey="A"
                        stroke="#FF7D7D"
                        fill="#FF7D7D"
                        fillOpacity={0.4}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
               </div>
             ) : (
                <div className="h-64 flex items-center justify-center border-2 border-dashed border-accent rounded-[32px] text-gray-400 text-xs text-center font-medium px-12">
                   데이터가 충분하지 않습니다.<br/>최근 대화를 바탕으로 성향을 업데이트해 보세요.
                </div>
             )}
          </div>

          <div className="space-y-4">
            <TraitCard 
              label="소통 스타일 핵심" 
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
                <p className="text-gray-700 leading-relaxed text-sm bg-white/50 p-4 rounded-2xl border border-white shadow-sm">
                  "{profile.traitProfile.advice}"
                </p>
              </motion.div>
            )}

            {profile?.traitProfile?.triggers && profile.traitProfile.triggers.length > 0 && (
              <div className="p-8 bg-white border border-[#e5e5d8] rounded-[40px] shadow-sm">
                 <div className="flex items-center gap-2 mb-6">
                   <AlertCircle className="w-4 h-4 text-red-500" />
                   <h4 className="text-xs font-bold uppercase tracking-widest text-gray-800">심리적 트리거 (Trigger Points)</h4>
                 </div>
                 <div className="flex flex-wrap gap-2">
                   {profile.traitProfile.triggers.map((t, i) => (
                     <div key={i} className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-2xl text-[11px] font-bold border border-red-100 italic transition-hover hover:bg-red-100">
                       <Zap className="w-3 h-3" />
                       #{t}
                     </div>
                   ))}
                 </div>
                 <div className="mt-6 p-4 bg-gray-50 rounded-2xl flex gap-3 items-start">
                    <Info className="w-4 h-4 text-gray-300 shrink-0 mt-0.5" />
                    <p className="text-[10px] text-gray-500 leading-relaxed">트리거를 인지하는 것만으로도 대화 중 감정의 폭주를 12% 가량 억제할 수 있습니다.</p>
                 </div>
              </div>
            )}
          </div>
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
