import React, { useState, useEffect, useRef, useCallback } from 'react';
import { collection, query, onSnapshot, doc, updateDoc, addDoc, serverTimestamp, getDocs, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { UserProfile, AttendanceRecord } from '../types';
import { useHardwareScanner } from '../hooks/useHardwareScanner';
import { playSuccessChime, playErrorBuzz, playTapBeep } from '../lib/audio';
import { LOGO_URL } from '../constants';
import { 
  CreditCard, 
  CheckCircle2, 
  XCircle, 
  Printer, 
  Volume2, 
  VolumeX, 
  Maximize2, 
  Minimize2, 
  Radio, 
  Users, 
  Sparkles, 
  Clock, 
  RefreshCw,
  Search,
  AlertTriangle,
  Flame,
  ArrowRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface RfidKioskTerminalProps {
  onExit?: () => void;
  isAdmin?: boolean;
}

export default function RfidKioskTerminal({ onExit, isAdmin = false }: RfidKioskTerminalProps) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [recentMeals, setRecentMeals] = useState<AttendanceRecord[]>([]);
  const [manualCardInput, setManualCardInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [webNfcSupported, setWebNfcSupported] = useState(false);
  const [webNfcActive, setWebNfcActive] = useState(false);
  const [scannerPulse, setScannerPulse] = useState(false);

  // Success / Failure State
  const [status, setStatus] = useState<'idle' | 'success' | 'fail'>('idle');
  const [matchedUser, setMatchedUser] = useState<UserProfile | null>(null);
  const [remainingBalance, setRemainingBalance] = useState<number>(0);
  const [lastTicketId, setLastTicketId] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [scannedCardCode, setScannedCardCode] = useState<string>('');

  const autoResetTimerRef = useRef<number | null>(null);

  // Determine current meal time
  const getCurrentMealType = () => {
    const hour = new Date().getHours();
    if (hour < 11) return 'Breakfast';
    if (hour < 16) return 'Lunch';
    return 'Dinner';
  };

  // Check Web NFC support (available on Chrome Android)
  useEffect(() => {
    if ('NDEFReader' in window) {
      setWebNfcSupported(true);
    }
  }, []);

  // Fetch users and today's attendance in real-time
  useEffect(() => {
    const qUsers = query(collection(db, 'users'));
    const unsubUsers = onSnapshot(
      qUsers,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as UserProfile));
        setUsers(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'users')
    );

    const qAtt = query(collection(db, 'attendance'));
    const unsubAtt = onSnapshot(
      qAtt,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as AttendanceRecord));
        // Sort descending
        list.sort((a, b) => (b.timestamp?.toMillis?.() || 0) - (a.timestamp?.toMillis?.() || 0));
        setRecentMeals(list.slice(0, 10));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'attendance')
    );

    return () => {
      unsubUsers();
      unsubAtt();
    };
  }, []);

  // Handle Fullscreen toggle
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // Start Web NFC scanning if supported and requested
  const startWebNfc = async () => {
    if (!('NDEFReader' in window)) return;
    try {
      const ndef = new (window as any).NDEFReader();
      await ndef.scan();
      setWebNfcActive(true);
      ndef.onreading = (event: any) => {
        const serialNumber = event.serialNumber || 'NFC_' + Date.now().toString(36);
        processRfidScan(serialNumber);
      };
    } catch (err: any) {
      console.error('Web NFC failed:', err);
      alert('Could not start Web NFC: ' + (err.message || 'Permission denied'));
    }
  };

  // Core Card Tap Logic
  const processRfidScan = useCallback(
    async (cardCode: string) => {
      const code = cardCode.trim();
      if (!code || isProcessing) return;

      if (autoResetTimerRef.current) {
        window.clearTimeout(autoResetTimerRef.current);
      }

      setIsProcessing(true);
      setScannerPulse(true);
      setScannedCardCode(code);
      if (soundEnabled) playTapBeep();

      try {
        // Look up by rfidCardId or fallback to user.id or matching card
        const user = users.find(
          (u) =>
            (u.rfidCardId && u.rfidCardId.toLowerCase() === code.toLowerCase()) ||
            u.id.toLowerCase() === code.toLowerCase()
        );

        if (!user) {
          if (soundEnabled) playErrorBuzz();
          setStatus('fail');
          setMatchedUser(null);
          setErrorMessage(`Card UID "${code}" is not registered to any employee.`);
          setIsProcessing(false);
          setScannerPulse(false);

          autoResetTimerRef.current = window.setTimeout(() => {
            setStatus('idle');
            setErrorMessage('');
            setScannedCardCode('');
          }, 4500);
          return;
        }

        // Check if employee account is active
        if (user.status !== 'active') {
          if (soundEnabled) playErrorBuzz();
          setStatus('fail');
          setMatchedUser(user);
          setErrorMessage(
            user.status === 'pending_approval'
              ? `Account for ${user.name} is pending admin approval.`
              : `Account for ${user.name} is inactive or pending deletion.`
          );
          setIsProcessing(false);
          setScannerPulse(false);

          autoResetTimerRef.current = window.setTimeout(() => {
            setStatus('idle');
            setErrorMessage('');
            setMatchedUser(null);
            setScannedCardCode('');
          }, 4500);
          return;
        }

        // Check ticket balance
        if (user.ticketsBalance <= 0) {
          if (soundEnabled) playErrorBuzz();
          setStatus('fail');
          setMatchedUser(user);
          setErrorMessage(`No tickets left for ${user.name} this week. Contact supervisor.`);
          setIsProcessing(false);
          setScannerPulse(false);

          autoResetTimerRef.current = window.setTimeout(() => {
            setStatus('idle');
            setErrorMessage('');
            setMatchedUser(null);
            setScannedCardCode('');
          }, 4500);
          return;
        }

        // Deduct ticket & record meal
        const mealType = getCurrentMealType();
        const newBalance = user.ticketsBalance - 1;

        // Add attendance record
        const attRef = collection(db, 'attendance');
        const docRef = await addDoc(attRef, {
          userId: user.id,
          userName: user.name,
          department: user.department,
          employmentType: user.employmentType || '',
          timestamp: serverTimestamp(),
          mealType: mealType,
          authMethod: 'rfid',
          cardId: code
        });

        // Update user balance in Firestore
        const userRef = doc(db, 'users', user.id);
        await updateDoc(userRef, {
          ticketsBalance: newBalance
        });

        if (soundEnabled) playSuccessChime();

        const ticketNum = docRef.id.slice(-6).toUpperCase();
        setMatchedUser(user);
        setRemainingBalance(newBalance);
        setLastTicketId(ticketNum);
        setStatus('success');
        setIsProcessing(false);
        setScannerPulse(false);

        // Auto-reset after 4 seconds for the next person in the canteen queue
        autoResetTimerRef.current = window.setTimeout(() => {
          setStatus('idle');
          setMatchedUser(null);
          setScannedCardCode('');
        }, 4200);
      } catch (err: any) {
        console.error('Scan error:', err);
        if (soundEnabled) playErrorBuzz();
        setStatus('fail');
        setErrorMessage(err.message || 'Error processing RFID transaction.');
        setIsProcessing(false);
        setScannerPulse(false);

        autoResetTimerRef.current = window.setTimeout(() => {
          setStatus('idle');
          setErrorMessage('');
          setScannedCardCode('');
        }, 4500);
      }
    },
    [users, isProcessing, soundEnabled]
  );

  // Global Hardware Scanner Listener (USB RFID keyboard wedge)
  useHardwareScanner({
    onScan: (token) => {
      processRfidScan(token);
    },
    minChars: 3,
    timeGap: 90,
    allowInInputs: false
  });

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualCardInput.trim()) {
      processRfidScan(manualCardInput.trim());
      setManualCardInput('');
    }
  };

  const activeEmployeesWithRfid = users.filter((u) => u.status === 'active');

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none relative overflow-x-hidden">
      {/* Background ambient lighting */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[400px] bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[600px] h-[300px] bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top Header Bar */}
      <header className="relative z-10 border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <img src={LOGO_URL} alt="Graphic Packaging" className="h-7 w-auto" referrerPolicy="no-referrer" />
          <div className="h-5 w-px bg-slate-800" />
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-cyan-500/20 rounded-lg border border-cyan-500/30">
              <CreditCard className="w-4 h-4 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-wide uppercase text-white flex items-center gap-2">
                RFID Tap Terminal
                <span className="px-2 py-0.5 text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full font-mono font-medium animate-pulse">
                  ONLINE
                </span>
              </h1>
              <p className="text-[11px] text-slate-400 font-mono">
                SESSION: <span className="text-cyan-400 font-bold uppercase">{getCurrentMealType()}</span> • 1-SEC CHECKOUT
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Audio toggle */}
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-2.5 rounded-xl border text-xs font-medium transition-colors flex items-center gap-2 ${
              soundEnabled
                ? 'bg-slate-800/80 border-slate-700 text-slate-200 hover:bg-slate-800'
                : 'bg-red-950/40 border-red-800/50 text-red-400'
            }`}
            title={soundEnabled ? 'Mute Sounds' : 'Unmute Sounds'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-cyan-400" /> : <VolumeX className="w-4 h-4 text-red-400" />}
            <span className="hidden sm:inline text-xs">{soundEnabled ? 'Sound On' : 'Muted'}</span>
          </button>

          {/* Web NFC button if supported */}
          {webNfcSupported && (
            <button
              onClick={startWebNfc}
              className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors flex items-center gap-1.5 ${
                webNfcActive
                  ? 'bg-emerald-950/40 border-emerald-700 text-emerald-400'
                  : 'bg-cyan-950/40 border-cyan-800 text-cyan-400 hover:bg-cyan-900/40'
              }`}
            >
              <Radio className={`w-3.5 h-3.5 ${webNfcActive ? 'animate-pulse' : ''}`} />
              <span>{webNfcActive ? 'NFC Active' : 'Enable Mobile NFC'}</span>
            </button>
          )}

          {/* Fullscreen toggle */}
          <button
            onClick={toggleFullscreen}
            className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-slate-300 hover:bg-slate-800 transition-colors"
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          {onExit && (
            <button
              onClick={onExit}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold border border-slate-700 transition-colors"
            >
              Exit Terminal
            </button>
          )}
        </div>
      </header>

      {/* Main Terminal Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-8 flex flex-col justify-between gap-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Main Tap Station Interaction Card (Left/Center: 8 cols) */}
          <div className="lg:col-span-8 flex flex-col items-center">
            
            <AnimatePresence mode="wait">
              {/* IDLE / WAITING STATE */}
              {status === 'idle' && (
                <motion.div
                  key="idle"
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.2 }}
                  className="w-full bg-slate-900/80 border border-slate-800 rounded-3xl p-8 sm:p-12 text-center shadow-2xl relative overflow-hidden flex flex-col items-center"
                >
                  <div className="flex items-center gap-2 mb-6 px-4 py-1.5 rounded-full bg-cyan-950/60 border border-cyan-800/60 text-cyan-300 text-xs font-semibold uppercase tracking-wider">
                    <Radio className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                    USB RFID Reader Ready • Touch Card to Sensor
                  </div>

                  {/* Big RFID Touch Target */}
                  <div className="relative my-6 group">
                    {/* Pulsing Ripple Rings */}
                    <div className="absolute inset-0 rounded-3xl bg-cyan-500/20 animate-ping opacity-30" />
                    <div className="absolute -inset-4 rounded-3xl bg-cyan-500/10 blur-xl group-hover:bg-cyan-500/20 transition-all" />

                    <div
                      className={`relative w-72 h-80 sm:w-80 sm:h-96 rounded-3xl border-2 transition-all duration-300 flex flex-col items-center justify-center p-8 bg-gradient-to-b ${
                        scannerPulse
                          ? 'from-cyan-900/80 to-slate-900 border-cyan-400 scale-105 shadow-2xl shadow-cyan-500/30'
                          : 'from-slate-800/80 to-slate-900/90 border-cyan-500/40 hover:border-cyan-400'
                      }`}
                    >
                      {/* Physical Card Graphic */}
                      <div className="w-48 h-32 rounded-2xl bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900 border border-cyan-400/30 shadow-xl p-4 flex flex-col justify-between mb-6 relative overflow-hidden transform group-hover:-translate-y-1 transition-transform">
                        <div className="flex items-center justify-between">
                          <img src={LOGO_URL} alt="Logo" className="h-3 w-auto opacity-80" referrerPolicy="no-referrer" />
                          <div className="flex gap-1 items-center">
                            <Radio className="w-4 h-4 text-cyan-400" />
                            <span className="text-[9px] font-mono font-bold text-cyan-300 tracking-wider">RFID</span>
                          </div>
                        </div>

                        {/* Gold Smart Chip */}
                        <div className="w-8 h-6 rounded bg-amber-400/90 border border-amber-300 shadow-inner grid grid-cols-2 gap-0.5 p-1">
                          <div className="bg-amber-600/50 rounded-sm" />
                          <div className="bg-amber-600/50 rounded-sm" />
                          <div className="bg-amber-600/50 rounded-sm" />
                          <div className="bg-amber-600/50 rounded-sm" />
                        </div>

                        <div className="flex justify-between items-end">
                          <span className="text-[10px] font-mono text-slate-300 tracking-widest">•••• •••• ••••</span>
                          <span className="text-[9px] uppercase font-bold text-cyan-400">STAFF MEAL</span>
                        </div>
                      </div>

                      <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">
                        TAP YOUR BADGE
                      </h2>
                      <p className="text-xs text-slate-400 max-w-xs">
                        Hold your RFID or NFC staff card against the USB reader for instant meal checkout
                      </p>

                      {isProcessing && (
                        <div className="mt-4 flex items-center gap-2 text-cyan-400 text-xs font-bold font-mono">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          VERIFYING BADGE...
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Manual Key-in / Barcode Scanner input fallback */}
                  <form onSubmit={handleManualSubmit} className="w-full max-w-md mt-4 flex gap-2">
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        data-rfid-input="true"
                        value={manualCardInput}
                        onChange={(e) => setManualCardInput(e.target.value)}
                        placeholder="Manual card UID or barcode..."
                        className="w-full pl-9 pr-4 py-2.5 bg-slate-800/90 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 font-mono"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={!manualCardInput.trim() || isProcessing}
                      className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 shadow-lg shadow-cyan-900/40"
                    >
                      <span>Check In</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </form>
                </motion.div>
              )}

              {/* SUCCESS STATE */}
              {status === 'success' && matchedUser && (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ type: 'spring', damping: 20 }}
                  className="w-full bg-gradient-to-b from-emerald-950/60 to-slate-900 border-2 border-emerald-500/60 rounded-3xl p-8 sm:p-12 text-center shadow-2xl relative overflow-hidden"
                >
                  <div className="w-24 h-24 bg-emerald-500/20 border-2 border-emerald-400 rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl shadow-emerald-500/20">
                    <CheckCircle2 className="w-14 h-14 text-emerald-400" />
                  </div>

                  <span className="px-4 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-bold uppercase tracking-widest inline-block mb-3">
                    MEAL AUTHORIZED • TICKET ISSUED
                  </span>

                  <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-1">
                    {matchedUser.name}
                  </h2>
                  <p className="text-sm font-medium text-emerald-300 mb-6">
                    {matchedUser.department} • {matchedUser.employmentType || 'Staff'} • <span className="font-mono text-slate-300">ID: {matchedUser.id}</span>
                  </p>

                  {/* Highlights Grid */}
                  <div className="grid grid-cols-3 gap-3 max-w-lg mx-auto mb-8 bg-slate-900/90 border border-emerald-500/30 rounded-2xl p-4">
                    <div className="text-center border-r border-slate-800">
                      <p className="text-[10px] uppercase font-bold text-slate-400">Meal Session</p>
                      <p className="text-base font-bold text-white mt-1">{getCurrentMealType()}</p>
                    </div>
                    <div className="text-center border-r border-slate-800">
                      <p className="text-[10px] uppercase font-bold text-slate-400">Tickets Left</p>
                      <p className="text-2xl font-black font-mono text-emerald-400 mt-0.5">{remainingBalance}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] uppercase font-bold text-slate-400">Voucher Code</p>
                      <p className="text-base font-mono font-bold text-cyan-400 mt-1">#{lastTicketId}</p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <button
                      onClick={() => window.print()}
                      className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 border border-slate-700 transition-colors"
                    >
                      <Printer className="w-4 h-4 text-cyan-400" />
                      Print Meal Slip
                    </button>
                    <button
                      onClick={() => setStatus('idle')}
                      className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-colors shadow-lg shadow-emerald-900/30"
                    >
                      Next Person (Auto in 4s)
                    </button>
                  </div>
                </motion.div>
              )}

              {/* FAILURE STATE */}
              {status === 'fail' && (
                <motion.div
                  key="fail"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ type: 'spring', damping: 20 }}
                  className="w-full bg-gradient-to-b from-red-950/60 to-slate-900 border-2 border-red-500/60 rounded-3xl p-8 sm:p-12 text-center shadow-2xl relative overflow-hidden"
                >
                  <div className="w-24 h-24 bg-red-500/20 border-2 border-red-400 rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl shadow-red-500/20">
                    <XCircle className="w-14 h-14 text-red-400" />
                  </div>

                  <span className="px-4 py-1 rounded-full bg-red-500/20 text-red-300 border border-red-500/40 text-xs font-bold uppercase tracking-widest inline-block mb-3">
                    CHECK-IN REJECTED
                  </span>

                  <h2 className="text-2xl sm:text-3xl font-extrabold text-white mb-2">
                    {matchedUser ? matchedUser.name : 'Unknown Card'}
                  </h2>

                  <p className="text-sm font-medium text-red-300 max-w-md mx-auto mb-6">
                    {errorMessage}
                  </p>

                  {scannedCardCode && (
                    <div className="inline-block bg-slate-900 border border-red-800/50 rounded-xl px-4 py-2 font-mono text-xs text-slate-300 mb-8">
                      SCANNED UID: <span className="text-amber-400 font-bold">{scannedCardCode}</span>
                    </div>
                  )}

                  <div className="flex justify-center gap-3">
                    <button
                      onClick={() => setStatus('idle')}
                      className="px-6 py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold transition-colors shadow-lg shadow-red-900/30"
                    >
                      Try Again
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Quick-Test / Simulator Bar for Testing without Physical Card Hardware */}
            <div className="w-full mt-6 bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-300 uppercase tracking-wider">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>Hardware Simulator • Tap Any Staff Badge</span>
                </div>
                <span className="text-[11px] text-slate-500 font-mono">
                  {activeEmployeesWithRfid.length} staff available
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                {activeEmployeesWithRfid.slice(0, 6).map((staff) => {
                  const cardVal = staff.rfidCardId || staff.id;
                  return (
                    <button
                      key={staff.id}
                      onClick={() => processRfidScan(cardVal)}
                      disabled={isProcessing}
                      className="px-3.5 py-2 rounded-xl bg-slate-800/90 hover:bg-cyan-900/40 hover:border-cyan-500/60 border border-slate-700/70 text-left transition-all group flex items-center gap-2.5"
                    >
                      <div className="w-7 h-7 rounded-lg bg-cyan-950 border border-cyan-800 flex items-center justify-center text-cyan-400 text-xs font-bold group-hover:scale-105 transition-transform">
                        <CreditCard className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-white group-hover:text-cyan-300">
                          {staff.name.split(' ')[0]}
                        </p>
                        <p className="text-[10px] text-slate-400 font-mono">
                          {staff.rfidCardId ? `Card: ${staff.rfidCardId.slice(0, 8)}` : staff.id}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Column: Live Canteen Feed & Hardware Status (4 cols) */}
          <div className="lg:col-span-4 space-y-6">
            
            {/* Terminal Hardware Status Card */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 shadow-xl">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-2">
                <Radio className="w-4 h-4 text-cyan-400" />
                Terminal Hardware Status
              </h3>

              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800/50 border border-slate-800">
                  <div className="flex items-center gap-2.5">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    <span className="text-xs font-medium text-slate-300">USB RFID (HID Keyboard)</span>
                  </div>
                  <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800">
                    LISTENING
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800/50 border border-slate-800">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-2 h-2 rounded-full ${webNfcActive ? 'bg-emerald-400 animate-ping' : 'bg-slate-500'}`} />
                    <span className="text-xs font-medium text-slate-300">Web NFC Sensor</span>
                  </div>
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                    webNfcActive
                      ? 'text-emerald-400 bg-emerald-950/60 border-emerald-800'
                      : webNfcSupported
                      ? 'text-cyan-400 bg-cyan-950/60 border-cyan-800'
                      : 'text-slate-500 bg-slate-800/40 border-slate-700'
                  }`}>
                    {webNfcActive ? 'CONNECTED' : webNfcSupported ? 'READY' : 'DESKTOP USB'}
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800/50 border border-slate-800">
                  <div className="flex items-center gap-2.5">
                    <Clock className="w-3.5 h-3.5 text-cyan-400" />
                    <span className="text-xs font-medium text-slate-300">Active Window</span>
                  </div>
                  <span className="text-xs font-bold text-white uppercase bg-slate-800 px-2 py-0.5 rounded">
                    {getCurrentMealType()}
                  </span>
                </div>
              </div>
            </div>

            {/* Live Attendance Counter Feed */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <Users className="w-4 h-4 text-cyan-400" />
                  Live Counter Feed (Today)
                </h3>
                <span className="text-[11px] font-mono text-cyan-400 font-bold">
                  {recentMeals.length} Served
                </span>
              </div>

              {recentMeals.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-xs italic">
                  No meal check-ins recorded yet for today.
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                  {recentMeals.map((meal) => (
                    <div
                      key={meal.id}
                      className="p-3 bg-slate-800/40 border border-slate-800 hover:border-slate-700 rounded-xl flex items-center justify-between transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-cyan-950 border border-cyan-800 flex items-center justify-center text-cyan-400 font-bold text-xs">
                          {meal.userName?.charAt(0) || 'U'}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-white leading-tight">{meal.userName}</p>
                          <p className="text-[10px] text-slate-400 leading-tight">
                            {meal.department} • <span className="text-cyan-400">{meal.mealType}</span>
                          </p>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] font-mono text-slate-400">
                          {meal.timestamp?.toDate?.() ? meal.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'}
                        </span>
                        <div className="flex items-center justify-end gap-1 mt-0.5">
                          <span className="text-[9px] font-mono bg-cyan-950 text-cyan-300 border border-cyan-800 px-1 rounded">
                            RFID
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

        </div>
      </main>

      {/* Hidden Thermal POS Ticket for window.print() */}
      {matchedUser && lastTicketId && (
        <div id="pos-ticket" className="no-print">
          <div className="ticket-header">
            <img src={LOGO_URL} alt="Graphic Packaging" className="h-4 w-auto mx-auto mb-2" referrerPolicy="no-referrer" />
            <h1 className="font-bold uppercase tracking-tighter text-[10pt]">Graphic Packaging</h1>
            <p className="text-[7pt] font-sans">Official Canteen Meal Slip</p>
          </div>

          <div className="ticket-body">
            <p className="font-sans text-[9pt] font-bold">{matchedUser.name}</p>
            <p className="font-sans text-[8pt] opacity-70">{matchedUser.department}</p>
            <p className="font-mono text-[7pt] opacity-60">ID: {matchedUser.id}</p>

            <div className="ticket-id tracking-widest text-[#000] my-2">
              #{lastTicketId}
            </div>

            <div className="my-2 p-1 border border-black border-dashed">
              <p className="font-bold text-[10pt] uppercase">{getCurrentMealType()}</p>
            </div>
          </div>

          <div className="ticket-footer">
            <p>{new Date().toLocaleDateString()} {new Date().toLocaleTimeString()}</p>
            <p className="mt-1 font-bold">REMAINING TICKETS: {remainingBalance}</p>
            <p className="mt-3 text-[7pt] italic">AUTH METHOD: RFID BADGE VERIFIED</p>
          </div>
        </div>
      )}
    </div>
  );
}
