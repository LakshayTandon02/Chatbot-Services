import React, { useState, useEffect, useRef } from 'react';
import { db, auth } from '../firebase';
import { collection, addDoc, serverTimestamp, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { getChatResponse } from '../services/geminiService';
import { MessageSquare, Send, X, User, Bot, Calendar, Phone, AlertCircle, Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { cn } from '../lib/utils';

interface Message {
  role: 'user' | 'model';
  content: string;
}

declare global {
  interface Window {
    webkitSpeechRecognition: any;
    SpeechRecognition: any;
  }
}

export default function Chatbot({ businessId }: { businessId?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: 'model', content: 'Hello! I am your AI assistant. How can I help you today?' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [businessContext, setBusinessContext] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [isExpired, setIsExpired] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  const effectiveBusinessId = businessId || auth.currentUser?.uid;

  useEffect(() => {
    if (!effectiveBusinessId) return;
    
    const unsubStatus = onSnapshot(doc(db, 'users', effectiveBusinessId), (userSnap) => {
      if (userSnap.exists()) {
        const userData = userSnap.data();
        const now = new Date().getTime();
        
        if (userData.isPaid && userData.paidUntil) {
          const until = userData.paidUntil.toDate().getTime();
          if (now >= until) {
            setIsExpired(true);
            setMessages([{ 
              role: 'model', 
              content: "### ⚠️ Subscription Expired\n\nYour monthly subscription has ended. To continue using the AI chatbot, please renew your plan for **₹700/month**.\n\n[Renew in Dashboard →](/dashboard)" 
            }]);
          } else {
            setIsExpired(false);
          }
        } else {
          const start = userData.trialStartDate.toDate().getTime();
          const diff = now - start;
          const daysPassed = Math.floor(diff / (1000 * 60 * 60 * 24));
          if (daysPassed >= 7) {
            setIsExpired(true);
            setMessages([{ 
              role: 'model', 
              content: "### ⚠️ Trial Expired\n\nYour 7-day trial has ended. To keep this AI chatbot active and continue serving your customers, please upgrade to our **Premium Plan** for just **₹700/month**.\n\n[Upgrade in Dashboard →](/dashboard)" 
            }]);
          } else {
            setIsExpired(false);
          }
        }
      }
    }, (error) => {
      console.error("Chatbot status listener error:", error);
    });

    const fetchBusinessInfo = async () => {
      try {
        const docRef = doc(db, 'businesses', effectiveBusinessId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setWhatsappNumber(data.whatsappNumber || '');
          setBusinessContext(`
            Business Name: ${data.name}
            Description: ${data.description}
            Services: ${data.services}
            Pricing: ${data.pricing}
            FAQs: ${data.faqs}
          `);
        }
      } catch (error) {
        console.error("Chatbot business info fetch error:", error);
      }
    };
    fetchBusinessInfo();

    return () => unsubStatus();
  }, [effectiveBusinessId]);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput(transcript);
        setIsListening(false);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const speak = (text: string) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      recognitionRef.current?.start();
      setIsListening(true);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading || !effectiveBusinessId || isExpired) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const response = await getChatResponse(
        [...messages, { role: 'user', content: userMessage }], 
        businessContext,
        effectiveBusinessId
      );
      
      let botResponse = "";
      if (response.functionCalls) {
        for (const call of response.functionCalls) {
          if (call.name === 'bookAppointment') {
            await addDoc(collection(db, 'appointments'), {
              ...call.args,
              businessId: effectiveBusinessId,
              status: 'pending',
              createdAt: serverTimestamp()
            });
            botResponse = "I've scheduled that appointment for you! Our team will confirm it shortly.";
          } else if (call.name === 'collectLead') {
            await addDoc(collection(db, 'leads'), {
              ...call.args,
              businessId: effectiveBusinessId,
              source: 'Chatbot',
              status: 'new',
              createdAt: serverTimestamp()
            });
            botResponse = `Thanks ${call.args.name}! I've noted your details and someone will reach out to you at ${call.args.phone}.`;
          }
        }
      } else {
        botResponse = response.text || "I'm sorry, I couldn't process that.";
      }

      setMessages(prev => [...prev, { role: 'model', content: botResponse }]);
      if (autoSpeak) speak(botResponse);

    } catch (error) {
      setMessages(prev => [...prev, { role: 'model', content: "Sorry, I'm having some trouble connecting right now." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="bg-white rounded-3xl shadow-2xl w-[400px] h-[600px] flex flex-col overflow-hidden border border-gray-100 mb-4"
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-5 text-white flex justify-between items-center shadow-lg">
              <div className="flex items-center gap-3">
                <div className="bg-white/20 p-2.5 rounded-2xl backdrop-blur-sm">
                  <Bot size={24} className={cn(isSpeaking && "animate-pulse")} />
                </div>
                <div>
                  <h3 className="font-bold text-base">AI Assistant</h3>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                    <span className="text-[10px] font-medium text-blue-100 uppercase tracking-wider">Online & Ready</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {whatsappNumber && (
                  <a 
                    href={`https://wa.me/${whatsappNumber}`} 
                    target="_blank" 
                    rel="noreferrer"
                    className="p-2 hover:bg-white/10 rounded-xl transition-colors text-white"
                    title="Chat on WhatsApp"
                  >
                    <MessageSquare size={20} />
                  </a>
                )}
                <button 
                  onClick={() => setAutoSpeak(!autoSpeak)}
                  className={cn("p-2 rounded-xl transition-colors", autoSpeak ? "bg-white/20" : "hover:bg-white/10")}
                  title={autoSpeak ? "Voice Output On" : "Voice Output Off"}
                >
                  {autoSpeak ? <Volume2 size={20} /> : <VolumeX size={20} />}
                </button>
                <button onClick={() => setIsOpen(false)} className="hover:bg-white/10 p-2 rounded-xl transition-colors">
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 bg-gray-50/50">
              {messages.map((msg, i) => (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={i} 
                  className={cn("flex gap-3", msg.role === 'user' ? "flex-row-reverse" : "flex-row")}
                >
                  <div className={cn(
                    "w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-sm",
                    msg.role === 'user' ? "bg-blue-600 text-white" : "bg-white text-blue-600 border border-gray-100"
                  )}>
                    {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                  </div>
                  <div className={cn(
                    "p-4 rounded-2xl max-w-[80%] shadow-sm",
                    msg.role === 'user' ? "bg-blue-600 text-white rounded-tr-none" : "bg-white border border-gray-100 text-gray-800 rounded-tl-none"
                  )}>
                    <div className="text-sm prose prose-sm max-w-none prose-p:leading-relaxed">
                      <ReactMarkdown>
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  </div>
                </motion.div>
              ))}
              {isLoading && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-xl bg-white border border-gray-100 flex items-center justify-center text-blue-600 shadow-sm">
                    <Bot size={16} />
                  </div>
                  <div className="bg-white border border-gray-100 p-4 rounded-2xl rounded-tl-none shadow-sm">
                    <div className="flex gap-1.5">
                      <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" />
                      <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                      <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:0.4s]" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="p-5 bg-white border-t border-gray-100">
              <div className="flex gap-3 items-center">
                <button
                  onClick={toggleListening}
                  className={cn(
                    "p-3 rounded-2xl transition-all shadow-sm",
                    isListening ? "bg-red-100 text-red-600 animate-pulse" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  )}
                  title={isListening ? "Stop Listening" : "Voice Input"}
                >
                  {isListening ? <MicOff size={20} /> : <Mic size={20} />}
                </button>
                <div className="flex-1 relative">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                    placeholder={isListening ? "Listening..." : "Type your message..."}
                    className="w-full bg-gray-100 border-none rounded-2xl px-5 py-3.5 text-sm focus:ring-2 focus:ring-blue-500 transition-all outline-none"
                  />
                </div>
                <button
                  onClick={handleSend}
                  disabled={isLoading || !input.trim()}
                  className="bg-blue-600 text-white p-3.5 rounded-2xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 disabled:opacity-50 disabled:shadow-none"
                >
                  <Send size={20} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative group">
        {/* Robot Mascot */}
        <motion.div
          animate={{ 
            y: [0, -5, 0],
            rotate: [0, -2, 2, 0]
          }}
          transition={{ 
            duration: 4, 
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="absolute -top-16 right-0 pointer-events-none"
        >
          <div className="bg-white p-2 rounded-2xl shadow-xl border border-gray-100 flex items-center justify-center relative">
            <Bot size={32} className="text-blue-600" />
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 border-2 border-white rounded-full animate-pulse" />
            
            {/* Blinking Eyes Effect */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 flex gap-1.5">
              <motion.div 
                animate={{ scaleY: [1, 0.1, 1] }}
                transition={{ duration: 0.2, repeat: Infinity, repeatDelay: 3 }}
                className="w-1 h-1 bg-blue-600 rounded-full" 
              />
              <motion.div 
                animate={{ scaleY: [1, 0.1, 1] }}
                transition={{ duration: 0.2, repeat: Infinity, repeatDelay: 3 }}
                className="w-1 h-1 bg-blue-600 rounded-full" 
              />
            </div>
          </div>
          
          {/* Speech Bubble Hint */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="absolute -left-28 top-2 bg-white px-3 py-1.5 rounded-xl shadow-lg border border-gray-100 text-[10px] font-bold text-gray-600 whitespace-nowrap"
          >
            Need help? Ask me!
            <div className="absolute right-[-4px] top-1/2 -translate-y-1/2 w-2 h-2 bg-white border-r border-t border-gray-100 rotate-45" />
          </motion.div>
        </motion.div>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsOpen(!isOpen)}
          className="bg-blue-600 text-white p-5 rounded-3xl shadow-2xl hover:bg-blue-700 transition-all flex items-center justify-center relative z-10"
        >
          {isOpen ? <X size={28} /> : <MessageSquare size={28} />}
        </motion.button>
      </div>
    </div>
  );
}
