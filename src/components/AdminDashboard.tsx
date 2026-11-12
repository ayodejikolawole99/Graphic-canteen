import { collection, doc, getDocs, onSnapshot, query, serverTimestamp, setDoc, updateDoc, deleteDoc, where } from 'firebase/firestore';
import { 
  BarChart3, 
  FileText, 
  Plus, 
  Search, 
  Users, 
  CheckCircle2, 
  XCircle, 
  Trash2, 
  ShieldCheck, 
  Ticket, 
  Download, 
  Table, 
  CreditCard, 
  Radio, 
  Sparkles,
  Link,
  Check,
  Building2,
  Briefcase
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import React, { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import 'jspdf-autotable';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { AttendanceRecord, UserProfile } from '../types';
import { useAuth } from '../hooks/useAuth';
import { useHardwareScanner } from '../hooks/useHardwareScanner';
import { playSuccessChime, playTapBeep } from '../lib/audio';
import { DEPARTMENTS, EMPLOYMENT_TYPES } from '../constants';

export default function AdminDashboard() {
  const { profile: currentAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<'enroll' | 'reports' | 'alloc' | 'approvals' | 'permissions' | 'staff'>('reports');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Filtering for reports
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [selectedEmploymentTypes, setSelectedEmploymentTypes] = useState<string[]>([]);
  const [reportChartGrouping, setReportChartGrouping] = useState<'department' | 'employmentType'>('department');
  
  // New User Form State with split: Employment Type + Department
  const [newUser, setNewUser] = useState({
    id: '',
    name: '',
    employmentType: 'White collar staff' as string,
    department: 'HR' as string,
    role: 'user' as const,
    weeklyAllocation: 5,
    rfidCardId: '',
  });

  // Mass Allocation State (split by Department or Employment Type)
  const [batchAlloc, setBatchAlloc] = useState({
    targetType: 'department' as 'department' | 'employmentType',
    targetValue: '',
    amount: 5,
    mode: 'add' as 'add' | 'subtract',
    isProcessing: false
  });

  // Modal state for linking RFID card to an existing user
  const [linkingRfidUser, setLinkingRfidUser] = useState<UserProfile | null>(null);
  const [scannedModalCard, setScannedModalCard] = useState<string>('');

  useEffect(() => {
    const qUsers = query(collection(db, 'users'));
    const unsubUsers = onSnapshot(qUsers, (snapshot) => {
      const usersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserProfile));
      setUsers(usersData);
      setLoading(false);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'users'));

    const qAttendance = query(collection(db, 'attendance'));
    const unsubAttendance = onSnapshot(qAttendance, (snapshot) => {
      const attData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AttendanceRecord));
      setAttendance(attData);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'attendance'));

    return () => {
      unsubUsers();
      unsubAttendance();
    };
  }, []);

  // Hardware Scanner for Admin Enrollment / Quick Assign
  useHardwareScanner({
    onScan: (token) => {
      playTapBeep();
      if (linkingRfidUser) {
        setScannedModalCard(token);
      } else if (activeTab === 'enroll') {
        setNewUser(prev => ({ ...prev, rfidCardId: token }));
      }
    },
    minChars: 3
  });

  const isCollarStaff = (type: string) => type === 'White collar staff' || type === 'Blue collar staff';

  const handleEnrollUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const isCollar = isCollarStaff(newUser.employmentType);
    const finalDepartment = isCollar ? (newUser.department || 'HR') : newUser.employmentType;

    if (!newUser.id || !newUser.name || !newUser.employmentType) {
      alert("Please fill in Employee ID and Full Name.");
      return;
    }

    if (isCollar && !newUser.department) {
      alert("Please select a Department for White/Blue collar staff.");
      return;
    }

    try {
      const finalRfid = newUser.rfidCardId.trim() || `RFID-${newUser.id}`;

      await setDoc(doc(db, 'users', newUser.id), {
        id: newUser.id.trim(),
        name: newUser.name.trim(),
        employmentType: newUser.employmentType,
        department: finalDepartment,
        role: newUser.role,
        rfidCardId: finalRfid,
        ticketsBalance: newUser.weeklyAllocation,
        weeklyAllocation: newUser.weeklyAllocation,
        status: 'pending_approval',
        createdAt: new Date().toISOString(),
      });

      alert(`Staff enrollment for ${newUser.name} submitted for approval with RFID Card: ${finalRfid}.`);
      setNewUser({ 
        id: '', 
        name: '', 
        employmentType: 'White collar staff', 
        department: 'HR', 
        role: 'user', 
        weeklyAllocation: 5, 
        rfidCardId: '' 
      });
      setActiveTab('approvals');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'users');
    }
  };

  const handleSaveRfidAssignment = async () => {
    if (!linkingRfidUser || !scannedModalCard.trim()) return;
    try {
      await updateDoc(doc(db, 'users', linkingRfidUser.id), {
        rfidCardId: scannedModalCard.trim(),
        rfidCardAssignedAt: new Date().toISOString()
      });
      playSuccessChime();
      alert(`RFID Card ${scannedModalCard} successfully linked to ${linkingRfidUser.name}!`);
      setLinkingRfidUser(null);
      setScannedModalCard('');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${linkingRfidUser.id}`);
    }
  };

  const handleApprove = async (userId: string, action: 'approve' | 'reject' | 'finalize_delete') => {
    if (currentAdmin?.adminLevel !== 2 && currentAdmin?.email !== 'ayodejikolawole99@gmail.com') {
      alert("Only Level 2 Admin (Checker) can approve actions.");
      return;
    }

    try {
      const userRef = doc(db, 'users', userId);
      if (action === 'approve') {
        await updateDoc(userRef, { status: 'active' });
      } else if (action === 'reject') {
        await deleteDoc(userRef);
      } else if (action === 'finalize_delete') {
        await deleteDoc(userRef);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'users/approval');
    }
  };

  const requestDelete = async (userId: string) => {
    try {
      await updateDoc(doc(db, 'users', userId), { status: 'pending_deletion' });
      alert("Deletion request sent to Level 2 Admin.");
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'users/delete_request');
    }
  };

  const handleBatchAllocation = async () => {
    if (!batchAlloc.targetValue) return;
    setBatchAlloc(prev => ({ ...prev, isProcessing: true }));
    
    try {
      const usersToUpdate = users.filter(u => {
        if (u.status !== 'active') return false;
        if (batchAlloc.targetType === 'department') {
          return u.department === batchAlloc.targetValue;
        } else {
          return u.employmentType === batchAlloc.targetValue;
        }
      });

      const updates = usersToUpdate.map(user => {
        const adjustment = batchAlloc.mode === 'add' ? batchAlloc.amount : -batchAlloc.amount;
        const newBalance = Math.max(0, user.ticketsBalance + adjustment);
        return updateDoc(doc(db, 'users', user.id), {
          ticketsBalance: newBalance
        });
      });
      
      await Promise.all(updates);
      const actionText = batchAlloc.mode === 'add' ? 'allocated' : 'reduced';
      alert(`Successfully ${actionText} tickets for ${usersToUpdate.length} staff in ${batchAlloc.targetValue}`);
      setBatchAlloc(prev => ({ ...prev, targetValue: '', isProcessing: false }));
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'users/batch');
      setBatchAlloc(prev => ({ ...prev, isProcessing: false }));
    }
  };

  const getFilteredAttendance = () => {
    return attendance.filter(record => {
      const matchesDept = selectedDepartments.length === 0 || selectedDepartments.includes(record.department);
      const matchesType = selectedEmploymentTypes.length === 0 || 
        (record.employmentType && selectedEmploymentTypes.includes(record.employmentType));
      return matchesDept && matchesType;
    });
  };

  const getFeedingStats = () => {
    const stats: Record<string, number> = {};
    const dataToStat = getFilteredAttendance();

    dataToStat.forEach(record => {
      const key = reportChartGrouping === 'department' 
        ? (record.department || 'Other') 
        : (record.employmentType || 'Unspecified');
      stats[key] = (stats[key] || 0) + 1;
    });

    return Object.entries(stats).map(([name, value]) => ({ name, value }));
  };

  const exportToCSV = () => {
    const filtered = getFilteredAttendance();
    const data = filtered.map(record => ({
      Employee: record.userName,
      Department: record.department,
      EmploymentType: record.employmentType || '',
      MealType: record.mealType,
      AuthMethod: 'RFID Card',
      Timestamp: record.timestamp?.toDate().toLocaleString() || ''
    }));
    const csv = Papa.unparse(data);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `attendance_report_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToExcel = () => {
    const filtered = getFilteredAttendance();
    const data = filtered.map(record => ({
      Employee: record.userName,
      Department: record.department,
      EmploymentType: record.employmentType || '',
      MealType: record.mealType,
      AuthMethod: 'RFID Card',
      Timestamp: record.timestamp?.toDate().toLocaleString() || ''
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Attendance");
    XLSX.writeFile(workbook, `attendance_report_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const exportToPDF = () => {
    const filtered = getFilteredAttendance();
    const doc = new jsPDF();
    doc.text("Attendance Report - Graphic Packaging Canteen", 14, 15);
    const tableColumn = ["Employee", "Department", "Employment Type", "Meal Type", "Timestamp"];
    const tableRows = filtered.map(record => [
      record.userName,
      record.department,
      record.employmentType || 'N/A',
      record.mealType,
      record.timestamp?.toDate().toLocaleString() || ''
    ]);

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 20,
    });
    doc.save(`attendance_report_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const pendingUsers = users.filter(u => u.status === 'pending_approval');
  const deletionRequests = users.filter(u => u.status === 'pending_deletion');
  const activeUsers = users.filter(u => u.status === 'active');

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-slate-200">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Admin Control Center</h1>
          <p className="text-slate-500 font-medium">
            Role: <span className="text-cyan-600 uppercase font-bold">Level {currentAdmin?.adminLevel || 1} Admin</span>
          </p>
        </div>
        
        <nav className="flex flex-wrap bg-white border border-slate-200 p-1.5 rounded-2xl shadow-sm gap-1">
          <button 
            onClick={() => setActiveTab('reports')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
              activeTab === 'reports' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            Reports
          </button>
          
          {(currentAdmin?.adminLevel === 1 || currentAdmin?.email === 'ayodejikolawole99@gmail.com') && (
            <>
              <button 
                onClick={() => setActiveTab('enroll')}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
                  activeTab === 'enroll' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                <Plus className="w-4 h-4" />
                Staff Enrollment
              </button>
              <button 
                onClick={() => setActiveTab('alloc')}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
                  activeTab === 'alloc' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                <Ticket className="w-4 h-4" />
                Mass Allocation
              </button>
            </>
          )}

          <button 
            onClick={() => setActiveTab('approvals')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all relative ${
              activeTab === 'approvals' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            Approvals
            {(pendingUsers.length > 0 || deletionRequests.length > 0) && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] flex items-center justify-center rounded-full border-2 border-white">
                {pendingUsers.length + deletionRequests.length}
              </span>
            )}
          </button>

          {(currentAdmin?.adminLevel === 2 || currentAdmin?.email === 'ayodejikolawole99@gmail.com') && (
            <button 
              onClick={() => setActiveTab('permissions')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
                activeTab === 'permissions' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              Roles & Permissions
            </button>
          )}

          <button 
            onClick={() => setActiveTab('staff')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
              activeTab === 'staff' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <Users className="w-4 h-4" />
            Personnel & RFID Cards
          </button>
        </nav>
      </div>

      <AnimatePresence mode="wait">
        {/* REPORTS TAB */}
        {activeTab === 'reports' && (
          <motion.div 
            key="reports"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-8"
          >
            <div className="lg:col-span-2 space-y-6">
              {/* Feeding Chart */}
              <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                  <h3 className="font-bold text-slate-900 flex items-center gap-2 text-lg">
                    <BarChart3 className="w-6 h-6 text-cyan-600" />
                    Feeding Statistics
                  </h3>
                  
                  {/* Toggle Chart Grouping: Department vs Employment Type */}
                  <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-bold">
                    <button
                      onClick={() => setReportChartGrouping('department')}
                      className={`px-3 py-1.5 rounded-lg transition-colors ${
                        reportChartGrouping === 'department'
                          ? 'bg-white text-cyan-600 shadow-sm'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      By Department
                    </button>
                    <button
                      onClick={() => setReportChartGrouping('employmentType')}
                      className={`px-3 py-1.5 rounded-lg transition-colors ${
                        reportChartGrouping === 'employmentType'
                          ? 'bg-white text-cyan-600 shadow-sm'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      By Employment Type
                    </button>
                  </div>
                </div>

                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={getFeedingStats()}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                      <Tooltip 
                        contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}
                        cursor={{ fill: '#f8fafc' }}
                      />
                      <Bar dataKey="value" fill="#0891b2" radius={[6, 6, 0, 0]} barSize={44} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Attendance Table */}
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-slate-900 text-lg">Live Attendance Logs</h3>
                    <div className="flex gap-2">
                      <button 
                        onClick={exportToCSV}
                        className="px-3 py-2 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-600 rounded-xl text-xs font-bold text-slate-600 flex items-center gap-1.5 transition-all"
                        title="Export CSV"
                      >
                        <FileText className="w-4 h-4" />
                        CSV
                      </button>
                      <button 
                        onClick={exportToExcel}
                        className="px-3 py-2 bg-slate-100 hover:bg-blue-50 hover:text-blue-600 rounded-xl text-xs font-bold text-slate-600 flex items-center gap-1.5 transition-all"
                        title="Export Excel"
                      >
                        <Table className="w-4 h-4" />
                        XLSX
                      </button>
                      <button 
                        onClick={exportToPDF}
                        className="px-3 py-2 bg-slate-100 hover:bg-red-50 hover:text-red-600 rounded-xl text-xs font-bold text-slate-600 flex items-center gap-1.5 transition-all"
                        title="Export PDF"
                      >
                        <Download className="w-4 h-4" />
                        PDF
                      </button>
                    </div>
                  </div>

                  {/* Filter Pills for Departments */}
                  <div className="space-y-2 pt-2 border-t border-slate-100">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] uppercase font-bold text-slate-400 mr-1 flex items-center gap-1">
                        <Building2 className="w-3 h-3" /> Departments:
                      </span>
                      {DEPARTMENTS.map(dept => (
                        <button
                          key={dept}
                          onClick={() => {
                            setSelectedDepartments(prev => 
                              prev.includes(dept) ? prev.filter(d => d !== dept) : [...prev, dept]
                            );
                          }}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all border ${
                            selectedDepartments.includes(dept)
                              ? 'bg-cyan-600 border-cyan-600 text-white shadow-sm'
                              : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300'
                          }`}
                        >
                          {dept}
                        </button>
                      ))}
                      {selectedDepartments.length > 0 && (
                        <button
                          onClick={() => setSelectedDepartments([])}
                          className="px-2 py-0.5 rounded-lg text-[10px] font-bold text-red-500 hover:bg-red-50"
                        >
                          Clear
                        </button>
                      )}
                    </div>

                    {/* Filter Pills for Employment Types */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] uppercase font-bold text-slate-400 mr-1 flex items-center gap-1">
                        <Briefcase className="w-3 h-3" /> Types:
                      </span>
                      {EMPLOYMENT_TYPES.map(etype => (
                        <button
                          key={etype}
                          onClick={() => {
                            setSelectedEmploymentTypes(prev => 
                              prev.includes(etype) ? prev.filter(t => t !== etype) : [...prev, etype]
                            );
                          }}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all border ${
                            selectedEmploymentTypes.includes(etype)
                              ? 'bg-slate-900 border-slate-900 text-white shadow-sm'
                              : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300'
                          }`}
                        >
                          {etype}
                        </button>
                      ))}
                      {selectedEmploymentTypes.length > 0 && (
                        <button
                          onClick={() => setSelectedEmploymentTypes([])}
                          className="px-2 py-0.5 rounded-lg text-[10px] font-bold text-red-500 hover:bg-red-50"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="max-h-[500px] overflow-y-auto">
                  <table className="w-full text-left">
                    <thead className="sticky top-0 bg-white/90 backdrop-blur-md shadow-sm z-10 border-b border-slate-100">
                      <tr>
                        <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Employee</th>
                        <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Department</th>
                        <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Employment Type</th>
                        <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Meal Type</th>
                        <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {getFilteredAttendance().sort((a, b) => (b.timestamp?.toMillis?.() || 0) - (a.timestamp?.toMillis?.() || 0)).map(record => (
                        <tr key={record.id} className="hover:bg-slate-50/50">
                          <td className="px-6 py-4 text-sm font-bold text-slate-900">{record.userName}</td>
                          <td className="px-6 py-4">
                             <span className="text-[10px] font-bold uppercase bg-cyan-50 text-cyan-700 border border-cyan-100 px-2 py-1 rounded-md">
                               {record.department}
                             </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-1 rounded-md">
                              {record.employmentType || 'Unassigned'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-cyan-600 font-semibold">{record.mealType}</td>
                          <td className="px-6 py-4 text-xs text-slate-400 text-right">{record.timestamp?.toDate().toLocaleString()}</td>
                        </tr>
                      ))}
                      {getFilteredAttendance().length === 0 && (
                        <tr>
                          <td colSpan={5} className="p-12 text-center text-slate-400 italic">No attendance records found for selected filters.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Overview Widget */}
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-slate-900 rounded-3xl p-8 text-white">
                <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-8">System Overview</h4>
                <div className="space-y-6">
                  <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl">
                    <p className="text-xs text-slate-400 font-bold uppercase">Meals Served</p>
                    <p className="text-3xl font-bold text-cyan-400">{attendance.length}</p>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl">
                    <p className="text-xs text-slate-400 font-bold uppercase">Active Staff</p>
                    <p className="text-3xl font-bold text-emerald-400">{activeUsers.length}</p>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl">
                    <p className="text-xs text-slate-400 font-bold uppercase">RFID Badges Linked</p>
                    <p className="text-3xl font-bold text-cyan-300">
                      {activeUsers.filter(u => u.rfidCardId).length}
                    </p>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl">
                    <p className="text-xs text-slate-400 font-bold uppercase">Pending Actions</p>
                    <p className="text-3xl font-bold text-amber-400">{pendingUsers.length + deletionRequests.length}</p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* STAFF ENROLLMENT TAB WITH EMPLOYMENT TYPE + DEPARTMENT SPLIT (NO BIOMETRICS) */}
        {activeTab === 'enroll' && (currentAdmin?.adminLevel === 1 || currentAdmin?.email === 'ayodejikolawole99@gmail.com') && (
          <motion.div 
            key="enroll"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="max-w-3xl mx-auto"
          >
            <div className="bg-white p-10 rounded-3xl border border-slate-200 shadow-xl">
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-slate-900">Staff Enrollment</h2>
                <p className="text-slate-500 text-sm mt-1">
                  Enroll an employee with their designated Employment Type, Department, and RFID Card.
                </p>
              </div>

              <form onSubmit={handleEnrollUser} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Employee ID */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">Employee ID / Badge #</label>
                  <input 
                    type="text" 
                    value={newUser.id}
                    onChange={(e) => setNewUser({...newUser, id: e.target.value})}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-cyan-500 font-mono text-sm"
                    placeholder="e.g. EMP-1049"
                    required
                  />
                </div>

                {/* Full Name */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">Full Name</label>
                  <input 
                    type="text" 
                    value={newUser.name}
                    onChange={(e) => setNewUser({...newUser, name: e.target.value})}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-cyan-500 text-sm"
                    placeholder="e.g. John Doe"
                    required
                  />
                </div>

                {/* SPLIT 1: Employment Type */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 uppercase flex items-center gap-1.5">
                    <Briefcase className="w-3.5 h-3.5 text-cyan-600" />
                    <span>Employment Type</span>
                  </label>
                  <select 
                    value={newUser.employmentType}
                    onChange={(e) => {
                      const nextType = e.target.value;
                      const isCollar = isCollarStaff(nextType);
                      setNewUser({
                        ...newUser,
                        employmentType: nextType,
                        department: isCollar ? (DEPARTMENTS.includes(newUser.department as any) ? newUser.department : 'HR') : nextType
                      });
                    }}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-cyan-500 text-sm font-medium"
                    required
                  >
                    {EMPLOYMENT_TYPES.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>

                {/* SPLIT 2: Department (ONLY shown when Employment Type is White or Blue collar) */}
                {isCollarStaff(newUser.employmentType) ? (
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 uppercase flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-cyan-600" />
                      <span>Department</span>
                    </label>
                    <select 
                      value={newUser.department}
                      onChange={(e) => setNewUser({...newUser, department: e.target.value})}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-cyan-500 text-sm font-medium"
                      required
                    >
                      {DEPARTMENTS.map(dept => (
                        <option key={dept} value={dept}>{dept}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="space-y-1.5 bg-slate-50 border border-slate-200 rounded-2xl p-3 flex flex-col justify-center">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Department Assignment</span>
                    <p className="text-xs font-bold text-slate-700">
                      Not applicable for <span className="text-cyan-700">{newUser.employmentType}</span>
                    </p>
                    <span className="text-[10px] text-slate-400">Department selection is only enabled for White & Blue collar staff.</span>
                  </div>
                )}

                {/* Weekly Ticket Allocation */}
                <div className="md:col-span-2 space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">Weekly Ticket Allocation</label>
                  <input 
                    type="number" 
                    value={newUser.weeklyAllocation}
                    onChange={(e) => setNewUser({...newUser, weeklyAllocation: parseInt(e.target.value) || 0})}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-cyan-500 text-sm"
                    min="1"
                    required
                  />
                </div>

                {/* RFID Card UID Assignment */}
                <div className="md:col-span-2 space-y-2 pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-800 uppercase flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-cyan-600" />
                      <span>RFID Card Serial UID (Tap USB Reader to Auto-Fill)</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const randomUid = 'RFID-' + Math.floor(10000000 + Math.random() * 90000000);
                        setNewUser({ ...newUser, rfidCardId: randomUid });
                      }}
                      className="text-xs text-cyan-600 font-bold hover:underline flex items-center gap-1"
                    >
                      <Sparkles className="w-3 h-3" />
                      Generate Sample Card UID
                    </button>
                  </div>
                  
                  <input 
                    type="text" 
                    data-rfid-input="true"
                    value={newUser.rfidCardId}
                    onChange={(e) => setNewUser({...newUser, rfidCardId: e.target.value})}
                    className="w-full px-4 py-3 bg-cyan-50/50 border border-cyan-200 rounded-2xl outline-none focus:ring-2 focus:ring-cyan-500 font-mono text-cyan-900 font-bold text-sm placeholder-slate-400"
                    placeholder="Hold RFID card to scanner, or leave blank to use Employee ID..."
                  />
                  <p className="text-[11px] text-slate-400">
                    Hold any physical RFID badge / NFC card against the counter reader to capture it immediately.
                  </p>
                </div>

                <button 
                  type="submit"
                  className="md:col-span-2 py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 flex items-center justify-center gap-2 mt-2"
                >
                  <Check className="w-5 h-5 text-emerald-400" />
                  <span>Submit Enrollment for Approval</span>
                </button>
              </form>
            </div>
          </motion.div>
        )}

        {/* MASS ALLOCATION TAB (Split by Department or Employment Type) */}
        {activeTab === 'alloc' && (currentAdmin?.adminLevel === 1 || currentAdmin?.email === 'ayodejikolawole99@gmail.com') && (
          <motion.div 
            key="alloc"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="max-w-2xl mx-auto"
          >
            <div className="bg-white p-10 rounded-3xl border border-slate-200 shadow-xl">
              <div className="mb-8 text-center">
                <div className="w-16 h-16 bg-cyan-50 rounded-2xl flex items-center justify-center mx-auto mb-4 text-cyan-600">
                  <Ticket className="w-8 h-8" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900">Mass Ticket Management</h2>
                <p className="text-slate-500 text-xs mt-1">Allocate or deduct tickets across an entire Department or Employment category.</p>
              </div>

              <div className="space-y-6">
                {/* Mode Selector */}
                <div className="flex bg-slate-50 p-1.5 rounded-2xl border border-slate-100 gap-1">
                   <button
                    onClick={() => setBatchAlloc({...batchAlloc, mode: 'add'})}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${
                      batchAlloc.mode === 'add' ? 'bg-white text-cyan-600 shadow-sm border border-slate-100' : 'text-slate-400 hover:text-slate-600'
                    }`}
                   >
                     Add / Allocate Credits
                   </button>
                   <button
                    onClick={() => setBatchAlloc({...batchAlloc, mode: 'subtract'})}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${
                      batchAlloc.mode === 'subtract' ? 'bg-white text-red-600 shadow-sm border border-slate-100' : 'text-slate-400 hover:text-slate-600'
                    }`}
                   >
                     Deduct / Reduce Credits
                   </button>
                </div>

                {/* Target Type Selector */}
                <div className="space-y-4">
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setBatchAlloc({...batchAlloc, targetType: 'department', targetValue: ''})}
                      className={`flex-1 py-2.5 px-4 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                        batchAlloc.targetType === 'department'
                          ? 'bg-cyan-50 border-cyan-300 text-cyan-800'
                          : 'bg-white border-slate-200 text-slate-500'
                      }`}
                    >
                      <Building2 className="w-4 h-4" />
                      <span>Target by Department</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setBatchAlloc({...batchAlloc, targetType: 'employmentType', targetValue: ''})}
                      className={`flex-1 py-2.5 px-4 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                        batchAlloc.targetType === 'employmentType'
                          ? 'bg-cyan-50 border-cyan-300 text-cyan-800'
                          : 'bg-white border-slate-200 text-slate-500'
                      }`}
                    >
                      <Briefcase className="w-4 h-4" />
                      <span>Target by Employment Type</span>
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase">
                      Select {batchAlloc.targetType === 'department' ? 'Department' : 'Employment Type'}
                    </label>
                    <select 
                      value={batchAlloc.targetValue}
                      onChange={(e) => setBatchAlloc({...batchAlloc, targetValue: e.target.value})}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-cyan-500 text-sm font-medium"
                    >
                      <option value="">Choose target...</option>
                      {(batchAlloc.targetType === 'department' ? DEPARTMENTS : EMPLOYMENT_TYPES).map(item => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase">
                      {batchAlloc.mode === 'add' ? 'Credits to Add' : 'Credits to Deduct'}
                    </label>
                    <input 
                      type="number" 
                      value={batchAlloc.amount}
                      onChange={(e) => setBatchAlloc({...batchAlloc, amount: parseInt(e.target.value) || 0})}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none text-sm font-bold"
                      min="1"
                    />
                  </div>
                </div>

                {batchAlloc.targetValue && (
                  <div className="p-4 rounded-2xl bg-cyan-50 border border-cyan-200 text-xs font-medium text-cyan-800">
                    This will adjust tickets for {
                      users.filter(u => 
                        u.status === 'active' && 
                        (batchAlloc.targetType === 'department' ? u.department === batchAlloc.targetValue : u.employmentType === batchAlloc.targetValue)
                      ).length
                    } active employees.
                  </div>
                )}

                <button 
                  onClick={handleBatchAllocation}
                  disabled={batchAlloc.isProcessing || !batchAlloc.targetValue}
                  className="w-full py-4 text-white rounded-2xl font-bold disabled:opacity-50 transition-all shadow-lg bg-cyan-600 hover:bg-cyan-700 text-sm"
                >
                  {batchAlloc.isProcessing ? 'Processing Batch...' : `Execute Mass ${batchAlloc.mode === 'add' ? 'Allocation' : 'Deduction'}`}
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* APPROVALS TAB */}
        {activeTab === 'approvals' && (
          <motion.div 
            key="approvals"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-8"
          >
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-900 text-lg">Enrollment Approval Queue</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {currentAdmin?.adminLevel === 2 
                      ? "Level 1 requests waiting for your confirmation." 
                      : "Pending requests waiting for Level 2 confirmation."
                    }
                  </p>
                </div>
                <div className="px-3 py-1 bg-white rounded-lg text-xs font-bold text-cyan-600 shadow-sm border border-slate-200">
                  {pendingUsers.length} PENDING
                </div>
              </div>

              {pendingUsers.length === 0 ? (
                <div className="p-16 text-center space-y-3">
                  <CheckCircle2 className="w-12 h-12 text-emerald-300 mx-auto" />
                  <p className="text-slate-400 font-medium italic text-sm">Approval queue is clear.</p>
                </div>
              ) : (
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-50">
                      <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Candidate</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Classification</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">RFID Card</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {pendingUsers.map(user => (
                      <tr key={user.id}>
                        <td className="px-6 py-4">
                          <p className="font-bold text-slate-900 text-sm">{user.name}</p>
                          <p className="text-xs font-mono text-slate-400 uppercase">{user.id}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-xs font-bold text-slate-700">{user.department}</p>
                          <p className="text-[10px] text-slate-400">{user.employmentType || 'Standard'}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-xs font-mono font-bold text-cyan-700 bg-cyan-50 px-2 py-1 rounded-md border border-cyan-100">
                            {user.rfidCardId || user.id}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          {(currentAdmin?.adminLevel === 2 || currentAdmin?.email === 'ayodejikolawole99@gmail.com') ? (
                            <div className="flex justify-end gap-2">
                              <button 
                                onClick={() => handleApprove(user.id, 'reject')}
                                className="p-2.5 bg-red-50 text-red-500 rounded-xl hover:bg-red-100 transition-colors"
                              >
                                <XCircle className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => handleApprove(user.id, 'approve')}
                                className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors"
                              >
                                Approve Enrollment
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs font-bold text-amber-500 bg-amber-50 px-3 py-1 rounded-full uppercase">
                               Awaiting Level 2
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </motion.div>
        )}

        {/* PERSONNEL REGISTRY & RFID CARD MANAGEMENT (NO BIOMETRICS) */}
        {activeTab === 'staff' && (
          <motion.div 
            key="staff"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h3 className="font-bold text-slate-900 text-lg">Active Personnel & RFID Cards</h3>
                        <p className="text-xs text-slate-500 mt-0.5">Manage employee classifications and tap-link RFID cards.</p>
                    </div>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input 
                          type="text" 
                          placeholder="Search name, ID, or RFID card..." 
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="pl-10 pr-4 py-2 bg-slate-50 rounded-xl text-xs outline-none w-full md:w-64 border border-slate-100 focus:border-cyan-300 transition-colors" 
                        />
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-slate-50">
                                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Name & ID</th>
                                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Department</th>
                                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Employment Type</th>
                                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">RFID Card UID</th>
                                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tickets</th>
                                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {activeUsers
                              .filter(u => 
                                u.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                u.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                (u.department && u.department.toLowerCase().includes(searchQuery.toLowerCase())) ||
                                (u.employmentType && u.employmentType.toLowerCase().includes(searchQuery.toLowerCase())) ||
                                (u.rfidCardId && u.rfidCardId.toLowerCase().includes(searchQuery.toLowerCase()))
                              )
                              .map(user => (
                                <tr key={user.id} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-6 py-4">
                                        <p className="text-sm font-bold text-slate-900">{user.name}</p>
                                        <p className="text-[10px] font-mono text-slate-400 uppercase">{user.id}</p>
                                    </td>
                                    <td className="px-6 py-4">
                                      {isCollarStaff(user.employmentType || '') ? (
                                        <span className="text-[10px] font-bold uppercase bg-cyan-50 border border-cyan-100 text-cyan-800 px-2.5 py-1 rounded-md">
                                          {user.department}
                                        </span>
                                      ) : (
                                        <span className="text-[10px] font-medium text-slate-400 italic">
                                          Direct ({user.employmentType || 'Staff'})
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2.5 py-1 rounded-md">
                                            {user.employmentType || 'Unassigned'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                      <span className="px-2.5 py-1 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 w-fit bg-slate-100 text-slate-800 border border-slate-200">
                                        <CreditCard className="w-3.5 h-3.5 text-cyan-600" />
                                        {user.rfidCardId || `Default (${user.id})`}
                                      </span>
                                    </td>
                                    <td className="px-6 py-4 font-mono text-sm">
                                        <span className={user.ticketsBalance > 0 ? 'text-emerald-600 font-bold' : 'text-red-500 font-bold'}>
                                            {user.ticketsBalance}
                                        </span>
                                        <span className="text-slate-300"> / {user.weeklyAllocation}</span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex justify-end gap-2">
                                            {/* Link / Reassign RFID Card Button */}
                                            <button 
                                                onClick={() => {
                                                  setLinkingRfidUser(user);
                                                  setScannedModalCard(user.rfidCardId || '');
                                                }}
                                                className="px-3 py-1.5 bg-cyan-50 text-cyan-700 border border-cyan-200 rounded-xl hover:bg-cyan-100 transition-colors text-xs font-bold flex items-center gap-1.5"
                                                title="Link/Change Physical RFID Card"
                                            >
                                                <CreditCard className="w-3.5 h-3.5 text-cyan-600" />
                                                <span>Link Card</span>
                                            </button>

                                            <button 
                                                onClick={() => requestDelete(user.id)}
                                                className="p-2 bg-red-50 text-red-500 rounded-xl hover:bg-red-100 transition-colors"
                                                title="Request Deletion"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {activeUsers.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="p-12 text-center text-slate-400 italic">No active personnel found.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* QUICK ASSIGN RFID CARD MODAL */}
      {linkingRfidUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl border border-slate-100"
          >
            <div className="w-16 h-16 bg-cyan-50 border border-cyan-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-cyan-600">
              <CreditCard className="w-8 h-8" />
            </div>

            <h3 className="text-xl font-bold text-center text-slate-900 mb-1">
              Link RFID Badge
            </h3>
            <p className="text-xs text-center text-slate-500 mb-6">
              Assign a physical card or NFC badge to <strong>{linkingRfidUser.name}</strong> ({linkingRfidUser.department} • {linkingRfidUser.employmentType || 'Staff'}).
            </p>

            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-center">
                <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Tap Card on Reader</p>
                <input 
                  type="text" 
                  data-rfid-input="true"
                  autoFocus
                  value={scannedModalCard}
                  onChange={(e) => setScannedModalCard(e.target.value)}
                  placeholder="Hold card to scanner or type UID..."
                  className="w-full text-center py-2 px-3 bg-white border border-slate-300 rounded-xl font-mono text-sm font-bold text-slate-900 outline-none focus:border-cyan-500"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const testCard = 'RFID-' + Math.floor(10000000 + Math.random() * 90000000);
                    setScannedModalCard(testCard);
                  }}
                  className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition-colors"
                >
                  Generate Test UID
                </button>
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-100">
                <button
                  onClick={() => {
                    setLinkingRfidUser(null);
                    setScannedModalCard('');
                  }}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold text-xs transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveRfidAssignment}
                  disabled={!scannedModalCard.trim()}
                  className="flex-1 py-3 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white rounded-xl font-bold text-xs transition-colors shadow-lg shadow-cyan-100"
                >
                  Save Badge
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
