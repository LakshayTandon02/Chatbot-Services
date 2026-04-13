import React, { useState, useEffect } from 'react';
import { auth, db } from './firebase';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, User } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import Dashboard from './components/Dashboard';
import Chatbot from './components/Chatbot';
import { 
  Bot, 
  Zap, 
  Shield, 
  BarChart3, 
  MessageSquare, 
  Phone, 
  Calendar, 
  ArrowRight,
  CheckCircle2,
  Globe,
  Users
} from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from './lib/utils';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Ensure user doc exists
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
          await setDoc(userRef, {
            email: user.email,
            role: user.email === 'lakshaytandon125@gmail.com' ? 'admin' : 'client',
            trialStartDate: serverTimestamp(),
            isPaid: false,
            createdAt: serverTimestamp()
          });
        }
      }
      setUser(user);
      setLoading(false);
    });
    return unsub;
  }, []);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500 font-medium">Loading BizAI...</p>
        </div>
      </div>
    );
  }

  if (user) {
    return <Dashboard />;
  }

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans selection:bg-blue-100">
      {/* Navigation */}
      <nav className="fixed top-0 w-full bg-white/80 backdrop-blur-md z-40 border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-2 rounded-lg text-white">
              <Bot size={24} />
            </div>
            <span className="text-2xl font-bold tracking-tight">Code Ignite Media</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-600">
            <a href="#features" className="hover:text-blue-600 transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-blue-600 transition-colors">How it Works</a>
            <button 
              onClick={handleLogin}
              className="bg-gray-900 text-white px-6 py-2.5 rounded-full hover:bg-gray-800 transition-all shadow-lg shadow-gray-200"
            >
              Dashboard Login
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-40 pb-20 px-6">
        <div className="max-w-7xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className="inline-block px-4 py-1.5 bg-blue-50 text-blue-600 rounded-full text-sm font-bold mb-6">
              The Future of Business Automation
            </span>
            <h1 className="text-6xl md:text-7xl font-extrabold tracking-tight mb-8 leading-[1.1]">
              The Ultimate <br />
              <span className="text-blue-600">AI Chatbot</span> Platform
            </h1>
            <p className="text-xl text-gray-500 max-w-2xl mx-auto mb-10 leading-relaxed">
              Build, train, and deploy custom AI chatbots for your business in minutes. 
              Like Botpress, but easier. 24/7 customer support, lead capture, and auto-booking.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button 
                onClick={handleLogin}
                className="w-full sm:w-auto bg-blue-600 text-white px-8 py-4 rounded-2xl font-bold text-lg hover:bg-blue-700 transition-all shadow-xl shadow-blue-200 flex items-center justify-center gap-2"
              >
                Get Started Free <ArrowRight size={20} />
              </button>
              <button className="w-full sm:w-auto bg-white text-gray-900 border border-gray-200 px-8 py-4 rounded-2xl font-bold text-lg hover:bg-gray-50 transition-all">
                Watch Demo
              </button>
            </div>
          </motion.div>

          {/* Dashboard Preview */}
          <motion.div 
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.8 }}
            className="mt-20 relative"
          >
            <div className="bg-gray-900 rounded-3xl p-4 shadow-2xl shadow-blue-100 border border-gray-800">
              <img 
                src="https://picsum.photos/seed/dashboard/1200/800" 
                alt="Dashboard Preview" 
                className="rounded-2xl opacity-80"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="bg-white/10 backdrop-blur-md p-6 rounded-2xl border border-white/20 text-white text-left max-w-xs">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                    <span className="text-xs font-bold uppercase tracking-widest">Live AI Activity</span>
                  </div>
                  <p className="text-sm font-medium leading-relaxed">
                    "AI just booked a new appointment for Acme Corp and captured a high-intent lead."
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8">
          {[
            { label: 'Active Bots', value: '10k+' },
            { label: 'Leads Captured', value: '2M+' },
            { label: 'Time Saved', value: '500k hrs' },
            { label: 'Customer Satisfaction', value: '99.9%' },
          ].map((stat, i) => (
            <div key={i} className="text-center">
              <p className="text-4xl font-extrabold text-gray-900 mb-2">{stat.value}</p>
              <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-32 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <h2 className="text-4xl font-bold mb-4">Everything you need to scale</h2>
            <p className="text-gray-500">Powerful features to automate your customer journey.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                title: 'Instant Replies',
                desc: 'AI instantly replies to customer queries on your website or WhatsApp, just like a receptionist.',
                icon: MessageSquare,
                color: 'bg-blue-50 text-blue-600'
              },
              {
                title: 'Lead Generation',
                desc: 'Automatically collect customer details like name, phone, and email during conversations.',
                icon: Users,
                color: 'bg-purple-50 text-purple-600'
              },
              {
                title: 'Auto Booking',
                desc: 'Let customers book appointments directly through the chat. Syncs with your dashboard.',
                icon: Calendar,
                color: 'bg-orange-50 text-orange-600'
              },
              {
                title: 'Smart Learning',
                desc: 'Upload your business docs, FAQs, and pricing. The AI learns everything in seconds.',
                icon: Zap,
                color: 'bg-yellow-50 text-yellow-600'
              },
              {
                title: 'Voice Support',
                desc: 'Enable customers to speak to your AI. Natural, human-like voice interactions.',
                icon: Phone,
                color: 'bg-green-50 text-green-600'
              },
              {
                title: 'Global Reach',
                desc: 'Support customers in 50+ languages automatically. Expand your business globally.',
                icon: Globe,
                color: 'bg-indigo-50 text-indigo-600'
              }
            ].map((feature, i) => (
              <div key={i} className="p-8 rounded-3xl border border-gray-100 hover:border-blue-100 hover:shadow-xl hover:shadow-blue-50 transition-all group">
                <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center mb-6 transition-transform group-hover:scale-110", feature.color)}>
                  <feature.icon size={28} />
                </div>
                <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
                <p className="text-gray-500 leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-32 px-6">
        <div className="max-w-5xl mx-auto bg-gray-900 rounded-[3rem] p-12 md:p-20 text-center text-white relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_50%,rgba(37,99,235,0.2),transparent)]" />
          <div className="relative z-10">
            <h2 className="text-4xl md:text-5xl font-bold mb-8">Ready to automate your business?</h2>
            <p className="text-xl text-gray-400 mb-10 max-w-xl mx-auto">
              Start your 7-day free trial today. After that, it's only ₹700/month to keep your AI employee working 24/7.
            </p>
            <button 
              onClick={handleLogin}
              className="bg-white text-gray-900 px-10 py-5 rounded-2xl font-bold text-lg hover:bg-gray-100 transition-all shadow-xl"
            >
              Start Your 7-Day Free Trial
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-20 border-t border-gray-100 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-2 rounded-lg text-white">
              <Bot size={20} />
            </div>
            <span className="text-xl font-bold tracking-tight">Code Ignite Media</span>
          </div>
          <p className="text-gray-500 text-sm">© 2024 Code Ignite Media Inc. All rights reserved.</p>
          <div className="flex gap-6 text-sm font-medium text-gray-600">
            <a href="#" className="hover:text-blue-600">Privacy</a>
            <a href="#" className="hover:text-blue-600">Terms</a>
            <a href="#" className="hover:text-blue-600">Contact</a>
          </div>
        </div>
      </footer>

      {/* Chatbot Widget */}
      <Chatbot businessId={user?.uid} />
    </div>
  );
}
