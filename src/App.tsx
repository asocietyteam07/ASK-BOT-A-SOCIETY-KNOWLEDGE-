import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, 
  BookOpen, 
  History, 
  Plus, 
  Search, 
  Sparkles, 
  Brain, 
  GraduationCap,
  MessageSquare,
  ChevronRight,
  Menu,
  X,
  User,
  Bot,
  Mic,
  MicOff,
  Image as ImageIcon,
  Upload,
  ExternalLink,
  Volume2,
  VolumeX,
  Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { 
  getChatResponse, 
  editImage, 
  getLiveSession, 
  getThinkingResponse, 
  getFastResponse, 
  analyzeMedia, 
  generateImage,
  transcribeAudio
} from './services/geminiService';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: Date;
  image?: string;
  groundingMetadata?: any;
}

const SUGGESTED_TOPICS = [
  { icon: <Brain className="w-4 h-4" />, label: "Quantum Physics", prompt: "Explain Quantum Physics to a 10-year old." },
  { icon: <Sparkles className="w-4 h-4" />, label: "Renaissance Art", prompt: "What made Renaissance art so revolutionary?" },
  { icon: <GraduationCap className="w-4 h-4" />, label: "Machine Learning", prompt: "How do neural networks actually learn?" },
  { icon: <BookOpen className="w-4 h-4" />, label: "Ancient Stoicism", prompt: "What are the core principles of Stoic philosophy?" },
];

