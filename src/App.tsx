import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { Fingerprint, Loader2, LogOut, ShieldCheck, User as UserIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import AdminDashboard from './components/AdminDashboard';
import UserDashboard from './components/UserDashboard';
import { useAuth } from './hooks/useAuth';
import { auth, db } from './lib/firebase';

import { LOGO_URL } from './constants';

export default function App() {
  const { user, profile, loading } = useAuth();
  const [initializing, setInitializing] = useState(false);
  
  // URL-based view management
  const urlParams = new URLSearchParams(window.location.search);
  const initialView = urlParams.get('view') === 'kiosk' ? 'kiosk' : (urlParams.get('view') === 'admin' ? 'admin' : 'user');
  const [activeTab, setActiveTab] = useState<'user' | 'admin' | 'kiosk'>(initialView);

  const handleInitialize = async () => {
    if (!user) return;
    setInitializing(true);
    try {
      const userRef = doc(db, 'users', user.uid);
      const newProfile = {
        id: user.uid,
        name: user.displayName || 'Head Admin',
        department: 'Management',
        role: 'admin',
        adminLevel: 2,
        status: 'active',
        ticketsBalance: 100,
        weeklyAllocation: 100,
        email: user.email,
        createdAt: new Date().toISOString(),
      };
      await setDoc(userRef, newProfile);
      window.location.reload(); 
    } catch (error) {
      console.error('Initialization failed:', error);
    } finally {
      setInitializing(false);
    }
  };

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Login failed:', error);
    }
  };

  const handleLogout = () => signOut(auth);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 gap-4">
        <img src={LOGO_URL} alt="Logo" className="logo-bg" referrerPolicy="no-referrer" />
        <Loader2 className="w-12 h-12 text-cyan-600 animate-spin" />
        <p className="text-slate-500 font-medium">Initializing Secure Access...</p>
      </div>
    );
  }

  // Kiosk mode view (No header/footer)
  if (user && activeTab === 'kiosk' && profile) {
    return (
      <div className="min-h-screen bg-white">
        <img src={LOGO_URL} alt="Logo" className="logo-bg" referrerPolicy="no-referrer" />
        <div className="max-w-7xl mx-auto p-4 sm:p-8">
          <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <img src={LOGO_URL} alt="Graphic Packaging" className="h-6 w-auto" referrerPolicy="no-referrer" />
              <div className="h-4 w-px bg-slate-300 mx-1" />
              <Fingerprint className="w-6 h-6 text-cyan-600" />
              <h1 className="font-bold text-slate-800 uppercase tracking-widest text-sm">Canteen Kiosk Terminal</h1>
            </div>
            <div className="flex items-center gap-4">
               <span className="text-xs font-mono text-slate-400">STATUS: ENCRYPTED • LINE ACTIVE</span>
               <button onClick={() => window.location.search = ''} className="text-xs text-slate-400 hover:text-slate-600">Exit Kiosk</button>
            </div>
          </div>
          <UserDashboard profile={profile} isKiosk={true} />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-white p-4 overflow-hidden">
        <img src={LOGO_URL} alt="Logo" className="logo-bg" referrerPolicy="no-referrer" />
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full text-center space-y-8"
        >
          <div className="flex flex-col items-center mb-4">
             <img src={LOGO_URL} alt="Graphic Packaging" className="h-12 w-auto mb-8" referrerPolicy="no-referrer" />
             <div className="bg-cyan-50 w-20 h-20 rounded-2xl flex items-center justify-center shadow-inner">
               <Fingerprint className="w-10 h-10 text-cyan-600" />
             </div>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Canteen Biometrics Pro</h1>
          <p className="text-slate-500">Secure biometric-authenticated meal ticketing system for efficient canteen management.</p>
          
          <button
            id="login-button"
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-3 bg-slate-900 text-white px-6 py-4 rounded-xl font-semibold hover:bg-slate-800 transition-colors shadow-lg shadow-slate-200"
          >
            <ShieldCheck className="w-5 h-5" />
            Continue with Secure Auth
          </button>
          
          <div className="text-xs text-slate-400 mt-8 space-y-2">
             <p>Admin? Please use your corporate credentials.</p>
             <button onClick={() => window.location.search = '?view=kiosk'} className="text-cyan-600 hover:underline">Deploy Canteen Kiosk</button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 relative">
      <img src={LOGO_URL} alt="Logo" className="logo-bg" referrerPolicy="no-referrer" />
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-3">
              <img src={LOGO_URL} alt="Graphic Packaging" className="h-6 w-auto" referrerPolicy="no-referrer" />
              <div className="h-6 w-px bg-slate-200 hidden xs:block" />
              <div className="flex items-center gap-2">
                <div className="bg-cyan-600 p-1 rounded-lg">
                  <Fingerprint className="w-4 h-4 text-white" />
                </div>
                <span className="font-bold text-slate-900 hidden md:block">CanteenBiometrics</span>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-4">
              <nav className="flex bg-slate-100 p-1 rounded-lg">
                <button
                  onClick={() => setActiveTab('user')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                    activeTab === 'user' 
                      ? 'bg-white text-cyan-600 shadow-sm' 
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <UserIcon className="w-4 h-4" />
                  <span className="hidden xs:block">Canteen Access</span>
                </button>
                {profile?.role === 'admin' && (
                  <button
                    onClick={() => setActiveTab('admin')}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                      activeTab === 'admin' 
                        ? 'bg-white text-cyan-600 shadow-sm' 
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span className="hidden xs:block">Administration</span>
                  </button>
                )}
              </nav>

              <div className="h-6 w-px bg-slate-200 mx-1 hidden sm:block" />

              <button
                onClick={handleLogout}
                className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                title="Logout"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {!profile && !loading && user && activeTab === 'user' && (
           <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 mb-8 text-center max-w-2xl mx-auto">
             <h2 className="text-xl font-bold text-amber-900 mb-2">Unregistered Account</h2>
             <p className="text-amber-700 mb-6">You are authenticated, but not yet registered in the Canteen system. Please contact an administrator to get your biometric ID and ticket allocation.</p>
             
             {user.email === 'ayodejikolawole99@gmail.com' && (
               <div className="pt-4 border-t border-amber-200">
                 <p className="text-sm font-medium text-amber-800 mb-4">Detected Developer Account. Initialize as Head Admin?</p>
                 <button
                    onClick={handleInitialize}
                    disabled={initializing}
                    className="bg-amber-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-amber-700 transition-colors disabled:opacity-50 flex items-center gap-2 mx-auto"
                 >
                   {initializing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                   Initialize Admin Profile
                 </button>
               </div>
             )}
             
             <div className="flex justify-center gap-4 text-xs font-mono text-amber-600 mt-6">
               <span>UID: {user.uid}</span>
             </div>
           </div>
        )}

        {profile && activeTab === 'user' ? (
          <UserDashboard profile={profile} />
        ) : (
          profile?.role === 'admin' ? <AdminDashboard /> : (user && activeTab === 'user' ? null : <div className="text-center py-20 text-slate-400">Unauthorized Access Attempt</div>)
        )}
      </main>
    </div>
  );
}
