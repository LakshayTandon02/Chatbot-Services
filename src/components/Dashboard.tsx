import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  limit,
  Timestamp,
  serverTimestamp,
  where,
  updateDoc
} from 'firebase/firestore';
import { 
  LayoutDashboard, 
  Users, 
  Calendar, 
  Settings, 
  Save, 
  CheckCircle, 
  Clock, 
  TrendingUp,
  MessageCircle,
  LogOut,
  Shield,
  CreditCard,
  Code,
  ExternalLink,
  AlertCircle,
  Globe
} from 'lucide-react';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';
import Chatbot from './Chatbot';

declare global {
  interface Window {
    Razorpay: any;
  }
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      let message = "Something went wrong.";
      try {
        const errInfo = JSON.parse(this.state.error.message);
        if (errInfo.error) message = `Database Error: ${errInfo.error}`;
      } catch (e) {
        message = this.state.error.message || message;
      }

      return (
        <div className="p-8 text-center flex flex-col items-center justify-center h-screen bg-gray-50">
          <AlertCircle className="text-red-500 mb-4" size={64} />
          <h2 className="text-2xl font-bold mb-2 text-gray-900">Application Error</h2>
          <p className="text-gray-600 mb-8 max-w-md">{message}</p>
          <button 
            onClick={() => window.location.reload()}
            className="bg-blue-600 text-white px-8 py-3 rounded-2xl font-bold shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all"
          >
            Reload Application
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

interface UserProfile {
  id: string;
  email: string;
  role: 'admin' | 'client';
  trialStartDate: Timestamp;
  isPaid: boolean;
  paidUntil?: Timestamp;
  createdAt: Timestamp;
  paymentStatus?: 'trial' | 'pending' | 'paid';
  submittedTransactionId?: string;
  paymentSubmissionDate?: string;
}

interface Lead {
  id: string;
  businessId: string;
  name: string;
  phone: string;
  email?: string;
  status: string;
  createdAt: Timestamp;
}

interface Appointment {
  id: string;
  businessId: string;
  customerName: string;
  customerPhone: string;
  date: string;
  time: string;
  service: string;
  status: string;
  createdAt: Timestamp;
}

export default function Dashboard() {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'leads' | 'appointments' | 'settings' | 'whatsapp' | 'integration' | 'admin'>('overview');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [transactionId, setTransactionId] = useState('');
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const [businessInfo, setBusinessInfo] = useState({
    name: '',
    description: '',
    services: '',
    pricing: '',
    faqs: '',
    whatsappNumber: '',
    whatsappConfig: {
      phoneNumberId: '',
      accessToken: '',
      verifyToken: Math.random().toString(36).substring(2, 15)
    }
  });
  const [leads, setLeads] = useState<Lead[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [loading, setLoading] = useState(true);

  const [adminPassword, setAdminPassword] = useState('');
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false);
  const [globalSettings, setGlobalSettings] = useState({
    paymentUpiId: 'tandonlakshay6@okaxis',
    paymentQrBase64: '',
    subscriptionFee: 700
  });
  const [isUpdatingSettings, setIsUpdatingSettings] = useState(false);

  const isSuperAdmin = auth.currentUser?.email === 'lakshaytandon125@gmail.com';

  useEffect(() => {
    if (!auth.currentUser) return;

    const unsubProfile = onSnapshot(doc(db, 'users', auth.currentUser.uid), (doc) => {
      if (doc.exists()) {
        setUserProfile({ id: doc.id, ...doc.data() } as UserProfile);
      }
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${auth.currentUser?.uid}`);
      setLoading(false);
    });

    const fetchBusinessInfo = async () => {
      const docRef = doc(db, 'businesses', auth.currentUser!.uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setBusinessInfo(docSnap.data() as any);
      }
    };
    fetchBusinessInfo();

    // Fetch Global Settings
    const unsubSettings = onSnapshot(doc(db, 'config', 'global'), (doc) => {
      if (doc.exists()) {
        setGlobalSettings(doc.data() as any);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'config/global');
    });

    const leadsQuery = query(
      collection(db, 'leads'), 
      where('businessId', '==', auth.currentUser.uid),
      orderBy('createdAt', 'desc'), 
      limit(50)
    );
    const unsubLeads = onSnapshot(leadsQuery, (snapshot) => {
      setLeads(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Lead)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'leads');
    });

    const appointmentsQuery = query(
      collection(db, 'appointments'), 
      where('businessId', '==', auth.currentUser.uid),
      orderBy('createdAt', 'desc'), 
      limit(50)
    );
    const unsubAppointments = onSnapshot(appointmentsQuery, (snapshot) => {
      setAppointments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'appointments');
    });

    // If super admin, fetch all users
    let unsubAllUsers = () => {};
    if (isSuperAdmin) {
      const usersQuery = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
      unsubAllUsers = onSnapshot(usersQuery, (snapshot) => {
        setAllUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserProfile)));
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'users');
      });
    }

    return () => {
      unsubProfile();
      unsubLeads();
      unsubAppointments();
      unsubAllUsers();
    };
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    setIsSaving(true);
    setSaveStatus('idle');
    try {
      await setDoc(doc(db, 'businesses', auth.currentUser.uid), {
        ...businessInfo,
        ownerId: auth.currentUser.uid,
        updatedAt: serverTimestamp()
      });
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `businesses/${auth.currentUser.uid}`);
      setSaveStatus('error');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleUserPayment = async (userId: string, currentStatus: boolean) => {
    try {
      await updateDoc(doc(db, 'users', userId), {
        isPaid: !currentStatus
      });
    } catch (error) {
      console.error("Failed to update payment status:", error);
    }
  };

  const checkTrialStatus = () => {
    if (!userProfile) return { expired: false, daysLeft: 7, status: 'trial' };
    
    const now = new Date().getTime();

    // Check if paid and not expired
    if (userProfile.isPaid && userProfile.paidUntil) {
      const until = userProfile.paidUntil.toDate().getTime();
      if (now < until) {
        const diff = until - now;
        const daysLeft = Math.ceil(diff / (1000 * 60 * 60 * 24));
        return { expired: false, daysLeft, status: 'paid' };
      }
    }
    
    // Check trial
    const start = userProfile.trialStartDate.toDate().getTime();
    const diff = now - start;
    const daysPassed = Math.floor(diff / (1000 * 60 * 60 * 24));
    const daysLeft = 7 - daysPassed;
    
    return {
      expired: daysLeft <= 0,
      daysLeft: Math.max(0, daysLeft),
      status: 'trial'
    };
  };

  const trial = checkTrialStatus();

  const handlePayment = () => {
    setShowPaymentModal(true);
  };

  const submitPaymentVerification = async () => {
    if (!transactionId.trim() || !auth.currentUser) {
      alert("Please enter Transaction ID / UTR Number");
      return;
    }

    setIsSubmittingPayment(true);
    const path = `users/${auth.currentUser.uid}`;
    try {
      await updateDoc(doc(db, 'users', auth.currentUser.uid), {
        paymentStatus: 'pending',
        submittedTransactionId: transactionId,
        paymentSubmissionDate: new Date().toISOString()
      });
      alert("Payment details submitted! Admin will verify and activate your account shortly.");
      setShowPaymentModal(false);
      setTransactionId('');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  const handleQrUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setGlobalSettings(prev => ({ ...prev, paymentQrBase64: reader.result as string }));
    };
    reader.readAsDataURL(file);
  };

  const saveGlobalSettings = async () => {
    setIsUpdatingSettings(true);
    try {
      await setDoc(doc(db, 'config', 'global'), globalSettings);
      alert("Global settings updated successfully!");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'config/global');
    } finally {
      setIsUpdatingSettings(false);
    }
  };

  if (loading) return <div className="h-screen flex items-center justify-center">Loading Dashboard...</div>;

  return (
    <ErrorBoundary>
      <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg text-white">
              <Shield size={20} />
            </div>
            <h1 className="font-bold text-xl tracking-tight text-gray-900">Code Ignite Media</h1>
          </div>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          {[
            { id: 'overview', label: 'Overview', icon: LayoutDashboard },
            { id: 'leads', label: 'Leads', icon: Users },
            { id: 'appointments', label: 'Appointments', icon: Calendar },
            { id: 'settings', label: 'AI Training', icon: Settings },
            { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
            { id: 'integration', label: 'Integration', icon: Code },
            ...(isSuperAdmin ? [{ id: 'admin', label: 'Super Admin', icon: Shield }] : []),
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as any)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all",
                activeTab === item.id 
                  ? "bg-blue-50 text-blue-600 shadow-sm" 
                  : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
              )}
            >
              <item.icon size={18} />
              {item.label}
            </button>
          ))}
        </nav>

        {/* Trial Status */}
        {!isSuperAdmin && (
          <div className="p-4 mx-4 mb-4 bg-gray-50 rounded-2xl border border-gray-100">
            <div className="flex items-center gap-2 mb-2">
              <Clock size={14} className="text-blue-600" />
              <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">Trial Status</span>
            </div>
            {trial.status === 'paid' ? (
              <div className="space-y-2">
                <p className="text-xs text-green-600 font-bold flex items-center gap-1">
                  <CheckCircle size={12} />
                  Premium Active
                </p>
                <p className="text-[10px] text-gray-500">{trial.daysLeft} days remaining</p>
              </div>
            ) : trial.expired ? (
              <div className="space-y-2">
                <p className="text-xs text-red-500 font-medium">Trial Expired</p>
                <button 
                  onClick={handlePayment}
                  className="w-full bg-blue-600 text-white text-[10px] font-bold py-2 rounded-lg hover:bg-blue-700 transition-all"
                >
                  Pay ₹700/mo
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider">
                  <span className="text-blue-600">Free Trial</span>
                  <span className="text-gray-400">{trial.daysLeft}d left</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-blue-600 rounded-full transition-all duration-1000" 
                    style={{ width: `${(trial.daysLeft / 7) * 100}%` }}
                  />
                </div>
                <button 
                  onClick={handlePayment}
                  className="w-full bg-blue-50 text-blue-600 text-[10px] font-bold py-2 rounded-lg hover:bg-blue-100 transition-all mt-2"
                >
                  Upgrade Now
                </button>
              </div>
            )}
          </div>
        )}

        <div className="p-4 border-t border-gray-100">
          <button 
            onClick={() => auth.signOut()}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 transition-all"
          >
            <LogOut size={18} />
            Logout
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-8">
        {trial.expired && !isSuperAdmin && (
          <div className="mb-8 p-6 bg-gradient-to-r from-red-50 to-orange-50 border border-red-100 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-6 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="bg-red-100 p-3 rounded-xl text-red-600">
                <AlertCircle size={32} />
              </div>
              <div>
                <h3 className="font-bold text-red-900 text-lg">Your 7-Day Trial has Ended</h3>
                <p className="text-red-700 text-sm">Upgrade to Premium for just ₹700/month to keep your AI chatbot active and access all features.</p>
              </div>
            </div>
            <button 
              onClick={handlePayment}
              className="whitespace-nowrap bg-blue-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 flex items-center gap-2"
            >
              <CreditCard size={18} />
              Upgrade Now • ₹700/mo
            </button>
          </div>
        )}

        <header className="mb-8 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 capitalize">{activeTab}</h2>
            <p className="text-gray-500 text-sm">Manage your business AI and customer interactions.</p>
          </div>
        </header>

        {/* Payment Modal */}
        {showPaymentModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden"
            >
              <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-6 text-white text-center">
                <h3 className="text-xl font-bold">Scan & Pay</h3>
                <p className="text-blue-100 text-sm">₹700 for Monthly Premium Plan</p>
              </div>
              
              <div className="p-8 text-center">
                <div className="bg-gray-50 p-4 rounded-2xl border-2 border-dashed border-gray-200 mb-6 inline-block">
                  {globalSettings.paymentQrBase64 ? (
                    <img 
                      src={globalSettings.paymentQrBase64} 
                      alt="Payment QR Code"
                      className="w-48 h-48 mx-auto object-contain"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <img 
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=upi://pay?pa=${globalSettings.paymentUpiId}&pn=Code%20Ignite%20Media&am=${globalSettings.subscriptionFee}&cu=INR`} 
                      alt="Payment QR Code"
                      className="w-48 h-48 mx-auto"
                      referrerPolicy="no-referrer"
                    />
                  )}
                </div>
                
                <div className="space-y-4 text-left">
                  <div className="bg-blue-50 p-3 rounded-xl border border-blue-100 mb-4">
                    <p className="text-[10px] font-bold text-blue-600 uppercase mb-1">UPI ID</p>
                    <p className="text-sm font-mono text-blue-900">{globalSettings.paymentUpiId}</p>
                  </div>
                  
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Transaction ID / UTR Number</label>
                    <input 
                      type="text"
                      value={transactionId}
                      onChange={(e) => setTransactionId(e.target.value)}
                      placeholder="Enter 12-digit UTR number"
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  
                  <button 
                    onClick={submitPaymentVerification}
                    disabled={isSubmittingPayment}
                    className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 disabled:opacity-50"
                  >
                    {isSubmittingPayment ? 'Submitting...' : 'I Have Paid'}
                  </button>
                  
                  <button 
                    onClick={() => setShowPaymentModal(false)}
                    className="w-full text-gray-400 text-sm font-medium hover:text-gray-600 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
              
              <div className="bg-gray-50 p-4 text-center">
                <p className="text-[10px] text-gray-400">
                  Account will be activated within 2-4 hours after verification.
                </p>
              </div>
            </motion.div>
          </div>
        )}

        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Payment Info Card - Always visible for non-paid or trial users */}
            {(trial.status === 'trial' || trial.expired) && (
              <div className="md:col-span-3 bg-gradient-to-r from-blue-600 to-indigo-700 p-6 rounded-3xl text-white shadow-xl flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-6">
                  <div className="bg-white p-3 rounded-2xl shadow-lg shrink-0">
                    {globalSettings.paymentQrBase64 ? (
                      <img src={globalSettings.paymentQrBase64} alt="QR" className="w-24 h-24 object-contain" referrerPolicy="no-referrer" />
                    ) : (
                      <img src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=upi://pay?pa=${globalSettings.paymentUpiId}&pn=Code%20Ignite%20Media&am=${globalSettings.subscriptionFee}&cu=INR`} alt="QR" className="w-24 h-24" referrerPolicy="no-referrer" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-xl font-bold mb-1">Upgrade to Premium</h3>
                    <p className="text-blue-100 text-sm mb-3">Get unlimited chatbot access and WhatsApp integration for ₹700/month.</p>
                    <div className="flex items-center gap-3">
                      <div className="bg-white/10 px-3 py-1.5 rounded-xl backdrop-blur-sm border border-white/10">
                        <p className="text-[10px] font-bold uppercase text-blue-200">UPI ID</p>
                        <p className="text-sm font-mono font-bold">{globalSettings.paymentUpiId}</p>
                      </div>
                      <div className="bg-white/10 px-3 py-1.5 rounded-xl backdrop-blur-sm border border-white/10">
                        <p className="text-[10px] font-bold uppercase text-blue-200">Fee</p>
                        <p className="text-sm font-bold">₹{globalSettings.subscriptionFee}/mo</p>
                      </div>
                    </div>
                  </div>
                </div>
                <button 
                  onClick={handlePayment}
                  className="bg-white text-blue-600 px-8 py-4 rounded-2xl font-bold hover:bg-blue-50 transition-all shadow-xl shadow-blue-900/20 whitespace-nowrap"
                >
                  Submit Payment Details
                </button>
              </div>
            )}

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <div className="flex justify-between items-start mb-4">
                <div className="bg-blue-50 p-3 rounded-xl text-blue-600">
                  <Users size={24} />
                </div>
              </div>
              <h3 className="text-gray-500 text-sm font-medium">Total Leads</h3>
              <p className="text-3xl font-bold text-gray-900 mt-1">{leads.length}</p>
            </div>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <div className="flex justify-between items-start mb-4">
                <div className="bg-purple-50 p-3 rounded-xl text-purple-600">
                  <Calendar size={24} />
                </div>
              </div>
              <h3 className="text-gray-500 text-sm font-medium">Appointments</h3>
              <p className="text-3xl font-bold text-gray-900 mt-1">{appointments.length}</p>
            </div>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <div className="flex justify-between items-start mb-4">
                <div className="bg-orange-50 p-3 rounded-xl text-orange-600">
                  <CreditCard size={24} />
                </div>
              </div>
              <h3 className="text-gray-500 text-sm font-medium">Plan</h3>
              <p className="text-xl font-bold text-gray-900 mt-1">
                {userProfile?.isPaid ? 'Premium (₹700/mo)' : '7-Day Trial'}
              </p>
            </div>

            <div className="md:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                <h3 className="font-bold text-gray-900">Recent Leads</h3>
              </div>
              <div className="divide-y divide-gray-100">
                {leads.slice(0, 5).map((lead) => (
                  <div key={lead.id} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center font-bold text-gray-600">
                        {lead.name[0]}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">{lead.name}</p>
                        <p className="text-xs text-gray-500">{lead.phone}</p>
                      </div>
                    </div>
                    <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase bg-blue-100 text-blue-600">
                      {lead.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-gradient-to-br from-green-600 to-green-700 rounded-2xl shadow-lg p-6 text-white flex flex-col justify-between">
              <div>
                <div className="bg-white/20 w-12 h-12 rounded-xl flex items-center justify-center mb-4 backdrop-blur-sm">
                  <MessageCircle size={24} />
                </div>
                <h3 className="text-xl font-bold mb-2">WhatsApp AI</h3>
                <p className="text-green-50 text-sm leading-relaxed mb-4">
                  Connect your AI to WhatsApp and automate 24/7 customer support on the world's most popular messaging app.
                </p>
              </div>
              <button 
                onClick={() => setActiveTab('whatsapp')}
                className="bg-white text-green-700 font-bold py-3 rounded-xl hover:bg-green-50 transition-all text-sm flex items-center justify-center gap-2"
              >
                Setup WhatsApp <ExternalLink size={16} />
              </button>
            </div>
          </div>
        )}

        {activeTab === 'leads' && !trial.expired && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Customer</th>
                  <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Contact</th>
                  <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {leads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-gray-50 transition-colors">
                    <td className="p-4 font-medium text-gray-900">{lead.name}</td>
                    <td className="p-4 text-sm text-gray-600">{lead.phone}</td>
                    <td className="p-4">
                      <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase bg-blue-100 text-blue-600">
                        {lead.status}
                      </span>
                    </td>
                    <td className="p-4 text-sm text-gray-500">{lead.createdAt?.toDate().toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'settings' && !trial.expired && (
          <div className="max-w-3xl">
            <form onSubmit={handleSaveSettings} className="space-y-6">
              <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 space-y-6">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Business Name</label>
                  <input
                    type="text"
                    value={businessInfo.name}
                    onChange={(e) => setBusinessInfo({...businessInfo, name: e.target.value})}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Business Description</label>
                  <textarea
                    value={businessInfo.description}
                    onChange={(e) => setBusinessInfo({...businessInfo, description: e.target.value})}
                    rows={3}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Services & Pricing</label>
                  <textarea
                    value={businessInfo.services}
                    onChange={(e) => setBusinessInfo({...businessInfo, services: e.target.value})}
                    rows={4}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">WhatsApp Number (with country code)</label>
                  <input
                    type="text"
                    value={businessInfo.whatsappNumber}
                    onChange={(e) => setBusinessInfo({...businessInfo, whatsappNumber: e.target.value})}
                    placeholder="e.g. 919876543210"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">FAQs</label>
                  <textarea
                    value={businessInfo.faqs}
                    onChange={(e) => setBusinessInfo({...businessInfo, faqs: e.target.value})}
                    rows={6}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
                >
                  {isSaving ? <Clock className="animate-spin" size={20} /> : <Save size={20} />}
                  Update AI Knowledge
                </button>
              </div>
            </form>
          </div>
        )}

        {activeTab === 'whatsapp' && !trial.expired && (
          <div className="max-w-4xl space-y-8">
            <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
              <div className="flex items-start justify-between mb-8">
                <div className="flex items-center gap-4">
                  <div className="bg-green-100 p-4 rounded-2xl text-green-600">
                    <MessageCircle size={32} />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-gray-900">WhatsApp Business API Configuration</h3>
                    <p className="text-gray-500">Connect your AI to WhatsApp Business API.</p>
                  </div>
                </div>
                <span className="bg-green-100 text-green-700 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider">
                  Official Integration
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <p className="text-sm text-gray-600 leading-relaxed">
                    Follow these steps to connect your AI:
                  </p>
                  <ol className="text-sm text-gray-500 space-y-4 list-decimal pl-5">
                    <li>Create an app on <a href="https://developers.facebook.com" target="_blank" className="text-blue-600 underline">Meta for Developers</a>.</li>
                    <li>Add the <strong>WhatsApp</strong> product to your app.</li>
                    <li>Configure the <strong>Webhook</strong> using the details on the right.</li>
                    <li>Enter your <strong>Phone Number ID</strong> and <strong>Access Token</strong> below.</li>
                  </ol>

                  <div className="space-y-4 pt-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Phone Number ID</label>
                      <input 
                        type="text"
                        value={businessInfo.whatsappConfig?.phoneNumberId || ''}
                        onChange={(e) => setBusinessInfo(prev => ({ 
                          ...prev, 
                          whatsappConfig: { ...prev.whatsappConfig, phoneNumberId: e.target.value } 
                        }))}
                        placeholder="e.g. 106555555555555"
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-2">System User Access Token</label>
                      <input 
                        type="password"
                        value={businessInfo.whatsappConfig?.accessToken || ''}
                        onChange={(e) => setBusinessInfo(prev => ({ 
                          ...prev, 
                          whatsappConfig: { ...prev.whatsappConfig, accessToken: e.target.value } 
                        }))}
                        placeholder="EAAB..."
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                    <button 
                      onClick={handleSaveSettings}
                      disabled={isSaving}
                      className="bg-green-600 text-white font-bold px-8 py-3 rounded-xl hover:bg-green-700 transition-all disabled:opacity-50"
                    >
                      {isSaving ? 'Saving...' : 'Save WhatsApp Config'}
                    </button>
                  </div>
                </div>

                <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100 space-y-6">
                  <h4 className="font-bold text-gray-900 text-sm">Webhook Settings (Meta Dashboard)</h4>
                  
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Callback URL</label>
                    <div className="flex gap-2">
                      <input 
                        readOnly
                        value={`${window.location.origin}/api/whatsapp/webhook/${auth.currentUser?.uid}`}
                        className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono text-gray-600"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Verify Token</label>
                    <div className="flex gap-2">
                      <input 
                        readOnly
                        value={businessInfo.whatsappConfig?.verifyToken || ''}
                        className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono text-gray-600"
                      />
                    </div>
                  </div>

                  <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                    <p className="text-[10px] text-blue-700 leading-relaxed">
                      <strong>Note:</strong> In the Meta Dashboard, subscribe to the <code>messages</code> webhook field under WhatsApp Business Account.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        {activeTab === 'integration' && (
          <div className="max-w-3xl space-y-6">
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <Globe size={20} className="text-blue-600" />
                Website Integration
              </h3>
              <p className="text-sm text-gray-500 mb-4">Copy and paste this code snippet into your website's <code>&lt;head&gt;</code> tag to enable the chatbot.</p>
              <div className="bg-gray-900 p-4 rounded-xl relative group">
                <pre className="text-xs text-blue-400 overflow-x-auto">
{`<script>
  window.BIZ_AI_CONFIG = {
    businessId: "${auth.currentUser?.uid}"
  };
</script>
<script src="https://codeignitemedia.com/sdk/v1/chatbot.js" async></script>`}
                </pre>
                <button className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors">
                  <Save size={16} />
                </button>
              </div>
            </div>

            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <MessageCircle size={20} className="text-green-600" />
                WhatsApp "Click to Chat" Button
              </h3>
              <p className="text-sm text-gray-500 mb-4">Add a direct link to your AI-powered WhatsApp bot on your website.</p>
              <div className="bg-gray-900 p-4 rounded-xl relative group">
                <pre className="text-xs text-green-400 overflow-x-auto">
{`<a href="https://wa.me/${businessInfo.whatsappNumber || 'YOUR_NUMBER'}" 
   target="_blank" 
   style="background:#25D366; color:white; padding:10px 20px; border-radius:50px; text-decoration:none; font-weight:bold; display:inline-flex; align-items:center; gap:8px;">
  <img src="https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg" width="20" height="20" />
  Chat with AI on WhatsApp
</a>`}
                </pre>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'admin' && isSuperAdmin && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              {!isAdminUnlocked ? (
                <div className="p-12 text-center max-w-md mx-auto">
                  <Shield className="mx-auto text-blue-600 mb-4" size={48} />
                  <h3 className="text-xl font-bold mb-4">Super Admin Access</h3>
                  <input 
                    type="password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="Enter Admin Password"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 mb-4 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  <button 
                    onClick={() => {
                      if (adminPassword === 'Kashikay@162004') {
                        setIsAdminUnlocked(true);
                      } else {
                        alert("Incorrect Password");
                      }
                    }}
                    className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 transition-all"
                  >
                    Unlock Admin Panel
                  </button>
                </div>
              ) : (
                <>
                  <div className="p-6 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                    <h3 className="font-bold text-gray-900">User Management (Super Admin)</h3>
                    <div className="flex gap-2">
                      <span className="bg-blue-100 text-blue-600 px-3 py-1 rounded-full text-[10px] font-bold uppercase">
                        {allUsers.length} Total Users
                      </span>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                          <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">User</th>
                          <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Trial Start</th>
                          <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Payment Info</th>
                          <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                          <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {allUsers.map((u) => (
                          <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                            <td className="p-4">
                              <p className="font-medium text-gray-900">{u.email}</p>
                              <p className="text-[10px] text-gray-400 uppercase">{u.role}</p>
                            </td>
                            <td className="p-4 text-sm text-gray-500">{u.trialStartDate?.toDate().toLocaleDateString()}</td>
                            <td className="p-4">
                              {u.paymentStatus === 'pending' ? (
                                <div className="bg-yellow-50 p-2 rounded-lg border border-yellow-100">
                                  <p className="text-[10px] font-bold text-yellow-700 uppercase">Pending Verification</p>
                                  <p className="text-xs font-mono text-yellow-600">UTR: {u.submittedTransactionId}</p>
                                </div>
                              ) : (
                                <p className="text-xs text-gray-400">{u.isPaid ? 'Paid Member' : 'Trialing'}</p>
                              )}
                            </td>
                            <td className="p-4">
                              <span className={cn(
                                "px-3 py-1 rounded-full text-[10px] font-bold uppercase",
                                u.isPaid ? "bg-green-100 text-green-600" : "bg-orange-100 text-orange-600"
                              )}>
                                {u.isPaid ? 'Paid' : 'Trial'}
                              </span>
                            </td>
                            <td className="p-4">
                              <button 
                                onClick={async () => {
                                  const path = `users/${u.id}`;
                                  try {
                                    const newIsPaid = !u.isPaid;
                                    const thirtyDaysFromNow = new Date();
                                    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

                                    await updateDoc(doc(db, 'users', u.id), {
                                      isPaid: newIsPaid,
                                      paymentStatus: newIsPaid ? 'paid' : 'trial',
                                      paidUntil: newIsPaid ? Timestamp.fromDate(thirtyDaysFromNow) : null
                                    });
                                    alert(`User status updated! ${newIsPaid ? 'Access granted for 30 days.' : 'Access revoked.'}`);
                                  } catch (error) {
                                    handleFirestoreError(error, OperationType.UPDATE, path);
                                  }
                                }}
                                className={cn(
                                  "px-4 py-2 rounded-lg text-xs font-bold transition-all",
                                  u.isPaid 
                                    ? "bg-red-50 text-red-600 hover:bg-red-100" 
                                    : "bg-green-600 text-white hover:bg-green-700"
                                )}
                              >
                                {u.isPaid ? 'Revoke Access' : 'Mark as Paid'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            {isAdminUnlocked && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
                <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                  <Settings size={20} className="text-blue-600" />
                  Global Payment Settings
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-2">UPI ID for Payments</label>
                      <input 
                        type="text"
                        value={globalSettings.paymentUpiId}
                        onChange={(e) => setGlobalSettings(prev => ({ ...prev, paymentUpiId: e.target.value }))}
                        placeholder="e.g. name@okaxis"
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Monthly Subscription Fee (₹)</label>
                      <input 
                        type="number"
                        value={globalSettings.subscriptionFee}
                        onChange={(e) => setGlobalSettings(prev => ({ ...prev, subscriptionFee: parseInt(e.target.value) }))}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>

                    <button 
                      onClick={saveGlobalSettings}
                      disabled={isUpdatingSettings}
                      className="bg-blue-600 text-white font-bold px-8 py-3 rounded-xl hover:bg-blue-700 transition-all disabled:opacity-50"
                    >
                      {isUpdatingSettings ? 'Saving...' : 'Save Settings'}
                    </button>
                  </div>

                  <div className="space-y-4">
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Upload Custom QR Code</label>
                    <div className="border-2 border-dashed border-gray-200 rounded-2xl p-8 text-center hover:border-blue-400 transition-colors cursor-pointer relative group">
                      <input 
                        type="file" 
                        accept="image/*"
                        onChange={handleQrUpload}
                        className="absolute inset-0 opacity-0 cursor-pointer z-10"
                      />
                      {globalSettings.paymentQrBase64 ? (
                        <div className="relative inline-block">
                          <img 
                            src={globalSettings.paymentQrBase64} 
                            alt="Preview" 
                            className="w-32 h-32 mx-auto object-contain rounded-lg"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-lg">
                            <p className="text-white text-[10px] font-bold">Change Image</p>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto">
                            <Save size={24} />
                          </div>
                          <p className="text-xs text-gray-500">Click to upload QR Code image</p>
                          <p className="text-[10px] text-gray-400">Supports JPG, PNG, WEBP</p>
                        </div>
                      )}
                    </div>
                    <p className="text-[10px] text-gray-400 italic">
                      Note: If no image is uploaded, a QR code will be automatically generated using the UPI ID provided.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      <Chatbot businessId={auth.currentUser?.uid} />
    </div>
    </ErrorBoundary>
  );
}
