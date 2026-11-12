import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { Loader2, LogOut, ShieldCheck, User as UserIcon, CreditCard, Sparkles, Terminal } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import AdminDashboard from './components/AdminDashboard';
import UserDashboard from './components/UserDashboard';
import RfidKioskTerminal from './components/RfidKioskTerminal';
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
        employmentType: 'White collar staff',
        department: 'HR',
        role: 'admin',
        adminLevel: 2,
        status: 'active',
        ticketsBalance: 100,
        weeklyAllocation: 100,
        rfidCardId: `RFID-${user.uid.slice(0, 8).toUpperCase()}`,
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

  const [authError, setAuthError] = useState<string | null>(null);
  const [showManualLogin, setShowManualLogin] = useState(false);

  const handleManualLogin = async (adminId: string) => {
    setAuthError(null);
    setInitializing(true);
    try {
      const userRef = doc(db, 'users', adminId);
      const profileSnap = await getDoc(userRef);
      
      if (!profileSnap.exists()) {
        const name = adminId === 'admin_1' ? 'Admin Maker (L1)' : 'Admin Checker (L2)';
        const adminProfile = {
          id: adminId,
          name: name,
          employmentType: 'White collar staff',
          department: 'SHER',
          role: 'admin',
          adminLevel: adminId === 'admin_1' ? 1 : 2,
          status: 'active',
          ticketsBalance: 999,
          weeklyAllocation: 999,
          rfidCardId: adminId === 'admin_1' ? 'RFID-ADMIN-01' : 'RFID-ADMIN-02',
          email: `${adminId}@system.local`,
          createdAt: new Date().toISOString(),
        };
        await setDoc(userRef, adminProfile);
      }
      
      localStorage.setItem('manual_login_id', adminId);
      window.location.reload();
    } catch (error: any) {
      setAuthError('Manual login failed: ' + error.message);
    } finally {
      setInitializing(false);
    }
  };

  const handleLogin = async () => {
    setAuthError(null);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.error('Login failed:', error);
      setAuthError(error.message || 'Authentication failed. Please check your internet connection or if the domain is authorized in Firebase Console.');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('manual_login_id');
    signOut(auth);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 gap-4">
        <img src={LOGO_URL} alt="Logo" className="logo-bg" referrerPolicy="no-referrer" />
        <Loader2 className="w-12 h-12 text-cyan-600 animate-spin" />
        <p className="text-slate-500 font-medium">Initializing Canteen System...</p>
      </div>
    );
  }

  // Standalone / Counter Kiosk Terminal Mode
  if (activeTab === 'kiosk') {
    return (
      <RfidKioskTerminal
        onExit={() => {
          if (urlParams.get('view') === 'kiosk') {
            window.location.search = '';
          } else {
            setActiveTab('user');
          }
        }}
        isAdmin={profile?.role === 'admin'}
      />
    );
  }

  // Not Logged In View
  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-4 overflow-hidden relative">
        <img src={LOGO_URL} alt="Logo" className="logo-bg" referrerPolicy="no-referrer" />
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full text-center space-y-7 bg-white/80 backdrop-blur-md p-8 sm:p-10 rounded-3xl border border-slate-200/80 shadow-xl relative z-10"
        >
          <div className="flex flex-col items-center mb-2">
             <img src={LOGO_URL} alt="Graphic Packaging" className="h-10 w-auto mb-6" referrerPolicy="no-referrer" />
             <div className="bg-gradient-to-tr from-cyan-600 to-blue-600 w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg shadow-cyan-200 text-white">
               <CreditCard className="w-8 h-8" />
             </div>
          </div>

          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Canteen RFID & Meal Portal</h1>
            <p className="text-xs text-slate-500 mt-1">
              Contactless RFID card meal verification with 1-second queue throughput.
            </p>
          </div>

          {/* Quick Counter Kiosk Terminal Launcher */}
          <button
            onClick={() => setActiveTab('kiosk')}
            className="w-full flex items-center justify-center gap-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white px-6 py-3.5 rounded-2xl font-bold transition-all shadow-lg shadow-cyan-200"
          >
            <CreditCard className="w-5 h-5" />
            <span>Launch Counter RFID Terminal</span>
          </button>
          
          <div className="relative py-2">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-slate-200"></span>
            </div>
            <div className="relative flex justify-center text-[10px] uppercase">
              <span className="bg-white px-3 text-slate-400 font-bold tracking-wider">Employee & Admin Portal</span>
            </div>
          </div>

          <button
            id="login-button"
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-3 bg-slate-900 text-white px-6 py-3 rounded-2xl font-semibold hover:bg-slate-800 transition-colors shadow-md text-xs"
          >
            <ShieldCheck className="w-4 h-4 text-cyan-400" />
            Sign In with Google Account
          </button>

          {!showManualLogin ? (
            <button 
              onClick={() => setShowManualLogin(true)}
              className="text-xs text-slate-400 hover:text-cyan-600 transition-colors block mx-auto"
            >
              Developer Admin Login Options
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => handleManualLogin('admin_1')}
                className="flex flex-col items-center gap-1.5 p-3 border border-slate-100 rounded-xl hover:bg-slate-50 transition-colors group"
              >
                <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center group-hover:bg-cyan-50">
                   <ShieldCheck className="w-4 h-4 text-slate-400 group-hover:text-cyan-600" />
                </div>
                <span className="text-[11px] font-bold text-slate-600">Admin 1 (Maker)</span>
              </button>
              <button
                onClick={() => handleManualLogin('admin_2')}
                className="flex flex-col items-center gap-1.5 p-3 border border-slate-100 rounded-xl hover:bg-slate-50 transition-colors group"
              >
                <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center group-hover:bg-cyan-50">
                   <ShieldCheck className="w-4 h-4 text-slate-400 group-hover:text-cyan-600" />
                </div>
                <span className="text-[11px] font-bold text-slate-600">Admin 2 (Checker)</span>
              </button>
            </div>
          )}

          {authError && (
             <motion.div 
               initial={{ opacity: 0, scale: 0.95 }}
               animate={{ opacity: 1, scale: 1 }}
               className="p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-xs text-left"
             >
               <strong>Authentication Error:</strong> {authError}
             </motion.div>
          )}
        </motion.div>
      </div>
    );
  }

  // Logged-in View
  return (
    <div className="min-h-screen bg-slate-50 relative">
      <img src={LOGO_URL} alt="Logo" className="logo-bg" referrerPolicy="no-referrer" />
      
      <header className="bg-white/85 backdrop-blur-md border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            
            {/* Logo & Brand */}
            <div className="flex items-center gap-3">
              <img src={LOGO_URL} alt="Graphic Packaging" className="h-6 w-auto" referrerPolicy="no-referrer" />
              <div className="h-5 w-px bg-slate-200 hidden xs:block" />
              <div className="flex items-center gap-2">
                <div className="bg-cyan-600 p-1.5 rounded-lg text-white">
                  <CreditCard className="w-4 h-4" />
                </div>
                <span className="font-bold text-slate-900 text-sm hidden sm:block">CanteenRFID Pro</span>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex items-center gap-2 sm:gap-4">
              <nav className="flex bg-slate-100 p-1 rounded-xl">
                <button
                  onClick={() => setActiveTab('user')}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    activeTab === 'user' 
                      ? 'bg-white text-cyan-600 shadow-sm' 
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <UserIcon className="w-4 h-4" />
                  <span>My Portal</span>
                </button>

                <button
                  onClick={() => setActiveTab('kiosk')}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    activeTab === 'kiosk' 
                      ? 'bg-white text-cyan-600 shadow-sm' 
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <CreditCard className="w-4 h-4" />
                  <span>RFID Tap Terminal</span>
                </button>

                {profile?.role === 'admin' && (
                  <button
                    onClick={() => setActiveTab('admin')}
                    className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      activeTab === 'admin' 
                        ? 'bg-white text-cyan-600 shadow-sm' 
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>Admin Center</span>
                  </button>
                )}
              </nav>

              <div className="h-6 w-px bg-slate-200 mx-1 hidden sm:block" />

              <button
                onClick={handleLogout}
                className="p-2 text-slate-400 hover:text-red-500 transition-colors rounded-lg hover:bg-slate-100"
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
           <div className="bg-amber-50 border border-amber-200 rounded-3xl p-8 mb-8 text-center max-w-2xl mx-auto shadow-sm">
             <h2 className="text-xl font-bold text-amber-900 mb-2">Unregistered Account</h2>
             <p className="text-amber-700 mb-6 text-sm">
               You are authenticated, but not yet registered in the Canteen system. Please ask your administrator to enroll your employee profile and issue your RFID meal card.
             </p>
             
             {user.email === 'ayodejikolawole99@gmail.com' && (
               <div className="pt-4 border-t border-amber-200">
                 <p className="text-xs font-semibold text-amber-800 mb-3">Detected Primary Owner Account. Initialize as Head Admin?</p>
                 <button
                    onClick={handleInitialize}
                    disabled={initializing}
                    className="bg-amber-600 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-amber-700 transition-colors disabled:opacity-50 flex items-center gap-2 mx-auto text-xs shadow-md"
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
