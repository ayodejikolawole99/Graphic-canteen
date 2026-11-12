import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { 
  CheckCircle2, 
  Printer, 
  Ticket, 
  XCircle, 
  CreditCard, 
  Radio, 
  Sparkles, 
  Building2,
  Briefcase
} from 'lucide-react';
import { motion } from 'motion/react';
import React, { useState, useCallback } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { UserProfile } from '../types';
import { useHardwareScanner } from '../hooks/useHardwareScanner';
import { playSuccessChime, playErrorBuzz, playTapBeep } from '../lib/audio';
import { LOGO_URL } from '../constants';

interface UserDashboardProps {
  profile: UserProfile;
  isKiosk?: boolean;
}

export default function UserDashboard({ profile, isKiosk = false }: UserDashboardProps) {
  const [scanResult, setScanResult] = useState<'success' | 'fail' | null>(null);
  const [lastTicket, setLastTicket] = useState<{ id: string; time: Date } | null>(null);
  const [balance, setBalance] = useState(profile.ticketsBalance);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scannerStatus, setScannerStatus] = useState<'idle' | 'detected'>('idle');

  // Automatic reset for Kiosk Mode if active
  React.useEffect(() => {
    if (!isKiosk) return;
    if (scanResult) {
      const timer = setTimeout(() => {
        setScanResult(null);
      }, 8000);
      return () => clearTimeout(timer);
    }
  }, [isKiosk, scanResult]);

  const getCurrentMealType = () => {
    const hour = new Date().getHours();
    if (hour < 11) return 'Breakfast';
    if (hour < 16) return 'Lunch';
    return 'Dinner';
  };

  const handleVerify = useCallback(
    async (token?: string) => {
      if (!profile) {
        setError('User profile not authenticated. Please refresh or log in.');
        return;
      }

      if (balance <= 0) {
        playErrorBuzz();
        setError('No tickets remaining for this week. Please contact the canteen admin.');
        setScanResult('fail');
        return;
      }

      setIsVerifying(true);
      setError(null);

      try {
        const cardToVerify = token || profile.rfidCardId || profile.id;

        if (token) {
          const matchesRfid = profile.rfidCardId && profile.rfidCardId.toLowerCase() === token.toLowerCase();
          const matchesId = profile.id.toLowerCase() === token.toLowerCase();
          if (!matchesRfid && !matchesId) {
            throw new Error(`RFID Card UID (${token}) does not match your registered card (${profile.rfidCardId || profile.id}).`);
          }
        }

        playTapBeep();

        const attendanceRef = collection(db, 'attendance');
        let newDoc;
        try {
          newDoc = await addDoc(attendanceRef, {
            userId: profile.id,
            userName: profile.name,
            department: profile.department,
            employmentType: profile.employmentType || '',
            timestamp: serverTimestamp(),
            mealType: getCurrentMealType(),
            authMethod: 'rfid',
            cardId: cardToVerify
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, 'attendance');
          return;
        }

        const userRef = doc(db, 'users', profile.id);
        const newBalance = balance - 1;
        try {
          await updateDoc(userRef, {
            ticketsBalance: newBalance
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, `users/${profile.id}`);
          return;
        }

        setBalance(newBalance);
        playSuccessChime();
        setScanResult('success');
        const ticketId = newDoc.id.slice(-6).toUpperCase();
        setLastTicket({ id: ticketId, time: new Date() });

        // Trigger POS print preview
        setTimeout(() => {
          window.print();
        }, 500);

        if (isKiosk) {
          setTimeout(() => setScanResult(null), 8000);
        }
      } catch (err: any) {
        console.error('Verification failed:', err);
        playErrorBuzz();
        setScanResult('fail');
        setError(err.message || 'RFID verification error occurred.');

        if (isKiosk) {
          setTimeout(() => {
            setScanResult(null);
            setError(null);
          }, 5000);
        }
      } finally {
        setIsVerifying(false);
      }
    },
    [balance, profile, isKiosk]
  );

  // USB RFID Reader listener
  useHardwareScanner({
    onScan: (token) => {
      setScannerStatus('detected');
      handleVerify(token);
      setTimeout(() => setScannerStatus('idle'), 2000);
    },
    minChars: 3
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Left Column: Profile Card & Digital RFID Badge */}
      <div className="lg:col-span-1 space-y-6">
        {/* User Details Card */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-14 h-14 bg-cyan-50 border border-cyan-100 rounded-2xl flex items-center justify-center text-cyan-600 font-bold text-xl">
              {profile.name.charAt(0)}
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">{profile.name}</h2>
              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                {profile.department && profile.department !== profile.employmentType && (
                  <span className="text-[10px] font-bold uppercase bg-cyan-50 text-cyan-700 px-2 py-0.5 rounded border border-cyan-100 flex items-center gap-1">
                    <Building2 className="w-2.5 h-2.5" />
                    {profile.department}
                  </span>
                )}
                <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded flex items-center gap-1">
                  <Briefcase className="w-2.5 h-2.5" />
                  {profile.employmentType || profile.department || 'Staff'}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="bg-slate-50 p-4 rounded-2xl flex items-center justify-between border border-slate-100">
              <div className="flex items-center gap-3">
                <Ticket className="w-5 h-5 text-cyan-600" />
                <span className="text-sm font-semibold text-slate-700">Tickets Left</span>
              </div>
              <span className="text-2xl font-bold text-slate-900 font-mono">{balance}</span>
            </div>

            <div className="flex justify-between text-xs text-slate-400 px-1">
              <span>Weekly Cap: {profile.weeklyAllocation}</span>
              <span className="text-emerald-600 font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" /> Active
              </span>
            </div>
          </div>
        </div>

        {/* Digital RFID Card Badge */}
        <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-cyan-950 text-white rounded-3xl p-6 shadow-xl border border-cyan-500/20 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-40 h-40 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none" />

          <div className="flex items-center justify-between mb-6 relative z-10">
            <img src={LOGO_URL} alt="Graphic Packaging" className="h-4 w-auto brightness-200" referrerPolicy="no-referrer" />
            <div className="flex items-center gap-1.5 bg-cyan-500/20 border border-cyan-400/30 px-2.5 py-1 rounded-full text-[10px] font-mono text-cyan-300 font-bold">
              <Radio className="w-3 h-3 text-cyan-400 animate-pulse" />
              <span>RFID BADGE</span>
            </div>
          </div>

          {/* Golden Smart Card Chip Graphic */}
          <div className="w-10 h-8 rounded-md bg-amber-400 border border-amber-300 shadow-inner grid grid-cols-2 gap-0.5 p-1 mb-4">
            <div className="bg-amber-600/40 rounded-sm" />
            <div className="bg-amber-600/40 rounded-sm" />
            <div className="bg-amber-600/40 rounded-sm" />
            <div className="bg-amber-600/40 rounded-sm" />
          </div>

          <div className="space-y-1 relative z-10">
            <p className="text-[10px] font-mono uppercase tracking-widest text-slate-400">Card Serial UID</p>
            <p className="text-lg font-mono font-bold tracking-wider text-cyan-300">
              {profile.rfidCardId || profile.id}
            </p>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-700/60 flex items-center justify-between text-xs text-slate-300">
            <div>
              <p className="text-[10px] text-slate-400 uppercase">Card Holder</p>
              <p className="font-bold text-white text-xs">{profile.name}</p>
            </div>
            <button
              onClick={() => handleVerify(profile.rfidCardId || profile.id)}
              disabled={isVerifying}
              className="px-3.5 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-md shadow-cyan-900/40"
              title="Test tap this card"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Test Tap Card</span>
            </button>
          </div>
        </div>

        {/* Last Ticket Printed */}
        {lastTicket && (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-cyan-600 text-white p-6 rounded-3xl shadow-lg relative overflow-hidden group"
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

      {/* Right Column: RFID Contactless Check-In Station */}
      <div className="lg:col-span-2">
        <div className="bg-white rounded-3xl h-full min-h-[480px] border border-slate-200 p-8 flex flex-col items-center justify-center relative shadow-sm">
          
          {scanResult === 'success' ? (
            <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center py-6">
              <div className="w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 className="w-12 h-12 text-emerald-600" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-2">Card Verified Successfully</h3>
              <p className="text-slate-500 mb-8 max-w-sm mx-auto text-sm">
                Your {getCurrentMealType()} ticket has been allocated and printed via RFID Badge.
              </p>
              <button
                onClick={() => setScanResult(null)}
                className="bg-slate-900 hover:bg-slate-800 text-white px-8 py-3 rounded-xl font-bold text-xs transition-colors"
              >
                Scan Another Card
              </button>
            </motion.div>
          ) : scanResult === 'fail' ? (
            <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center py-6">
              <div className="w-24 h-24 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <XCircle className="w-12 h-12 text-red-600" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-2">Verification Failed</h3>
              <p className="text-slate-500 mb-8 max-w-sm mx-auto text-sm">{error || 'Card data error occurred. Please try again.'}</p>
              <button
                onClick={() => {
                  setScanResult(null);
                  setError(null);
                }}
                className="bg-slate-900 text-white px-8 py-3 rounded-xl font-semibold text-xs"
              >
                Retry
              </button>
            </motion.div>
          ) : (
            <div className="flex flex-col items-center text-center">
              <div className="mb-6">
                <span className="px-3.5 py-1 rounded-full bg-cyan-50 border border-cyan-200 text-cyan-700 text-xs font-bold uppercase tracking-wider inline-block mb-3">
                  Contactless RFID Checkout
                </span>
                <h3 className="text-2xl font-bold text-slate-900 mb-1">
                  Touch Badge to USB Reader
                </h3>
                <p className="text-xs text-slate-500">
                  Hold your physical staff card against the reader or click below to simulate tap.
                </p>
              </div>

              {/* RFID Card Animation Target */}
              <div className="relative my-4 group">
                <div className="absolute inset-0 rounded-3xl bg-cyan-400/20 animate-ping opacity-40 pointer-events-none" />

                <div
                  onClick={() => handleVerify(profile.rfidCardId || profile.id)}
                  className="w-72 h-80 rounded-3xl border-2 border-dashed border-cyan-400 bg-cyan-50/50 hover:bg-cyan-50 flex flex-col items-center justify-center p-6 cursor-pointer transition-all duration-300 shadow-inner group-hover:scale-102"
                >
                  <div className="w-20 h-20 rounded-2xl bg-cyan-600 text-white flex items-center justify-center mb-4 shadow-lg shadow-cyan-200 group-hover:scale-105 transition-transform">
                    <CreditCard className="w-10 h-10" />
                  </div>
                  <h4 className="font-bold text-slate-900 text-base mb-1">Click to Simulate Tap</h4>
                  <p className="text-xs text-slate-500 max-w-[200px]">
                    1-second checkout • No drivers required
                  </p>
                  <div className="mt-4 px-3 py-1 bg-cyan-100 text-cyan-800 text-[10px] font-mono font-bold rounded-full">
                    UID: {profile.rfidCardId || profile.id}
                  </div>
                </div>
              </div>

              <div className="mt-6 text-center text-slate-400 text-xs flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>USB Reader Ready • Plug & Play Active</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Hidden POS Thermal Ticket for window.print() */}
      {lastTicket && (
        <div id="pos-ticket" className="no-print">
          <div className="ticket-header">
            <img src={LOGO_URL} alt="Graphic Packaging" className="h-4 w-auto mx-auto mb-2" referrerPolicy="no-referrer" />
            <h1 className="font-bold uppercase tracking-tighter text-[10pt]">Graphic Packaging</h1>
            <p className="text-[7pt] font-sans">Official Meal Voucher</p>
          </div>

          <div className="ticket-body">
            <p className="font-sans text-[9pt] font-bold">{profile.name}</p>
            <p className="font-sans text-[8pt] opacity-80">{profile.department} • {profile.employmentType || 'Staff'}</p>
            <p className="font-mono text-[7pt] opacity-60">ID: {profile.id}</p>
            <div className="ticket-id tracking-widest text-[#000] my-2">#{lastTicket.id}</div>
            <div className="my-2 p-1 border border-black border-dashed">
              <p className="font-bold text-[10pt] uppercase">{getCurrentMealType()}</p>
            </div>
          </div>

          <div className="ticket-footer">
            <p>{lastTicket.time.toLocaleDateString()} {lastTicket.time.toLocaleTimeString()}</p>
            <p className="mt-1 font-bold">CREDITS LEFT: {balance}</p>
            <p className="mt-4 text-[7pt] italic">AUTH: RFID CARD VERIFIED</p>
          </div>
        </div>
      )}
    </div>
  );
}
