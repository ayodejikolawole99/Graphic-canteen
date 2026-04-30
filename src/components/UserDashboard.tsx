import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { CheckCircle2, Fingerprint, Printer, ShieldCheck, Ticket, XCircle, Cpu } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import React, { useState, useCallback } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { UserProfile } from '../types';
import { useHardwareScanner } from '../hooks/useHardwareScanner';
import { LOGO_URL } from '../constants';

interface UserDashboardProps {
  profile: UserProfile;
  isKiosk?: boolean;
}

export default function UserDashboard({ profile, isKiosk = false }: UserDashboardProps) {
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<'success' | 'fail' | null>(null);
  const [lastTicket, setLastTicket] = useState<{ id: string, time: Date } | null>(null);
  const [balance, setBalance] = useState(profile.ticketsBalance);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [verificationToken, setVerificationToken] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [scannerStatus, setScannerStatus] = useState<'idle' | 'detected'>('idle');

  // Automatic reset for Kiosk Mode
  React.useEffect(() => {
    if (!isKiosk) return;
    
    // If any state changes (scanning, show modal, scan result), start a timeout
    if (scanning || showVerifyModal || scanResult) {
      const timer = setTimeout(() => {
        setScanning(false);
        setScanResult(null);
        setShowVerifyModal(false);
        setVerificationToken('');
      }, 8000);
      
      return () => clearTimeout(timer);
    }
  }, [isKiosk, scanning, showVerifyModal, scanResult]);

  const handleVerify = useCallback(async (e?: React.FormEvent | string) => {
    if (typeof e !== 'string') {
      e?.preventDefault();
    }
    const token = typeof e === 'string' ? e : verificationToken;
    
    setIsVerifying(true);
    setScanning(false);
    setShowVerifyModal(true);
    if (typeof e === 'string') setVerificationToken(token);

    // Simulate cryptographic processing
    setTimeout(async () => {
      try {
        if (token !== profile.biometricToken && profile.biometricToken !== undefined) {
          throw new Error('Biometric token mismatch');
        }

        const attendanceRef = collection(db, 'attendance');
        const newDoc = await addDoc(attendanceRef, {
          userId: profile.id,
          userName: profile.name,
          department: profile.department,
          timestamp: serverTimestamp(),
          mealType: getCurrentMealType(),
        });

        const userRef = doc(db, 'users', profile.id);
        const newBalance = balance - 1;
        await updateDoc(userRef, {
          ticketsBalance: newBalance
        });

        setBalance(newBalance);
        setScanResult('success');
        const ticketId = newDoc.id.slice(-6).toUpperCase();
        setLastTicket({ id: ticketId, time: new Date() });
        setShowVerifyModal(false);
        setVerificationToken('');

        // Trigger automatic POS print
        setTimeout(() => {
          window.print();
        }, 500);

        // Auto-reset for kiosk
        if (isKiosk) {
          setTimeout(() => setScanResult(null), 8000);
        }
      } catch (err) {
        setScanResult('fail');
        setShowVerifyModal(false);
        setVerificationToken('');
        
        if (isKiosk) {
          setTimeout(() => setScanResult(null), 5000);
        }
      } finally {
        setIsVerifying(false);
      }
    }, 1500);
  }, [balance, profile, verificationToken, isKiosk]);

  // Hardware Scanner Integration
  useHardwareScanner({
    onScan: (token) => {
      setScannerStatus('detected');
      handleVerify(token);
      setTimeout(() => setScannerStatus('idle'), 2000);
    },
    minChars: 3
  });

  const startScan = async () => {
    if (balance <= 0) {
      alert("No tickets remaining for this week. Please contact admin.");
      return;
    }

    setScanning(true);
    setScanResult(null);

    // Simulated scan delay to build tension
    setTimeout(() => {
      setScanning(false);
      setShowVerifyModal(true);
    }, 2500);
  };

  const getCurrentMealType = () => {
    const hour = new Date().getHours();
    if (hour < 11) return 'Breakfast';
    if (hour < 16) return 'Lunch';
    return 'Dinner';
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Profile Card */}
      <div className="lg:col-span-1 space-y-6">
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-slate-400">
              <Fingerprint className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">{profile.name}</h2>
              <p className="text-sm text-slate-500">{profile.department}</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-slate-50 p-4 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Ticket className="w-5 h-5 text-cyan-600" />
                <span className="text-sm font-medium text-slate-600">Tickets Left</span>
              </div>
              <span className="text-2xl font-bold text-slate-900 font-mono">{balance}</span>
            </div>
            
            <div className="flex justify-between text-xs text-slate-400 px-1">
              <span>Weekly Cap: {profile.weeklyAllocation}</span>
              <span>Status: Active</span>
            </div>
          </div>
        </div>

        {lastTicket && (
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-cyan-600 text-white p-6 rounded-2xl shadow-lg relative overflow-hidden group"
          >
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Printer className="w-4 h-4" />
                  <span className="text-xs font-bold uppercase tracking-wider opacity-80">Last Ticket Printed</span>
                </div>
                <button 
                  onClick={() => window.print()}
                  className="p-1 hover:bg-white/20 rounded-md transition-colors"
                  title="Re-print ticket"
                >
                  <Printer className="w-3 h-3" />
                </button>
              </div>
              <p className="text-2xl font-mono font-bold mb-1">#{lastTicket.id}</p>
              <p className="text-xs opacity-80">{lastTicket.time.toLocaleTimeString()}</p>
            </div>
            <Ticket className="absolute -right-4 -bottom-4 w-24 h-24 opacity-10 group-hover:rotate-12 transition-transform" />
          </motion.div>
        )}
      </div>

      {/* Scanner Section */}
      <div className="lg:col-span-2">
        <div className="bg-white rounded-2xl h-full min-h-[400px] border border-slate-200 p-8 flex flex-col items-center justify-center relative shadow-sm">
          {scanResult === 'success' ? (
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-center"
            >
              <div className="w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 className="w-12 h-12 text-emerald-600" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-2">Verified Successfully</h3>
              <p className="text-slate-500 mb-8">Your {getCurrentMealType()} ticket has been allocated and printed.</p>
              <button 
                onClick={() => setScanResult(null)}
                className="text-cyan-600 font-medium hover:underline"
              >
                Scan Another Member
              </button>
            </motion.div>
          ) : scanResult === 'fail' ? (
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-center"
            >
              <div className="w-24 h-24 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <XCircle className="w-12 h-12 text-red-600" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-2">Verification Failed</h3>
              <p className="text-slate-500 mb-8">Biometric data did not match or error occurred. Please try again.</p>
              <button 
                onClick={() => setScanResult(null)}
                className="bg-slate-900 text-white px-8 py-3 rounded-xl font-semibold"
              >
                Retry Scan
              </button>
            </motion.div>
          ) : (
            <>
              <div className="text-center mb-12">
                <h3 className="text-slate-400 font-bold uppercase tracking-widest text-xs mb-2">Biometric Authentication</h3>
                <p className="text-slate-900 font-medium font-serif italic text-xl">"Place your finger on the scanner"</p>
              </div>

              <div className="relative">
                <motion.div 
                  className={`w-64 h-80 rounded-3xl border-4 ${scanning ? 'border-cyan-400 bg-cyan-950/10' : 'border-slate-200 bg-slate-50'} flex items-center justify-center transition-all duration-500 shadow-inner`}
                  whileHover={!scanning ? { scale: 1.02 } : {}}
                >
                  <Fingerprint className={`w-32 h-32 ${scanning ? 'text-cyan-400' : 'text-slate-300'} transition-colors duration-500`} />
                  
                  {scanning && (
                    <div className="absolute inset-x-8 top-12 bottom-12 rounded-xl overflow-hidden pointer-events-none">
                      <div className="biometric-scanner-animation h-full w-full">
                        <div className="biometric-scanner-line" />
                      </div>
                    </div>
                  )}
                </motion.div>

                {!scanning && (
                  <button
                    onClick={startScan}
                    className="absolute inset-0 w-full h-full cursor-pointer opacity-0"
                    aria-label="Start biometric scan"
                  />
                )}
              </div>

              <div className="mt-12 text-center text-slate-400 text-sm flex flex-col items-center gap-4">
                {scanning ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-cyan-600" />
                    <span>Analyzing biometric patterns...</span>
                  </div>
                ) : (
                  <span>Scanner ready • Secure tunnel established</span>
                )}

                <AnimatePresence>
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${
                      scannerStatus === 'detected' 
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-600' 
                        : 'bg-slate-50 border-slate-200 text-slate-400'
                    } transition-colors`}
                  >
                    <Cpu className={`w-3 h-3 ${scannerStatus === 'detected' ? 'animate-pulse' : ''}`} />
                    <span className="text-[10px] font-bold uppercase tracking-wider">
                      {scannerStatus === 'detected' ? 'Hardware Scan Detected' : 'Hardware Scanner Link Active'}
                    </span>
                  </motion.div>
                </AnimatePresence>
              </div>
            </>
          )}
        </div>
      </div>
      {/* Verification Modal */}
      {showVerifyModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl w-full max-w-sm p-8 shadow-2xl relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-slate-100">
              {isVerifying && (
                <motion.div 
                  className="h-full bg-cyan-500"
                  initial={{ width: 0 }}
                  animate={{ width: '100%' }}
                  transition={{ duration: 1.5 }}
                />
              )}
            </div>

            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-cyan-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <ShieldCheck className="w-8 h-8 text-cyan-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-900">Final Verification</h3>
              <p className="text-sm text-slate-500">Security protocol: Confirm biometric signature</p>
            </div>

            <form onSubmit={handleVerify} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Fingerprint Signature Hash</label>
                <div className="relative">
                  <Fingerprint className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                  <input 
                    type="password"
                    autoFocus
                    value={verificationToken}
                    onChange={(e) => setVerificationToken(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-cyan-500 transition-all font-mono text-sm"
                    placeholder="Enter biometric token..."
                    required
                    disabled={isVerifying}
                  />
                </div>
                {profile.biometricToken && (
                  <p className="text-[10px] text-slate-400 mt-2 italic text-center">
                    Hint: {profile.biometricToken}
                  </p>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <button 
                  type="button"
                  onClick={() => {
                    setShowVerifyModal(false);
                    setScanning(false);
                  }}
                  disabled={isVerifying}
                  className="flex-1 py-3 px-4 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-colors disabled:opacity-50"
                >
                  Abort
                </button>
                <button 
                  type="submit"
                  disabled={isVerifying}
                  className="flex-1 py-3 px-4 bg-cyan-600 text-white rounded-xl font-bold hover:bg-cyan-700 transition-colors shadow-lg shadow-cyan-100 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isVerifying ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Matching...
                    </>
                  ) : (
                    'Confirm'
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
      {/* POS Ticket Component (Hidden except during printing) */}
      {lastTicket && (
        <div id="pos-ticket" className="no-print">
          <div className="ticket-header">
            <img src={LOGO_URL} alt="Graphic Packaging" className="h-4 w-auto mx-auto mb-2" referrerPolicy="no-referrer" />
            <h1 className="font-bold uppercase tracking-tighter text-[10pt]">Graphic Packaging</h1>
            <p className="text-[7pt] font-sans">Official Meal Voucher</p>
          </div>
          
          <div className="ticket-body">
            <p className="font-sans text-[9pt]">{profile.name}</p>
            <p className="font-sans text-[8pt] opacity-70">{profile.department}</p>
            
            <div className="ticket-id tracking-widest text-[#000]">
              #{lastTicket.id}
            </div>
            
            <div className="my-2 p-1 border border-black border-dashed">
              <p className="font-bold text-[10pt] uppercase">{getCurrentMealType()}</p>
            </div>
          </div>

          <div className="ticket-footer">
            <p>{lastTicket.time.toLocaleDateString()} {lastTicket.time.toLocaleTimeString()}</p>
            <p className="mt-1 font-bold">CREDITS LEFT: {balance}</p>
            <p className="mt-4 text-[7pt] italic">System Verified Biometric</p>
          </div>
        </div>
      )}
    </div>
  );
}

function Loader2({ className }: { className?: string }) {
  return (
    <svg 
      className={className} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
