import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft, 
  Play, 
  ChevronRight, 
  ChevronLeft, 
  Sparkles, 
  Heart, 
  HelpCircle, 
  AlertTriangle,
  History,
  RotateCcw,
  Edit3,
  CheckCircle2,
  Lock,
  SkipForward
} from 'lucide-react';
import { analyzeMessage, simulateResponse } from '../lib/gemini';
import { auth, db } from '../lib/firebase';
import { collection, query, orderBy, getDocs, doc, getDoc } from 'firebase/firestore';

interface SimulationStep {
  role: 'user' | 'partner';
  content: string;
  senderName: string;
  analysis?: any;
  originalContent?: string;
  isModified?: boolean;
}

type Mode = 'INPUT' | 'PLAYING' | 'REWRITING';

export default function ReplayPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [mode, setMode] = useState<Mode>('INPUT');
  const [rawText, setRawText] = useState('');
  const [steps, setSteps] = useState<SimulationStep[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [editText, setEditText] = useState('');
  const [diverged, setDiverged] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(true);
  
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load conversation if ID is provided
  useEffect(() => {
    const loadConversation = async () => {
      if (!id || !auth.currentUser) return;
      
      try {
        setLoading(true);
        const conversationDoc = await getDoc(doc(db, 'users', auth.currentUser.uid, 'conversations', id));
        if (conversationDoc.exists()) {
          const messagesSnapshot = await getDocs(
            query(collection(db, 'users', auth.currentUser.uid, 'conversations', id, 'messages'), orderBy('order', 'asc'))
          );
          
          const conversationSteps = messagesSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
              role: data.role,
              content: data.content,
              senderName: data.senderName || (data.role === 'user' ? '나' : '상대방'),
              analysis: data.analysis,
              originalContent: data.content
            };
          });
          
          setSteps(conversationSteps as SimulationStep[]);
          setMode('PLAYING');
          if (conversationSteps.length > 0 && !conversationSteps[0].analysis) {
            analyzeStep(0, conversationSteps as SimulationStep[]);
          }
        }
      } catch (error) {
        console.error('Error loading conversation for replay:', error);
      } finally {
        setLoading(false);
      }
    };

    loadConversation();
  }, [id]);

  const parseAndStart = () => {
    if (!rawText.trim()) return;

    const lines = rawText.split('\n').filter(l => l.trim() !== '');
    const parsedSteps = lines.map((line, i) => {
      let role: 'user' | 'partner' = 'user';
      let content = line;
      let senderName = '나';

      const separator = line.includes(':') ? ':' : (line.includes('：') ? '：' : null);
      if (separator) {
        const parts = line.split(separator);
        senderName = parts[0].trim();
        content = parts.slice(1).join(separator).trim();
        
        const lowerName = senderName.toLowerCase();
        if (['나', 'me', '본인', '나님', 'a'].includes(lowerName)) {
          role = 'user';
          senderName = '나';
        } else {
          role = 'partner';
        }
      } else if (i % 2 !== 0) {
        role = 'partner';
        senderName = '상대방';
      }

      return { role, content: content || line, senderName, originalContent: content || line };
    });

    setSteps(parsedSteps as SimulationStep[]);
    setMode('PLAYING');
    setCurrentStep(0);
    analyzeStep(0, parsedSteps as SimulationStep[]);
  };

  const analyzeStep = async (index: number, currentSteps = steps) => {
    if (currentSteps[index].analysis) return;
    
    // Only set global loading if we don't even have the content yet (simulation case)
    // or if we want the "AI is thinking" effect for the very first time.
    // For original messages, we'll show the text first.
    const isNewSimulation = currentSteps[index].isModified || !currentSteps[index].originalContent;
    
    if (isNewSimulation) setLoading(true);

    try {
      const history = currentSteps.slice(0, index).map(s => ({ role: s.role, content: s.content }));
      const result = await analyzeMessage(currentSteps[index].content, currentSteps[index].role, null, history);
      const newSteps = [...currentSteps];
      newSteps[index].analysis = result;
      setSteps(newSteps);
    } catch (err) {
      console.error(err);
    } finally {
      if (isNewSimulation) setLoading(false);
    }
  };

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      const nextIdx = currentStep + 1;
      setCurrentStep(nextIdx);
      // Trigger analysis in background, don't block if content exists
      analyzeStep(nextIdx);
    }
  };

  const startRewrite = () => {
    setEditText(steps[currentStep].content);
    setMode('REWRITING');
  };

  const applyRewrite = async () => {
    if (!editText.trim() || editText === steps[currentStep].content) {
      setMode('PLAYING');
      return;
    }

    setLoading(true);
    try {
      // 1. Analyze the new message
      const analysis = await analyzeMessage(editText, 'user');
      
      // 2. Simulate partner's response based on history
      const history = steps.slice(0, currentStep).map(s => ({ role: s.role, content: s.content }));
      const simulation = await simulateResponse(history as any, editText);

      // 3. Update current step and remove all future steps (divergence)
      const newSteps = steps.slice(0, currentStep);
      newSteps.push({
        role: 'user',
        senderName: '나 (수정됨)',
        content: editText,
        isModified: true,
        originalContent: steps[currentStep].content,
        analysis
      });

      // 4. Add the simulated response
      newSteps.push({
        role: 'partner',
        senderName: steps[currentStep + 1]?.senderName || '상대방', // Try to keep name if exists
        content: simulation.reply,
        analysis: { emotion: '시뮬레이션', intent: simulation.reasoning, advice: '수정된 대화에 대한 반응입니다.' }
      });

      setSteps(newSteps);
      setDiverged(true);
      setMode('PLAYING');
      // Already at currentStep, but we want to show the next one (partner's reply)
      setCurrentStep(newSteps.length - 1);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const resetSimulation = () => {
    if (id) {
       window.location.reload();
    } else {
       setMode('INPUT');
       setSteps([]);
       setCurrentStep(0);
       setDiverged(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#fcfcf9] flex flex-col items-center p-0">
      {/* Background Ambience (Subtle for light mode) */}
      <div className="fixed inset-0 opacity-10 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-primary/20 to-transparent" />
      </div>

      {/* Main Container - Mobile Responsive but no fake frame */}
      <div className="relative w-full max-w-md min-h-screen bg-white shadow-xl shadow-black/5 flex flex-col z-10 transition-all">
        
        {/* Top Bar */}
        <div className="relative z-10 pt-12 p-6 flex justify-between items-center border-b border-[#e5e5d8] bg-white/80 backdrop-blur-md">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/dashboard')} className="p-2 hover:bg-black/5 rounded-full transition-colors text-gray-500">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-sm font-display font-bold text-gray-900">마음 리플레이</h1>
              <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">Dialogue Simulator</p>
            </div>
          </div>
          
          {mode !== 'INPUT' && (
            <div className="flex items-center gap-2">
              <div className="text-[9px] font-bold bg-gray-50 px-2.5 py-1.5 rounded-full border border-gray-100 text-gray-500">
                {currentStep + 1}/{steps.length}
              </div>
            </div>
          )}
        </div>

        <AnimatePresence mode="wait">
          {mode === 'INPUT' ? (
            <motion.div
              key="input"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex-1 flex flex-col px-6 pt-10 pb-20 items-center overflow-y-auto no-scrollbar"
            >
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-6 border border-primary/20">
                 <RotateCcw className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-2xl font-display font-bold mb-2 text-center text-gray-900">반복되는 대화,<br/>바꿀 수 있을까요?</h2>
              <p className="text-gray-400 text-[11px] text-center mb-8 leading-relaxed font-medium">
                갈등 상황의 대화를 입력하고,<br/>
                나의 말이 바뀌었을 때의 결과를 미리 확인해보세요.
              </p>

              <div className="w-full relative">
                <textarea
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder="대화 내용을 입력하세요...&#10;나: 왜 늦은거야?&#10;상대: 차가 막혀서 그랬어."
                  className="w-full bg-gray-50 border border-gray-100 rounded-[2rem] p-6 text-sm font-medium outline-none focus:ring-2 focus:ring-primary min-h-[220px] transition-all placeholder:text-gray-300 text-gray-900"
                />
              </div>

              <button
                 onClick={parseAndStart}
                 disabled={!rawText.trim()}
                 className="w-full mt-6 py-4 bg-primary text-white rounded-[1.5rem] font-bold text-sm hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-primary/20 disabled:opacity-50"
              >
                리플레이 시작
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="story"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex-1 flex flex-col relative overflow-hidden"
            >
              {/* Main Stage */}
              <div className="flex-1 flex flex-col p-6 pb-24 overflow-y-auto no-scrollbar">
                <AnimatePresence mode="wait">
                  {mode === 'REWRITING' ? (
                    <motion.div
                      key="rewrite"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="w-full flex-1 flex flex-col justify-center"
                    >
                      <div className="text-center mb-6">
                        <div className="inline-flex items-center gap-2 px-3 py-1 bg-secondary/10 text-secondary rounded-full text-[9px] font-bold uppercase tracking-widest mb-3">
                           <Edit3 className="w-3 h-3" />
                           대화 수정
                        </div>
                        <h2 className="text-xl font-display font-bold text-gray-900">다르게 말해본다면?</h2>
                      </div>

                      <div className="relative mb-6">
                        <textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          className="w-full bg-gray-50 border-2 border-secondary/20 rounded-[2.5rem] p-6 text-lg font-medium outline-none focus:border-secondary transition-all text-center min-h-[180px] placeholder:text-gray-300 text-gray-900"
                          autoFocus
                          placeholder="더 나은 표현으로 고쳐보세요..."
                        />
                      </div>

                      <div className="flex flex-col gap-2">
                        <button 
                          onClick={applyRewrite}
                          disabled={loading || !editText.trim()}
                          className="w-full py-4 bg-secondary text-white rounded-[1.5rem] font-bold shadow-lg shadow-secondary/20 flex items-center justify-center gap-2 disabled:opacity-50 text-sm hover:scale-[1.01] active:scale-95 transition-all"
                        >
                          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <><CheckCircle2 className="w-4 h-4" /> 수정된 결과 보기</>}
                        </button>
                        <button 
                          onClick={() => setMode('PLAYING')}
                          className="w-full py-3 rounded-[1.5rem] border border-gray-200 font-bold hover:bg-black/5 text-gray-400 text-xs transition-all"
                        >
                          취소
                        </button>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key={currentStep}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="w-full flex-1 flex flex-col"
                    >
                      <div className="flex flex-col items-center text-center w-full mt-10 mb-8">
                         <motion.div 
                           initial={{ scale: 0.8 }}
                           animate={{ scale: 1 }}
                           className={`w-12 h-12 rounded-full flex items-center justify-center shadow-sm text-xs font-bold mb-4 ${steps[currentStep]?.role === 'user' ? 'bg-primary text-white' : 'bg-gray-100 text-gray-500'}`}
                         >
                           {steps[currentStep]?.senderName[0]}
                         </motion.div>
                         <div className="space-y-2">
                           <span className="text-[10px] font-bold text-gray-300 uppercase tracking-[0.2em]">
                              {steps[currentStep]?.senderName}
                           </span>
                           <h2 className="text-2xl font-display font-medium leading-relaxed px-2 text-gray-900">
                              {loading ? (
                                <span className="flex gap-1.5 justify-center py-2">
                                  <span className="w-2 h-2 bg-primary/20 rounded-full animate-bounce delay-0" />
                                  <span className="w-2 h-2 bg-primary/20 rounded-full animate-bounce delay-150" />
                                  <span className="w-2 h-2 bg-primary/20 rounded-full animate-bounce delay-300" />
                                </span>
                              ) : (
                                `"${steps[currentStep]?.content}"`
                              )}
                           </h2>
                         </div>

                         {steps[currentStep]?.isModified && (
                           <div className="mt-4 px-3 py-1 bg-secondary/5 rounded-full text-[9px] font-medium text-secondary italic border border-secondary/10">
                              기존: {steps[currentStep]?.originalContent}
                           </div>
                         )}
                      </div>

                      {/* Analysis Block (Integrated for better readability) */}
                      <AnimatePresence>
                        {steps[currentStep]?.analysis && !loading && (
                          <motion.div 
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="bg-gray-50 rounded-[2.5rem] p-6 border border-gray-100 mb-8 space-y-4"
                          >
                            <div className="grid grid-cols-2 gap-3">
                              <AnalysisSnippet 
                                title="감정" 
                                icon={Heart} 
                                content={steps[currentStep].analysis.emotion} 
                                color="text-red-400"
                              />
                              <AnalysisSnippet 
                                title="의도" 
                                icon={HelpCircle} 
                                content={steps[currentStep].analysis.intent} 
                                color="text-blue-400"
                              />
                            </div>
                            <div className="p-5 bg-white rounded-[1.5rem] border border-gray-100 shadow-sm">
                               <div className="flex items-center gap-2 mb-2">
                                  <Sparkles className="w-3 h-3 text-primary" />
                                  <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">AI 의견</span>
                               </div>
                               <p className="text-[11px] leading-relaxed text-gray-600 font-medium whitespace-pre-wrap">
                                  {steps[currentStep].analysis.advice}
                               </p>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Interaction Area */}
                      {!loading && (
                        <motion.div 
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.3 }}
                          className="mt-auto pb-10"
                        >
                          {steps[currentStep]?.role === 'user' ? (
                            <div className="flex flex-col items-center gap-3 w-full">
                              <p className="text-[8px] font-bold text-gray-300 uppercase tracking-widest mb-1">당신의 선택</p>
                              <div className="flex flex-col gap-2 w-full">
                                <ChoiceButton 
                                  label="수정해서 말하기" 
                                  description="다르게 행동했다면 어땠을까요?"
                                  icon={Edit3}
                                  onClick={startRewrite}
                                  highlight
                                />
                                <ChoiceButton 
                                  label="그대로 말하기" 
                                  description="원래 하려던 말을 이어갑니다"
                                  icon={SkipForward}
                                  onClick={handleNext}
                                  disabled={currentStep === steps.length - 1}
                                />
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center">
                               <button 
                                 onClick={handleNext}
                                 disabled={currentStep === steps.length - 1}
                                 className="w-full py-4 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-[1.5rem] font-bold flex items-center justify-center gap-2 transition-all group text-sm border border-gray-100"
                               >
                                 다음 내용 보기
                                 <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                               </button>
                            </div>
                          )}
                        </motion.div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Bottom reset button */}
              <div className="absolute bottom-6 left-6 z-20">
                <button 
                  onClick={resetSimulation}
                  className="p-3 bg-gray-50/50 backdrop-blur-md border border-gray-100 hover:bg-white rounded-xl flex items-center gap-2 text-gray-400 hover:text-primary transition-all font-bold shadow-sm"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span className="text-[10px]">다시하기</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function AnalysisSnippet({ title, icon: Icon, content, color }: any) {
  return (
    <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <Icon className={`w-3 h-3 ${color}`} />
        <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400">{title}</span>
      </div>
      <p className="text-[11px] font-bold text-gray-700">{content}</p>
    </div>
  );
}

function ChoiceButton({ label, description, icon: Icon, onClick, highlight, disabled }: any) {
  return (
    <button 
      onClick={onClick}
      disabled={disabled}
      className={`p-5 rounded-[1.5rem] text-left transition-all border group flex items-center gap-4 ${
        highlight 
        ? 'bg-secondary text-white border-secondary shadow-lg shadow-secondary/20 active:scale-95' 
        : 'bg-white border-gray-100 text-gray-700 hover:bg-gray-50 disabled:opacity-30'
      }`}
    >
      <div className={`p-2.5 rounded-xl shrink-0 ${highlight ? 'bg-white/20' : 'bg-gray-100 text-secondary'}`}>
         <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1">
        <div className="font-bold text-[14px] leading-tight mb-1">
          {label}
        </div>
        <div className={`text-[10px] font-medium leading-tight ${highlight ? 'text-white/70' : 'text-gray-400'}`}>
          {description}
        </div>
      </div>
    </button>
  );
}

function RefreshCw(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}
