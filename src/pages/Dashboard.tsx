import React, { useEffect, useState } from 'react';
import { collection, query, where, orderBy, getDocs, addDoc, serverTimestamp, limit, deleteDoc, doc, writeBatch, getDoc, onSnapshot } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { Conversation } from '../types';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, MessageSquare, Clock, ChevronRight, Play, User as UserIcon, Sparkles, Mic, MicOff, Trash2, Info, RefreshCw, Zap, Target, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { generateConversationTitle } from '../lib/gemini';

function MissionCard() {
  const [completed, setCompleted] = useState(false);
  const [showReward, setShowReward] = useState(false);
  const [hovered, setHovered] = useState(false);

  const handleComplete = () => {
    if (completed) return;
    setCompleted(true);
    setShowReward(true);
    setTimeout(() => setShowReward(false), 3000);
  };

  return (
    <motion.div 
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      whileHover={{ y: -5 }}
      className={`bg-white p-7 rounded-[40px] border-2 relative overflow-hidden group transition-all duration-700 ${completed ? 'border-primary shadow-xl shadow-primary/5' : 'border-[#e5e5d8] shadow-sm'}`}
    >
      <AnimatePresence>
        {showReward && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.5, y: 10 }}
            animate={{ opacity: 1, scale: 1.2, y: -40 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="absolute top-1/4 left-1/2 -translate-x-1/2 bg-primary text-white px-6 py-3 rounded-full font-bold text-sm shadow-2xl z-20 flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            +150 XP 획득!
          </motion.div>
        )}
      </AnimatePresence>

      <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.08] group-hover:rotate-12 transition-all duration-700">
        <Target className="w-40 h-40 text-primary" />
      </div>
      
      <div className="flex justify-between items-center mb-6 relative z-10">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all duration-500 ${completed ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-secondary/10 text-secondary'}`}>
            {completed ? <CheckCircle2 className="w-5 h-5" /> : <Zap className="w-5 h-5" />}
          </div>
          <div>
            <h4 className={`text-sm font-bold transition-colors ${completed ? 'text-primary' : 'text-gray-800'}`}>
              {completed ? '오늘의 퀘스트 완료' : '오늘의 마음 퀘스트'}
            </h4>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`w-1.5 h-1.5 rounded-full ${completed ? 'bg-primary' : 'bg-secondary animate-pulse'}`} />
              <span className="text-[9px] font-bold text-gray-400 tracking-wider">DAILY QUEST</span>
            </div>
          </div>
        </div>
        {!completed && (
          <div className="text-right">
            <span className="text-[10px] font-bold text-secondary bg-secondary/10 px-3 py-1 rounded-full">+150 pts</span>
          </div>
        )}
      </div>

      <div className="relative z-10 mb-8">
        <p className={`text-base font-display font-bold leading-tight ${completed ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
          {completed ? '건강한 소통을 위한 미션을 성공했어요!' : '"상대방의 숨은 의도를 한 번 더 물어보는 질문을 던져보세요"'}
        </p>
        {!completed && (
          <p className="text-[11px] text-gray-400 mt-2 font-medium">
             예: "그렇게 말한 데 특별한 이유가 있었어?"
          </p>
        )}
      </div>

      <div className="relative z-10 space-y-4">
        <div className="flex items-center justify-between text-[10px] font-bold text-gray-400 uppercase tracking-widest">
           <span>달성 현황</span>
           <span>{completed ? '100%' : '40%'}</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden relative">
          <motion.div 
            initial={{ width: '40%' }}
            animate={{ width: completed ? '100%' : '40%' }}
            transition={{ duration: 1, ease: "circOut" }}
            className={`h-full rounded-full ${completed ? 'bg-primary' : 'bg-secondary'}`}
          />
        </div>
        
        <button 
          onClick={handleComplete}
          disabled={completed}
          className={`w-full py-4 rounded-[24px] font-bold text-xs transition-all flex items-center justify-center gap-3 ${
            completed 
            ? 'bg-primary/5 text-primary/40 cursor-default' 
            : 'bg-secondary text-white shadow-xl shadow-secondary/20 hover:shadow-secondary/40 active:scale-95'
          }`}
        >
          {completed ? (
             <>보상 획득 완료</>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              미션 수행 대화 시작하기
            </>
          )}
        </button>
      </div>
    </motion.div>
  );
}

export default function Dashboard() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [inputText, setInputText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [tempMessages, setTempMessages] = useState<{ role: 'user' | 'partner', senderName: string, content: string }[]>([]);
  const [participants, setParticipants] = useState<{ id: string, name: string, role: 'user' | 'partner' }[]>([
    { id: '1', name: '나', role: 'user' },
    { id: '2', name: '상대방', role: 'partner' }
  ]);
  const [isUploading, setIsUploading] = useState(false);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!auth.currentUser) return;
    
    setLoading(true);

    // Fetch user profile separately
    const userRef = doc(db, 'users', auth.currentUser.uid);
    getDoc(userRef).then(snap => {
      if (snap.exists()) setUserProfile(snap.data());
    }).catch(err => console.error("Profile fetch error:", err));

    // Using lastMessageAt as it's more likely to exist on legacy and new docs
    const q = query(
      collection(db, 'users', auth.currentUser.uid, 'conversations'),
      orderBy('lastMessageAt', 'desc'),
      limit(20)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data() 
      } as Conversation));
      console.log("Dashboard snapshots - count:", list.length);
      setConversations(list);
      setLoading(false);
    }, (error) => {
      console.error("Dashboard onSnapshot error:", error);
      // Some errors might be due to missing index on lastMessageAt if we changed it
      // Let's ensure loading is disabled so user sees 'empty' state vs eternal spinner
      setLoading(false);
    });

    return () => unsubscribe();
  }, [auth.currentUser]);

  const startNewConversation = async () => {
    if (!auth.currentUser || analyzing) return;
    
    let messagesToSave: { role: 'user' | 'partner', senderName: string, content: string }[] = [];
    
    if (tempMessages.length > 0) {
      messagesToSave = tempMessages;
    } else if (inputText.trim()) {
      // Auto-parse transcript
      const lines = inputText.trim().split('\n').filter(l => l.trim());
      
      // Heuristic: if many lines, try to split by colon.
      // If no colons, treat as dialogue swap (User -> Partner -> User)
      const hasColons = lines.some(l => l.includes(':') || l.includes('：'));
      
      if (hasColons) {
        messagesToSave = lines.map((line, i) => {
          let role: 'user' | 'partner' = i % 2 === 0 ? 'user' : 'partner';
          let senderName = i % 2 === 0 ? '나' : '상대방';
          let content = line;

          const separator = line.includes(':') ? ':' : (line.includes('：') ? '：' : null);
          if (separator) {
            const parts = line.split(separator);
            const namePart = parts[0].trim();
            content = parts.slice(1).join(separator).trim();
            
            const lowerName = namePart.toLowerCase();
            if (['나', 'me', 'i', '본인', '나님', 'a', '나:'].includes(lowerName)) {
              role = 'user';
              senderName = '나';
            } else {
              role = 'partner';
              senderName = namePart;
            }
          }
          return { role, senderName, content: content || line };
        });
      } else if (lines.length > 1) {
        // No colons but multiple lines - alternating
        messagesToSave = lines.map((line, i) => ({
          role: i % 2 === 0 ? 'user' : 'partner',
          senderName: i % 2 === 0 ? '나' : '상대방',
          content: line
        }));
      } else {
        messagesToSave = [{ role: 'user', senderName: '나', content: inputText.trim() }];
      }
    }
    
    if (messagesToSave.length === 0) return;

    setAnalyzing(true);
    const path = `users/${auth.currentUser.uid}/conversations`;

    try {
      // 1. Generate title (Date-based as requested)
      const now_date = new Date();
      const title = `${now_date.getFullYear()}-${String(now_date.getMonth() + 1).padStart(2, '0')}-${String(now_date.getDate()).padStart(2, '0')} ${String(now_date.getHours()).padStart(2, '0')}:${String(now_date.getMinutes()).padStart(2, '0')}`;
      
      // 2. Prepare the main conversation document with a pre-generated ID
      const convsRef = collection(db, 'users', auth.currentUser.uid, 'conversations');
      const docRef = doc(convsRef);
      
      const batch = writeBatch(db);
      const now_val = serverTimestamp();
      
      batch.set(docRef, {
        userId: auth.currentUser.uid,
        title: title.slice(0, 100),
        status: 'active',
        lastMessageAt: now_val,
        createdAt: now_val
      });

      // 3. Add all messages to batch
      messagesToSave.forEach((msg, i) => {
        const msgRef = doc(collection(db, 'users', auth.currentUser!.uid, 'conversations', docRef.id, 'messages'));
        batch.set(msgRef, {
          content: msg.content.slice(0, 15000), // Safety truncation
          role: msg.role,
          senderName: msg.senderName.slice(0, 50),
          order: i,
          createdAt: now_val
        });
      });

      // 4. Commit all at once
      console.log("Committing batch for new conversation:", docRef.id);
      await batch.commit();
      console.log("Batch committed successfully");

      // Notify completion and close the input "window"
      setShowOptions(false);
      setTempMessages([]);
      setInputText('');
      
      alert('대화가 목록에 추가되었습니다!');
    } catch (error: any) {
      console.error('Error starting conversation:', error);
      alert('분석을 시작할 수 없습니다. 나중에 다시 시도해주세요.');
      try {
        handleFirestoreError(error, OperationType.WRITE, path);
      } catch (e) {
        // Silently catch the error thrown by handler as it is meant for diagnostic logging
      }
    } finally {
      setAnalyzing(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    // Simulate file reading and analysis process
    setTimeout(() => {
      setIsUploading(false);
      alert('파일 분석이 완료되었습니다. 대화 구성 창에 내용이 추가됩니다.');
      
      // Simulate reading content from file (mock data for now)
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        if (text) {
          setInputText(text);
          // Auto trigger modal if not open
          if (!showOptions) setShowOptions(true);
        }
      };
      reader.readAsText(file);
    }, 2000);
  };

  const addBubble = (participantId: string) => {
    if (!inputText.trim()) return;
    const participant = participants.find(p => p.id === participantId);
    if (!participant) return;

    setTempMessages(prev => [...prev, {
      role: participant.role,
      senderName: participant.name,
      content: inputText.trim()
    }]);
    setInputText('');
  };

  const removeBubble = (index: number) => {
    setTempMessages(prev => prev.filter((_, i) => i !== index));
  };

  const addParticipant = () => {
    const name = prompt('등장 인물의 이름을 입력해주세요:');
    if (name) {
      setParticipants(prev => [...prev, { 
        id: Math.random().toString(36).substr(2, 9), 
        name, 
        role: 'partner' 
      }]);
    }
  };

  const deleteConversation = async (id: string) => {
    if (!auth.currentUser || !id) return;
    
    setDeletingId(id);
    
    try {
      console.log("EXEC: Deleting document with ID:", id);
      const docRef = doc(db, 'users', auth.currentUser.uid, 'conversations', id);
      await deleteDoc(docRef);
      console.log("SUCCESS: Document deleted from Firestore");
      
      // Close modal and clear state
      setConfirmDeleteId(null);
    } catch (error: any) {
      console.error('FAIL: Firestore delete error:', error);
      alert('삭제 중 오류가 발생했습니다. 권한이나 연결을 확인해주세요.\n' + (error.message || ''));
    } finally {
      setDeletingId(null);
    }
  };

  const toggleSpeech = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('이 브라우저는 음성 인식을 지원하지 않습니다.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'ko-KR';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = (event: any) => {
      console.error('Speech recognition error', event.error);
      setIsListening(false);
    };
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInputText(prev => (prev.trim() ? prev + ' ' : '') + transcript);
    };

    if (isListening) {
      recognition.stop();
    } else {
      recognition.start();
    }
  };

  const welcomeName = userProfile?.name || auth.currentUser?.displayName?.split(' ')[0] || (auth.currentUser?.isAnonymous ? '게스트' : '사용자');

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <RefreshCw className="w-8 h-8 text-primary animate-spin" />
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">데이터를 불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div className="bg-white p-6 rounded-[32px] border border-[#e5e5d8] flex items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-4 truncate">
          <div className="w-14 h-14 bg-primary rounded-2xl flex items-center justify-center text-white shrink-0 shadow-lg shadow-primary/10 border-2 border-white">
            <UserIcon className="w-7 h-7" />
          </div>
          <div className="overflow-hidden">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest leading-none mb-1">인증됨</p>
            <h2 className="text-xl font-display font-bold truncate">환영합니다, {welcomeName}님!</h2>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none mb-1">LEVEL</p>
          <div className="text-2xl font-display font-bold text-primary">12</div>
        </div>
      </div>

      {/* Experience Improvement: Growth & Mission Section */}
      <div className="grid grid-cols-1 gap-4">
        {/* Daily Mission Card */}
        <MissionCard />
      </div>

      {/* Main Interaction Area (The "User" box in sketch) */}
      <div className="relative">
        <AnimatePresence mode="wait">
          {!showOptions ? (
            <motion.button
              key="main-button"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={() => setShowOptions(true)}
              className="w-full bg-primary p-10 rounded-[48px] shadow-xl shadow-primary/20 text-white flex flex-col items-center justify-center gap-4 relative overflow-hidden group"
            >
              <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
                <Sparkles className="w-32 h-32" />
              </div>
              <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-md">
                 <Plus className="w-10 h-10" />
              </div>
              <div className="text-center relative z-10">
                <h3 className="text-2xl font-display font-bold">새로운 대화 분석</h3>
                <p className="text-white/60 text-sm font-medium">갈등을 해결하고 마음을 이해해보세요</p>
              </div>
            </motion.button>
          ) : (
            <motion.div
              key="options"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white max-w-2xl w-full mx-auto rounded-[48px] border-2 border-primary shadow-2xl overflow-hidden flex flex-col"
              style={{ maxHeight: '85vh' }}
            >
              {/* Header */}
              <div className="bg-primary p-6 text-white flex justify-between items-center shrink-0">
                <div className="flex items-center gap-3">
                   <MessageSquare className="w-6 h-6" />
                   <h3 className="text-xl font-display font-bold">대화 구성하기</h3>
                   {tempMessages.length > 0 && (
                     <span className="bg-white/20 px-2 py-0.5 rounded-full text-[10px] font-bold">
                       {tempMessages.length}개 저장됨
                     </span>
                   )}
                </div>
                <button 
                  onClick={() => { setShowOptions(false); setTempMessages([]); setInputText(''); }} 
                  className="bg-white/20 hover:bg-white/30 p-2 rounded-full backdrop-blur-sm transition-colors"
                >
                  <Plus className="w-6 h-6 rotate-45" />
                </button>
              </div>

              {/* Message List - Scrollable */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-[#fdfdfb]">
                {tempMessages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-gray-300 gap-4 py-20 text-center">
                    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center">
                      <Sparkles className="w-8 h-8" />
                    </div>
                    <p className="text-sm font-bold uppercase tracking-widest leading-relaxed">
                      대화 내용을 입력하고<br/>
                      버튼을 눌러 말풍선을 만드세요
                    </p>
                  </div>
                ) : (
                  tempMessages.map((msg, idx) => (
                    <motion.div 
                      key={`${idx}-${msg.content.substring(0, 10)}`}
                      initial={{ opacity: 0, x: msg.role === 'user' ? 20 : -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                    >
                      <div className="flex items-end gap-2 max-w-[85%] group font-medium">
                        {msg.role !== 'user' && (
                          <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-[10px] font-bold text-gray-400 border border-gray-200 shrink-0">
                            {msg.senderName[0]}
                          </div>
                        )}
                        <div className={`p-4 rounded-3xl text-sm relative ${
                          msg.role === 'user' 
                          ? 'bg-primary text-white rounded-tr-none shadow-lg shadow-primary/10' 
                          : 'bg-white border border-[#e5e5d8] text-gray-800 rounded-tl-none shadow-sm'
                        }`}>
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                          <button 
                            onClick={() => removeBubble(idx)}
                            className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      <span className="text-[9px] font-bold text-gray-400 mt-1 uppercase tracking-widest px-2">
                        {msg.senderName}
                      </span>
                    </motion.div>
                  ))
                )}
              </div>

              {/* Input Area - Fixed at bottom */}
              <div className="p-6 bg-white border-t border-gray-100 flex flex-col gap-4 shrink-0 shadow-[0_-4px_20px_rgba(0,0,0,0.03)]">
                <div className="relative">
                  <textarea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="내용을 입력하세요..."
                    className="w-full bg-[#f5f5f0] border border-[#e5e5d8] rounded-[32px] p-5 pr-12 text-sm font-medium focus:ring-2 focus:ring-primary outline-none min-h-[80px] max-h-[150px] resize-none"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        if (inputText.trim()) addBubble(participants[0].id);
                      }
                    }}
                  />
                  <div className="absolute bottom-4 right-4 flex gap-2">
                    <button 
                      onClick={toggleSpeech}
                      className={`p-2 rounded-full transition-all ${isListening ? "bg-red-500 text-white" : "text-gray-400 hover:text-primary"}`}
                    >
                      {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2 items-center">
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mr-2">누가 말했나요?</div>
                    <div className="flex flex-wrap gap-2 flex-1">
                      {participants.map(p => (
                        <button
                          key={p.id}
                          onClick={() => addBubble(p.id)}
                          disabled={!inputText.trim()}
                          className={`px-5 py-2.5 rounded-2xl text-xs font-bold transition-all active:scale-95 shadow-sm disabled:opacity-30 ${
                            p.role === 'user' ? 'bg-primary text-white hover:bg-primary-dark' : 'bg-white border border-[#e5e5d8] text-gray-600 hover:border-primary hover:text-primary'
                          }`}
                        >
                          {p.name}
                        </button>
                      ))}
                      <button 
                        onClick={addParticipant}
                        className="p-2.5 bg-gray-50 border border-dashed border-gray-300 rounded-2xl text-gray-400 hover:text-primary hover:border-primary transition-all"
                        title="인물 추가"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="relative">
                      <input 
                        type="file" 
                        id="file-upload-modal" 
                        className="hidden" 
                        accept=".txt,.csv"
                        onChange={handleFileUpload}
                      />
                      <label 
                        htmlFor="file-upload-modal"
                        className={`w-full py-4 rounded-[24px] border-2 border-dashed border-[#e5e5d8] text-gray-400 hover:border-primary hover:text-primary transition-all flex items-center justify-center gap-2 cursor-pointer ${isUploading ? 'opacity-50 animate-pulse' : ''}`}
                      >
                        {isUploading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                        <span className="text-[10px] font-bold uppercase tracking-widest">파일 분석</span>
                      </label>
                    </div>
                    <button 
                      onClick={startNewConversation}
                      disabled={(tempMessages.length === 0 && !inputText.trim()) || analyzing}
                      className="bg-secondary text-white py-4 rounded-[24px] font-bold shadow-lg shadow-secondary/20 flex items-center justify-center gap-2 disabled:opacity-50 transition-all hover:scale-[1.02] active:scale-[0.98]"
                    >
                      {analyzing ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          <span className="text-[10px] font-bold uppercase tracking-widest">대화 저장하기</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Recent History (The "AI Analysis" list idea) */}
      <div className="space-y-4">
        <div className="flex justify-between items-center px-2">
          <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-400">최근 대화 목록</h4>
          <div className="flex gap-4">
            <button 
              onClick={() => {
                // Remove window.location.reload() which is too slow
                // Real-time listener already handles updates, but let's re-trigger it to be sure
                setLoading(true);
                setTimeout(() => setLoading(false), 500);
              }}
              className="text-[10px] font-bold uppercase tracking-widest text-gray-400 hover:text-primary flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" />
              새로고침
            </button>
            <Link to="/dashboard" className="text-[10px] font-bold uppercase tracking-widest text-secondary hover:underline">전체 보기</Link>
          </div>
        </div>
        
        <div className="space-y-3">
          {conversations.length > 0 ? (
            conversations.map((conv) => (
              <div key={conv.id} className="flex gap-2">
                <Link
                  to={`/chat/${conv.id}`}
                  className="flex-1 flex items-center justify-between bg-white p-5 rounded-[28px] border border-[#e5e5d8] hover:shadow-md transition-all group"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-accent group-hover:bg-primary group-hover:text-white rounded-xl transition-colors">
                      <MessageSquare className="w-5 h-5" />
                    </div>
                    <div>
                      <h5 className="font-bold text-sm">{conv.title}</h5>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">
                        {conv.lastMessageAt?.toDate ? conv.lastMessageAt.toDate().toLocaleDateString() : '방금'}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-primary transition-colors" />
                </Link>
                <button
                  id={`replay-btn-${conv.id}`}
                  onClick={() => navigate(`/replay/${conv.id}`)}
                  className="p-5 bg-white border border-[#e5e5d8] rounded-[28px] text-gray-400 hover:text-primary hover:border-primary transition-all shadow-sm flex-shrink-0"
                  title="시뮬레이션"
                >
                  <Play className="w-5 h-5 fill-current" />
                </button>
                <button
                  id={`delete-btn-${conv.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setConfirmDeleteId(conv.id);
                  }}
                  disabled={deletingId === conv.id}
                  className="p-5 bg-white border border-[#e5e5d8] rounded-[28px] text-gray-400 hover:text-red-500 hover:border-red-500 transition-all shadow-sm flex items-center justify-center min-w-[64px] flex-shrink-0"
                  title="삭제"
                >
                  {deletingId === conv.id ? (
                    <RefreshCw className="w-5 h-5 animate-spin" />
                  ) : (
                    <Trash2 className="w-5 h-5" />
                  )}
                </button>
              </div>
            ))
          ) : (
            <div className="bg-white p-12 rounded-[40px] border border-dashed border-[#e5e5d8] text-center space-y-4">
              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto text-gray-300">
                <MessageSquare className="w-8 h-8" />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-900">저장된 대화가 없습니다</p>
                <p className="text-xs text-gray-400 mt-1 font-medium">새로운 분석을 시작해보세요!</p>
              </div>
            </div>
          )}
        </div>
      </div>
      {/* Custom Delete Confirmation Modal */}
      <AnimatePresence>
        {confirmDeleteId && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfirmDeleteId(null)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white p-8 rounded-[40px] shadow-2xl max-w-sm w-full text-center space-y-6"
            >
              <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto text-red-500">
                <Trash2 className="w-10 h-10" />
              </div>
              <div>
                <h3 className="text-xl font-display font-bold text-gray-900">정말 삭제할까요?</h3>
                <p className="text-sm text-gray-500 mt-2">삭제된 대화 기록은 복구할 수 없습니다.</p>
              </div>
              <div className="flex gap-3">
                <button
                  id="cancel-delete-btn"
                  onClick={() => setConfirmDeleteId(null)}
                  className="flex-1 py-4 rounded-[24px] bg-gray-100 font-bold text-gray-600 hover:bg-gray-200 transition-colors"
                >
                  취소
                </button>
                <button
                  id="confirm-delete-btn"
                  onClick={() => deleteConversation(confirmDeleteId)}
                  className="flex-1 py-4 rounded-[24px] bg-red-500 text-white font-bold hover:bg-red-600 shadow-lg shadow-red-200 transition-all"
                >
                  삭제하기
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function OptionButton({ icon: Icon, label, onClick, color, active }: any) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-3 p-6 rounded-3xl transition-all hover:scale-105 active:scale-95 ${color} ${active ? 'ring-4 ring-red-200' : 'shadow-lg shadow-black/5'}`}
    >
      <div className="p-3 bg-white/10 rounded-2xl">
        <Icon className="w-8 h-8" />
      </div>
      <span className="text-xs font-bold uppercase tracking-tighter">{label}</span>
    </button>
  );
}