export default function App() {
  const [messages, setMessages] = useState<Message[]>(() => {
    const saved = localStorage.getItem('ask_messages');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return parsed.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) }));
      } catch (e) {
        return [];
      }
    }
    return [];
  });
  const [studentName, setStudentName] = useState(() => localStorage.getItem('ask_student_name') || '');
  const [grade, setGrade] = useState(() => localStorage.getItem('ask_grade') || '');
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 1024);
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [aiAudioLevel, setAiAudioLevel] = useState(0);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState<string | null>(null);
  const [mode, setMode] = useState<'normal' | 'thinking' | 'fast' | 'image-gen'>('normal');
  const [imageSize, setImageSize] = useState<'1K' | '2K' | '4K'>('1K');
  const [voiceName, setVoiceName] = useState(() => localStorage.getItem('ask_voice_name') || 'Puck');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const sessionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const nextStartTimeRef = useRef<number>(0);

  useEffect(() => {
    localStorage.setItem('ask_messages', JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    localStorage.setItem('ask_student_name', studentName);
  }, [studentName]);

  useEffect(() => {
    localStorage.setItem('ask_grade', grade);
  }, [grade]);

  useEffect(() => {
    localStorage.setItem('ask_voice_name', voiceName);
  }, [voiceName]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Handle window resize for sidebar
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 1024) {
        setIsSidebarOpen(true);
      } else {
        setIsSidebarOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleSend = async (text: string = input) => {
    if (!text.trim() || isLoading) return;

    // Close sidebar on mobile when sending
    if (window.innerWidth <= 1024) {
      setIsSidebarOpen(false);
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date(),
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      const history = newMessages.map(m => ({
        role: m.role,
        parts: [{ text: m.content }]
      }));

      let responseData;
      if (selectedImage && imageMimeType) {
        const base64Data = selectedImage.split(',')[1];
        if (text.toLowerCase().includes('edit')) {
          const editedImageUrl = await editImage(base64Data, imageMimeType, text);
          responseData = { text: `I've edited the image for you based on your prompt: "${text}"`, image: editedImageUrl };
        } else {
          responseData = await analyzeMedia(base64Data, imageMimeType, text, studentName, grade);
        }
        setSelectedImage(null);
        setImageMimeType(null);
      } else if (mode === 'thinking') {
        responseData = await getThinkingResponse(text, history, studentName, grade);
      } else if (mode === 'fast') {
        responseData = await getFastResponse(text, history, studentName, grade);
      } else if (mode === 'image-gen') {
        const imageUrl = await generateImage(text, imageSize);
        responseData = { text: `I've generated this image for you: "${text}"`, image: imageUrl };
      } else {
        responseData = await getChatResponse(text, history, studentName, grade);
      }
      
      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        content: responseData.text || "I'm sorry, I couldn't process that request.",
        timestamp: new Date(),
        image: responseData.image,
        groundingMetadata: responseData.groundingMetadata
      };

      setMessages(prev => [...prev, botMessage]);
    } catch (error) {
      console.error("Chat Error:", error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        content: "I encountered an error while thinking. Please try again.",
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleMediaUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setSelectedImage(event.target?.result as string);
        setImageMimeType(file.type);
      };
      reader.readAsDataURL(file);
    }
  };

  const startLiveSession = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContextRef.current = new AudioContext({ sampleRate: 16000 });
      sourceRef.current = audioContextRef.current.createMediaStreamSource(stream);
      processorRef.current = audioContextRef.current.createScriptProcessor(4096, 1, 1);
      nextStartTimeRef.current = 0;

      const session = await getLiveSession({
        onopen: () => {
          setIsRecording(true);
          setIsLiveMode(true);
        },
        onmessage: async (message: any) => {
          const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
          if (base64Audio && audioContextRef.current) {
            const binaryString = atob(base64Audio);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            const pcm16 = new Int16Array(bytes.buffer);
            const float32 = new Float32Array(pcm16.length);
            
            // Calculate AI audio level for animation
            let sum = 0;
            for (let i = 0; i < pcm16.length; i++) {
              const sample = pcm16[i] / 32768.0;
              float32[i] = sample;
              sum += sample * sample;
            }
            const level = Math.sqrt(sum / pcm16.length);
            setAiAudioLevel(level);
            
            const audioBuffer = audioContextRef.current.createBuffer(1, float32.length, 16000);
            audioBuffer.getChannelData(0).set(float32);
            
            const playSource = audioContextRef.current.createBufferSource();
            playSource.buffer = audioBuffer;
            playSource.connect(audioContextRef.current.destination);
            
            // Scheduling for gapless playback
            const currentTime = audioContextRef.current.currentTime;
            if (nextStartTimeRef.current < currentTime) {
              nextStartTimeRef.current = currentTime + 0.05; // Small buffer
            }
            
            playSource.start(nextStartTimeRef.current);
            nextStartTimeRef.current += audioBuffer.duration;

            // Reset AI audio level after chunk finishes
            setTimeout(() => {
              setAiAudioLevel(prev => Math.max(0, prev - 0.1));
            }, audioBuffer.duration * 1000);
          }
        },
        onclose: () => {
          stopLiveSession();
        },
        onerror: (e: any) => {
          console.error("Live Error:", e);
          stopLiveSession();
        }
      }, studentName, grade, voiceName);

      sessionRef.current = session;

      processorRef.current.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        
        // Calculate audio level for animation
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i];
        }
        setAudioLevel(Math.sqrt(sum / inputData.length));

        // Convert to PCM16
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          pcm16[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
        }
        const base64Data = btoa(String.fromCharCode(...new Uint8Array(pcm16.buffer)));
        
        session.sendRealtimeInput({
          media: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
        });
      };

      sourceRef.current.connect(processorRef.current);
      processorRef.current.connect(audioContextRef.current.destination);

    } catch (error) {
      console.error("Failed to start live session:", error);
      alert("Could not access microphone. Please check permissions.");
    }
  };

  const stopLiveSession = () => {
    setIsRecording(false);
    setIsLiveMode(false);
    setAudioLevel(0);
    
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
  };

  const startTranscription = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64Audio = (reader.result as string).split(',')[1];
          setIsLoading(true);
          try {
            const transcription = await transcribeAudio(base64Audio, 'audio/webm');
            if (transcription) {
              setInput(prev => prev + (prev ? ' ' : '') + transcription);
            }
          } catch (error) {
            console.error("Transcription Error:", error);
          } finally {
            setIsLoading(false);
          }
        };
        reader.readAsDataURL(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsTranscribing(true);
    } catch (error) {
      console.error("Mic access failed:", error);
    }
  };

  const stopTranscription = () => {
    if (mediaRecorderRef.current && isTranscribing) {
      mediaRecorderRef.current.stop();
      setIsTranscribing(false);
    }
  };

  return (
    <div className="flex h-screen bg-stone-50 font-sans overflow-hidden">
      {/* Mobile Overlay */}
      <AnimatePresence>
        {isSidebarOpen && window.innerWidth <= 1024 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-stone-900/20 backdrop-blur-sm z-30 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Mobile Sidebar Toggle */}
      <button 
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white rounded-lg shadow-md border border-stone-200"
      >
        {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Sidebar */}
      <AnimatePresence mode="wait">
        {isSidebarOpen && (
          <motion.aside
            initial={{ x: -300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -300, opacity: 0 }}
            className="fixed lg:relative z-40 w-72 h-full bg-white border-r border-stone-200 flex flex-col shadow-xl lg:shadow-none"
          >
            <div className="p-6 border-b border-stone-100 flex items-center gap-3">
              <div className="w-10 h-10 bg-stone-900 rounded-xl flex items-center justify-center text-white">
                <Brain size={24} />
              </div>
              <div>
                <h1 className="font-serif font-bold text-xl tracking-tight">ASK</h1>
                <p className="text-[10px] uppercase tracking-widest text-stone-400 font-semibold">Society Knowledge</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              <div className="space-y-4">
                <h3 className="px-4 text-[10px] font-bold uppercase tracking-widest text-stone-400">Student Profile</h3>
                <div className="space-y-3 px-4">
                  <div className="relative">
                    <input 
                      type="text"
                      value={studentName}
                      onChange={(e) => setStudentName(e.target.value)}
                      placeholder="Enter your name..."
                      className="w-full bg-stone-50 border border-stone-200 rounded-lg pl-3 pr-8 py-2 text-sm focus:ring-2 focus:ring-stone-900/5 focus:border-stone-900 outline-none transition-all"
                    />
                    <User size={14} className="absolute right-3 top-3 text-stone-300" />
                  </div>
                  <div className="relative">
                    <select 
                      value={grade}
                      onChange={(e) => setGrade(e.target.value)}
                      className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-stone-900/5 focus:border-stone-900 outline-none transition-all appearance-none"
                    >
                      <option value="">Select Grade</option>
                      {Array.from({ length: 12 }, (_, i) => (
                        <option key={i + 1} value={i + 1}>Grade {i + 1}</option>
                      ))}
                      <option value="College">College</option>
                    </select>
                    <GraduationCap size={14} className="absolute right-3 top-3 text-stone-300 pointer-events-none" />
                  </div>
                </div>
              </div>

              <div>
                <button 
                  onClick={() => isLiveMode ? stopLiveSession() : startLiveSession()}
                  className={cn(
                    "w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl transition-all shadow-sm text-sm font-bold uppercase tracking-widest mb-3",
                    isLiveMode 
                      ? "bg-amber-500 text-white hover:bg-amber-600 animate-pulse" 
                      : "bg-emerald-600 text-white hover:bg-emerald-700"
                  )}
                >
                  {isLiveMode ? <MicOff size={18} /> : <Mic size={18} />}
                  {isLiveMode ? "End Live Session" : "Go Live (Voice)"}
                </button>
                <button 
                  onClick={() => {
                    if (confirm('Start a new knowledge session? Current history will be cleared.')) {
                      setMessages([]);
                    }
                  }}
                  className="w-full flex items-center gap-2 px-4 py-3 bg-stone-900 text-white rounded-xl hover:bg-stone-800 transition-colors shadow-sm text-sm font-medium"
                >
                  <Plus size={18} />
                  New Knowledge Session
                </button>
              </div>

              <div className="space-y-2 px-4">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Live Voice</h3>
                <div className="relative">
                  <select 
                    value={voiceName}
                    onChange={(e) => setVoiceName(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-stone-900/5 focus:border-stone-900 outline-none transition-all appearance-none"
                  >
                    <option value="Puck">Puck (Youthful)</option>
                    <option value="Charon">Charon (Deep)</option>
                    <option value="Kore">Kore (Balanced)</option>
                    <option value="Fenrir">Fenrir (Strong)</option>
                    <option value="Zephyr">Zephyr (Light)</option>
                  </select>
                  <Volume2 size={14} className="absolute right-3 top-3 text-stone-300 pointer-events-none" />
                </div>
              </div>

              <div className="space-y-2 px-4">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-stone-400">AI Intelligence</h3>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'normal', label: 'Normal', icon: <Sparkles size={14} /> },
                    { id: 'thinking', label: 'Thinking', icon: <Brain size={14} /> },
                    { id: 'fast', label: 'Fast', icon: <Zap size={14} /> },
                    { id: 'image-gen', label: 'Image Gen', icon: <ImageIcon size={14} /> },
                  ].map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setMode(m.id as any)}
                      className={cn(
                        "flex flex-col items-center justify-center p-2 rounded-lg border text-[10px] font-medium transition-all",
                        mode === m.id ? "bg-stone-900 text-white border-stone-900" : "bg-white text-stone-600 border-stone-200 hover:border-stone-400"
                      )}
                    >
                      {m.icon}
                      <span className="mt-1">{m.label}</span>
                    </button>
                  ))}
                </div>
                {mode === 'image-gen' && (
                  <div className="mt-2">
                    <select 
                      value={imageSize}
                      onChange={(e) => setImageSize(e.target.value as any)}
                      className="w-full px-3 py-1.5 bg-stone-50 border border-stone-200 rounded-lg text-[10px] focus:outline-none"
                    >
                      <option value="1K">1K Resolution</option>
                      <option value="2K">2K Resolution</option>
                      <option value="4K">4K Resolution</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <h3 className="px-4 text-[10px] font-bold uppercase tracking-widest text-stone-400">Knowledge Topics</h3>
                {SUGGESTED_TOPICS.map((topic, i) => (
                  <button
                    key={i}
                    onClick={() => handleSend(topic.prompt)}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-stone-600 hover:bg-stone-50 rounded-lg transition-colors text-left group"
                  >
                    <span className="text-stone-400 group-hover:text-stone-900">{topic.icon}</span>
                    <span className="truncate">{topic.label}</span>
                  </button>
                ))}
              </div>

              <div className="space-y-2">
                <h3 className="px-4 text-[10px] font-bold uppercase tracking-widest text-stone-400">Recent Sessions</h3>
                <div className="px-4 py-8 text-center">
                  <History className="w-8 h-8 text-stone-200 mx-auto mb-2" />
                  <p className="text-xs text-stone-400">Your learning history will appear here.</p>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-stone-100">
              <div className="flex items-center gap-3 p-3 rounded-xl hover:bg-stone-50 cursor-pointer transition-colors">
                <div className="w-8 h-8 rounded-full bg-stone-200 flex items-center justify-center text-stone-600">
                  <User size={16} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-stone-900">{studentName || 'Learner'}</p>
                  <p className="text-[10px] text-stone-400">Free Account</p>
                </div>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative min-w-0">
        {/* Header */}
        <header className="h-16 border-b border-stone-100 bg-white/80 backdrop-blur-md flex items-center justify-between px-6 sticky top-0 z-30">
          <div className="flex items-center gap-2 pl-10 lg:pl-0">
            <h2 className="font-serif font-semibold text-stone-800">Current Session</h2>
            <ChevronRight size={14} className="text-stone-300" />
            <span className="text-xs text-stone-400 font-medium">Educational Assistant</span>
          </div>
          <div className="flex items-center gap-4">
            <button className="p-2 text-stone-400 hover:text-stone-600 transition-colors hidden sm:block">
              <Search size={20} />
            </button>
            <div className="h-4 w-[1px] bg-stone-200 hidden sm:block" />
            <Sparkles className="text-amber-500 w-5 h-5" />
          </div>
        </header>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-12 space-y-8">
          {isLiveMode ? (
            <div className="h-full flex flex-col items-center justify-center space-y-12">
              <div className="relative">
                {/* Virtual AI Face */}
                <motion.div
                  animate={{
                    scale: [1, 1.02 + aiAudioLevel * 0.05, 1],
                    y: [0, -5, 0],
                    boxShadow: [
                      "0 0 40px rgba(0,0,0,0.3)",
                      `0 0 ${60 + aiAudioLevel * 100}px rgba(255,255,255,${0.1 + aiAudioLevel * 0.4})`,
                      "0 0 40px rgba(0,0,0,0.3)"
                    ]
                  }}
                  transition={{
                    duration: 4,
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                  className="w-56 h-56 lg:w-72 lg:h-72 bg-stone-900 rounded-full flex flex-col items-center justify-center text-white relative z-10 overflow-hidden border-4 border-stone-800"
                >
                  {/* Eyebrows */}
                  <div className="flex gap-16 mb-2">
                    <motion.div 
                      animate={{ 
                        y: -aiAudioLevel * 15,
                        rotate: -aiAudioLevel * 10
                      }}
                      className="w-8 h-1 bg-white/30 rounded-full" 
                    />
                    <motion.div 
                      animate={{ 
                        y: -aiAudioLevel * 15,
                        rotate: aiAudioLevel * 10
                      }}
                      className="w-8 h-1 bg-white/30 rounded-full" 
                    />
                  </div>

                  {/* Eyes */}
                  <div className="flex gap-12 mb-8">
                    <motion.div 
                      animate={{ 
                        scaleY: [1, 1, 0.1, 1, 1],
                        scale: 1 + aiAudioLevel * 0.3,
                        x: [0, 2, -2, 0]
                      }}
                      transition={{ 
                        scaleY: { duration: 4, repeat: Infinity, times: [0, 0.45, 0.5, 0.55, 1] },
                        x: { duration: 5, repeat: Infinity, ease: "easeInOut" }
                      }}
                      className="w-4 h-4 bg-white rounded-full shadow-[0_0_15px_white] relative" 
                    >
                      <div className="absolute inset-0 bg-blue-400/30 blur-sm rounded-full" />
                    </motion.div>
                    <motion.div 
                      animate={{ 
                        scaleY: [1, 1, 0.1, 1, 1],
                        scale: 1 + aiAudioLevel * 0.3,
                        x: [0, 2, -2, 0]
                      }}
                      transition={{ 
                        scaleY: { duration: 4, repeat: Infinity, times: [0, 0.45, 0.5, 0.55, 1] },
                        x: { duration: 5, repeat: Infinity, ease: "easeInOut" }
                      }}
                      className="w-4 h-4 bg-white rounded-full shadow-[0_0_15px_white] relative" 
                    >
                      <div className="absolute inset-0 bg-blue-400/30 blur-sm rounded-full" />
                    </motion.div>
                  </div>

                  {/* Mouth */}
                  <div className="relative h-12 flex items-center justify-center">
                    <motion.div
                      animate={{
                        height: [4, 4 + aiAudioLevel * 50, 4],
                        width: [30, 30 + aiAudioLevel * 30, 30],
                        borderRadius: aiAudioLevel > 0.05 ? "40%" : "999px",
                        scale: 1 + aiAudioLevel * 0.2
                      }}
                      className="bg-white shadow-[0_0_20px_white] relative z-10"
                    />
                    {/* Inner Mouth Glow */}
                    {aiAudioLevel > 0.1 && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: aiAudioLevel, scale: 1 + aiAudioLevel }}
                        className="absolute w-12 h-12 bg-blue-500/20 blur-xl rounded-full"
                      />
                    )}
                  </div>

                  {/* Brain Background Pattern */}
                  <Brain size={120} className="opacity-5 absolute -bottom-4 -right-4 rotate-12" />
                </motion.div>

                {/* Glow Effect */}
                <motion.div
                  animate={{
                    scale: [1, 1.2 + audioLevel * 0.5 + aiAudioLevel * 0.5, 1],
                    opacity: [0.3, 0.6, 0.3],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                  }}
                  className="absolute inset-0 bg-stone-900 rounded-full blur-[60px] -z-10"
                />
              </div>
              <div className="text-center space-y-4">
                <h2 className="text-3xl font-serif font-bold text-stone-900">
                  {aiAudioLevel > 0.05 ? "ASK is Speaking..." : "ASK is Listening..."}
                </h2>
                <div className="flex justify-center gap-1 h-4 items-end">
                  {[...Array(5)].map((_, i) => (
                    <motion.div
                      key={i}
                      animate={{ height: [4, 4 + audioLevel * (20 + i * 5), 4] }}
                      transition={{ duration: 0.2, repeat: Infinity }}
                      className="w-1 bg-stone-400 rounded-full"
                    />
                  ))}
                </div>
                <button 
                  onClick={stopLiveSession}
                  className="px-8 py-3 bg-stone-900 text-white rounded-full font-bold uppercase tracking-widest hover:bg-stone-800 transition-all shadow-lg hover:scale-105 active:scale-95"
                >
                  End Session
                </button>
              </div>
            </div>
          ) : messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center max-w-2xl mx-auto text-center space-y-8 py-12">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="w-20 h-20 lg:w-24 lg:h-24 bg-stone-900 rounded-3xl flex items-center justify-center text-white shadow-2xl shadow-stone-200"
              >
                <Brain size={40} className="lg:hidden" />
                <Brain size={48} className="hidden lg:block" />
              </motion.div>
              <div className="space-y-4">
                <h1 className="text-3xl lg:text-5xl font-serif font-bold text-stone-900 tracking-tight px-4">
                  {studentName ? `Hello, ${studentName}. ` : ''}What would you like to <span className="italic text-stone-500 underline decoration-stone-200 underline-offset-8">learn</span> today{grade ? ` for Grade ${grade}` : ''}?
                </h1>
                <p className="text-stone-500 text-base lg:text-lg max-w-lg mx-auto leading-relaxed px-4">
                  ASK is your personal gateway to deep knowledge. Ask me anything about science, history, philosophy, or technology.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full px-4">
                {SUGGESTED_TOPICS.map((topic, i) => (
                  <button
                    key={i}
                    onClick={() => handleSend(topic.prompt)}
                    className="p-4 bg-white border border-stone-200 rounded-2xl hover:border-stone-900 hover:shadow-lg transition-all text-left group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-stone-50 flex items-center justify-center mb-3 group-hover:bg-stone-900 group-hover:text-white transition-colors">
                      {topic.icon}
                    </div>
                    <p className="font-medium text-stone-900 text-sm mb-1">{topic.label}</p>
                    <p className="text-xs text-stone-400 line-clamp-1">{topic.prompt}</p>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto w-full space-y-8 pb-24">
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  className={cn(
                    "flex gap-3 lg:gap-6",
                    msg.role === 'user' ? "flex-row-reverse" : "flex-row"
                  )}
                >
                  <div className={cn(
                    "w-8 h-8 lg:w-10 lg:h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm",
                    msg.role === 'user' ? "bg-stone-200 text-stone-600" : "bg-stone-900 text-white"
                  )}>
                    {msg.role === 'user' ? <User size={16} className="lg:hidden" /> : <Bot size={16} className="lg:hidden" />}
                    {msg.role === 'user' ? <User size={20} className="hidden lg:block" /> : <Bot size={20} className="hidden lg:block" />}
                  </div>
                  <div className={cn(
                    "flex-1 space-y-2 max-w-[90%] lg:max-w-[85%]",
                    msg.role === 'user' ? "text-right" : "text-left"
                  )}>
                    <div className={cn(
                      "p-4 lg:p-6 rounded-2xl shadow-sm border",
                      msg.role === 'user' 
                        ? "bg-white border-stone-200 inline-block text-left" 
                        : "bg-white border-stone-100"
                    )}>
                      {msg.image && (
                        <div className="mb-4 rounded-xl overflow-hidden border border-stone-100">
                          <img src={msg.image} alt="Generated" className="w-full h-auto" referrerPolicy="no-referrer" />
                        </div>
                      )}
                      <div className="markdown-body">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                      
                      {msg.groundingMetadata?.groundingChunks && (
                        <div className="mt-6 pt-4 border-t border-stone-100">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-3 flex items-center gap-2">
                            <Search size={12} /> Sources & Grounding
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {msg.groundingMetadata.groundingChunks.map((chunk: any, idx: number) => (
                              chunk.web && (
                                <a 
                                  key={idx}
                                  href={chunk.web.uri}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-2 px-3 py-1.5 bg-stone-50 border border-stone-200 rounded-lg text-xs text-stone-600 hover:bg-stone-100 transition-colors"
                                >
                                  <span className="truncate max-w-[150px]">{chunk.web.title}</span>
                                  <ExternalLink size={10} />
                                </a>
                              )
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    <p className="text-[10px] text-stone-400 font-medium uppercase tracking-widest px-2">
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </motion.div>
              ))}
              {isLoading && (
                <div className="flex gap-3 lg:gap-6">
                  <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-xl bg-stone-900 text-white flex items-center justify-center animate-pulse">
                    <Bot size={16} className="lg:hidden" />
                    <Bot size={20} className="hidden lg:block" />
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="p-4 lg:p-6 bg-white border border-stone-100 rounded-2xl shadow-sm w-20 lg:w-24 flex gap-1">
                      <div className="w-1.5 h-1.5 lg:w-2 lg:h-2 bg-stone-300 rounded-full animate-bounce" />
                      <div className="w-1.5 h-1.5 lg:w-2 lg:h-2 bg-stone-300 rounded-full animate-bounce [animation-delay:0.2s]" />
                      <div className="w-1.5 h-1.5 lg:w-2 lg:h-2 bg-stone-300 rounded-full animate-bounce [animation-delay:0.4s]" />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-4 lg:p-12 pt-0 sticky bottom-0 bg-gradient-to-t from-stone-50 via-stone-50 to-transparent">
          <div className="max-w-3xl mx-auto relative">
            {selectedImage && (
              <motion.div 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="absolute -top-32 left-0 bg-white p-2 rounded-2xl shadow-xl border border-stone-200 flex gap-3 items-center"
              >
                <img src={selectedImage} className="w-20 h-20 object-cover rounded-xl" referrerPolicy="no-referrer" />
                <div className="pr-4">
                  <p className="text-xs font-bold text-stone-900">Image Selected</p>
                  <p className="text-[10px] text-stone-400">Ask me to edit or explain it.</p>
                  <button onClick={() => setSelectedImage(null)} className="text-[10px] text-red-500 font-bold uppercase mt-1">Remove</button>
                </div>
              </motion.div>
            )}
            <div className="absolute -top-10 left-0 right-0 flex justify-center pointer-events-none">
              <div className="bg-white/90 backdrop-blur-sm border border-stone-100 px-3 py-1 rounded-full text-[9px] lg:text-[10px] font-bold uppercase tracking-widest text-stone-400 shadow-sm">
                ASK AI is ready to help {studentName ? studentName : ''} {grade ? `(Grade ${grade})` : ''} • {mode.toUpperCase()} MODE
              </div>
            </div>
                <div className="relative group">
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleMediaUpload} 
                    accept="image/*,video/*" 
                    className="hidden" 
                  />
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder={selectedImage ? "Describe how to edit this image..." : "Ask me anything..."}
                    className="w-full bg-white border border-stone-200 rounded-2xl p-4 lg:p-6 pr-32 lg:pr-40 focus:outline-none focus:ring-2 focus:ring-stone-900/5 focus:border-stone-900 transition-all shadow-lg shadow-stone-200/50 resize-none h-14 lg:h-20"
                  />
                  <div className="absolute right-2 top-2 lg:right-4 lg:top-4 flex gap-2">
                    <button
                      onClick={isTranscribing ? stopTranscription : startTranscription}
                      className={cn(
                        "w-10 h-10 lg:w-12 lg:h-12 rounded-xl flex items-center justify-center transition-all",
                        isTranscribing ? "bg-red-500 text-white animate-pulse" : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                      )}
                      title="Voice Input"
                    >
                      {isTranscribing ? <MicOff size={18} /> : <Mic size={18} />}
                    </button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-10 h-10 lg:w-12 lg:h-12 bg-stone-100 text-stone-600 rounded-xl flex items-center justify-center hover:bg-stone-200 transition-all"
                      title="Upload image to edit"
                    >
                      <ImageIcon size={20} />
                    </button>
                    <button
                      onClick={() => handleSend()}
                      disabled={!input.trim() || isLoading}
                      className="w-10 h-10 lg:w-12 lg:h-12 bg-stone-900 text-white rounded-xl flex items-center justify-center hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md"
                    >
                      <Send size={18} className="lg:hidden" />
                      <Send size={20} className="hidden lg:block" />
                    </button>
                  </div>
                </div>
            <p className="text-center mt-2 lg:mt-4 text-[9px] lg:text-[10px] text-stone-400 font-medium hidden sm:block">
              Press Enter to send • Shift + Enter for new line
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
