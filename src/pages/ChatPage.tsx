import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { collection, query, orderBy, getDocs, addDoc, serverTimestamp, doc, getDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { Conversation, Message, UserProfile } from '../types';
import { analyzeMessage } from '../lib/gemini';
import { motion, AnimatePresence } from 'motion/react';

// ... (icons imports)
import { 
  ArrowLeft, 
  Send, 
  User as UserIcon, 
  HelpCircle, 
  Sparkles, 
  AlertTriangle,
  Info,
  CheckCircle2,
  Trash2,
  Heart,
  History,
  Mic,
  MicOff,
  Zap
} from 'lucide-react';

export default function ChatPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [role, setRole] = useState<'user' | 'partner'>('user');
  const [analyzing, setAnalyzing] = useState(false);
  const [autoAnalyzing, setAutoAnalyzing] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id || !auth.currentUser) return;
    
    // 1. Fetch user profile
    const userRef = doc(db, 'users', auth.currentUser.uid);
    getDoc(userRef).then(snap => {
      if (snap.exists()) setUserProfile(snap.data() as UserProfile);
    });

    // 2. Real-time Conversation listener
    const convRef = doc(db, 'users', auth.currentUser.uid, 'conversations', id);
    const unsubConv = onSnapshot(convRef, (snap) => {
      if (snap.exists()) {
        setConversation({ id: snap.id, ...snap.data() } as Conversation);
      }
    });

    // 3. Real-time Messages listener
    const msgQuery = query(
      collection(db, 'users', auth.currentUser.uid, 'conversations', id, 'messages'),
      orderBy('order', 'asc')
    );
    const unsubMsgs = onSnapshot(msgQuery, (snapshot) => {
      const msgs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Message));
      
      // Fallback for old messages without order (only if needed)
      if (msgs.length > 0 && msgs[0].order === undefined) {
         // Sort locally instead of re-querying for simplicity if order is missing
         msgs.sort((a, b) => {
           const timeA = a.createdAt?.toMillis?.() || 0;
           const timeB = b.createdAt?.toMillis?.() || 0;
           return timeA - timeB;
         });
      }
      setMessages(msgs);
    });

    return () => {
      unsubConv();
      unsubMsgs();
    };
  }, [id, auth.currentUser]);

  // Effect to handle auto-analysis of messages that don't have analysis yet
  useEffect(() => {
    const toAnalyze = messages.filter(m => !m.analysis);
    if (toAnalyze.length > 0 && !autoAnalyzing && userProfile) {
      const startAnalysis = async () => {
        setAutoAnalyzing(true);
        try {
          let successCount = 0;
          let failCount = 0;

          for (const msg of toAnalyze) {
            const msgIndex = messages.findIndex(m => m.id === msg.id);
            const history = messages.slice(0, msgIndex).map(m => ({ role: m.role, content: m.content }));
            
            try {
              const analysis = await analyzeMessage(msg.content, msg.role, userProfile.traitProfile, history);
              if (analysis && analysis.intent !== 'API 키 누락' && analysis.intent !== '분석 실패') {
                await updateDoc(doc(db, 'users', auth.currentUser!.uid, 'conversations', id!, 'messages', msg.id), {
                  analysis
                });
                successCount++;
              } else {
                failCount++;
              }
              await new Promise(resolve => setTimeout(resolve, 1500));
            } catch (e) {
              console.error("Auto analysis step failed:", e);
              failCount++;
              await new Promise(resolve => setTimeout(resolve, 3000));
            }
          }

          if (successCount > 0) {
            alert(`대화 분석이 완료되었습니다. (${successCount}개의 메시지)`);
          }
          if (failCount > 0) {
            alert('일부 메시지 분석에 실패했습니다. 나중에 다시 시도해주세요.');
          }
        } finally {
          setAutoAnalyzing(false);
        }
      };
      startAnalysis();
    }
  }, [messages, userProfile, autoAnalyzing, id]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, autoAnalyzing]);

  const handleSend = async () => {
    if (!inputText.trim() || !id || !auth.currentUser) return;

    setAnalyzing(true);
    const textToSend = inputText;
    const currentRole = role;
    setInputText('');

    try {
      const now = new Date();
      // 1. Save to Firestore first (The "Save First" requirement)
      const msgData: any = {
        role: currentRole,
        content: textToSend,
        senderName: currentRole === 'user' ? (userProfile?.name || '나') : '상대방',
        order: messages.length,
        createdAt: now,
      };

      await addDoc(collection(db, 'users', auth.currentUser.uid, 'conversations', id, 'messages'), msgData);
      
      // Update last message timestamp on the conversation content
      await updateDoc(doc(db, 'users', auth.currentUser.uid, 'conversations', id), {
        lastMessageAt: now
      });

      // Clear processing states - the background effect will handle analysis
      setAnalyzing(false);

    } catch (err: any) {
      console.error("Error saving message:", err);
      setAnalyzing(false);
      alert('메시지 저장 중 오류가 발생했습니다: ' + (err.message || '알 수 없는 오류'));
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

  return (
    <div className="flex flex-col h-full max-h-screen bg-white rounded-[40px] shadow-sm border border-[#e5e5d8] overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-[#e5e5d8] flex items-center justify-between bg-[#fdfdfb]">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/dashboard')} className="p-2 hover:bg-[#f5f5f0] rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="font-display font-bold text-xl">{conversation?.title || '로딩 중...'}</h2>
            <p className="text-xs text-gray-400 uppercase tracking-widest font-bold">대화 분석</p>
          </div>
        </div>
        <div className="flex bg-[#f5f5f0] p-1 rounded-full border border-[#e5e5d8]">
          <button 
            onClick={() => setRole('user')}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${role === 'user' ? 'bg-primary text-white shadow-md' : 'text-gray-500'}`}
          >
            나
          </button>
          <button 
            onClick={() => setRole('partner')}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${role === 'partner' ? 'bg-primary text-white shadow-md' : 'text-gray-500'}`}
          >
            상대방
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-hide">
        {messages.map((msg, i) => (
          <div key={msg.id || i}>
            <MessageBubble msg={msg} />
          </div>
        ))}
        {(analyzing || autoAnalyzing) && (
          <div className="flex justify-start">
            <div className="bg-[#f5f5f0] p-4 rounded-3xl animate-pulse flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary animate-spin" />
              <span className="text-xs font-bold text-primary">
                {autoAnalyzing ? '기존 대화를 분석 중입니다...' : 'AI가 해석 중입니다...'}
              </span>
            </div>
          </div>
        )}
        <div ref={scrollRef} />
      </div>

      {/* Input */}
      <div className="p-6 bg-[#fdfdfb] border-t border-[#e5e5d8]">
        <div className="relative">
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={`${role === 'user' ? '본인' : '상대방'}이 한 말을 입력하세요...`}
            className="w-full bg-[#f5f5f0] border-none rounded-3xl py-4 pl-6 pr-16 focus:ring-2 focus:ring-primary min-h-[80px] resize-none font-medium placeholder:text-gray-400"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <div className="absolute right-3 bottom-3 flex gap-2">
            <button
              onClick={toggleSpeech}
              className={`p-3 rounded-2xl transition-all ${isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-gray-200 text-gray-500 hover:bg-gray-400'}`}
            >
              {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>
            <button
              onClick={handleSend}
              disabled={!inputText.trim() || analyzing}
              className="p-3 bg-primary text-white rounded-2xl hover:bg-[#4a4a35] transition-all disabled:opacity-50 disabled:grayscale"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
        <p className="mt-2 text-[10px] text-gray-400 font-bold text-center uppercase tracking-wider">
          AI가 심리적 맥락을 파악하기 위해 각 메시지를 해석합니다.
        </p>
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user';

  return (
    <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-[85%] ${isUser ? 'ml-auto' : 'mr-auto'}`}>
      <div className={`flex items-center gap-2 mb-2 text-[10px] font-bold uppercase tracking-widest ${isUser ? 'text-primary' : 'text-gray-500'}`}>
        <span>{msg.senderName || (isUser ? '나' : '상대방')}</span>
        <div className={`w-1.5 h-1.5 rounded-full ${isUser ? 'bg-primary' : 'bg-gray-300'}`} />
        <span className="opacity-40 text-[9px] lowercase font-medium">
          {msg.createdAt?.toDate ? msg.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '방금'}
        </span>
      </div>
      
      <div 
        className={`relative p-5 rounded-3xl transition-all border-2 shadow-sm ${
          isUser 
            ? 'bg-primary text-white border-primary rounded-tr-none' 
            : 'bg-white text-[#1a1a1a] border-[#e5e5d8] rounded-tl-none'
        }`}
      >
        <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
      </div>

      <AnimatePresence>
        {msg.analysis && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className={`mt-2 p-3.5 rounded-[24px] border border-[#e5e5d8] bg-[#fdfdfb] space-y-2 shadow-sm max-w-full ${isUser ? 'mr-1' : 'ml-1'}`}
          >
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[9px] px-1.5 py-0.5 bg-white border border-[#e5e5d8] rounded-full text-gray-500 font-bold whitespace-nowrap">
                {msg.analysis.emotion}
              </span>
              <span className="text-[10px] text-gray-700 font-bold leading-tight">
                {msg.analysis.intent}
              </span>
              {msg.analysis.empathyScore !== undefined && (
                <div className="flex gap-1 ml-auto">
                   <div className="text-[8px] px-1 bg-red-50 text-red-500 rounded font-bold">E {msg.analysis.empathyScore}</div>
                   <div className="text-[8px] px-1 bg-blue-50 text-blue-500 rounded font-bold">C {msg.analysis.clarityScore}</div>
                   <div className="text-[8px] px-1 bg-green-50 text-green-500 rounded font-bold">R {msg.analysis.resilienceScore}</div>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <div className="w-1 bg-[#e5e5d8] rounded-full shrink-0" />
              <p className="text-[10px] text-gray-500 font-medium leading-relaxed italic">
                {msg.analysis.advice}
              </p>
            </div>
            
            {isUser && msg.analysis.mistakeFilter && (
              <div className="pt-1.5 border-t border-[#e5e5d8] mt-1.5 flex items-start gap-1.5">
                <AlertTriangle className="w-3 h-3 text-secondary shrink-0 mt-0.5" />
                <p className="text-[9px] text-secondary font-bold leading-tight">{msg.analysis.mistakeFilter}</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
