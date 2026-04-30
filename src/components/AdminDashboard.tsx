import { collection, doc, getDocs, onSnapshot, query, serverTimestamp, setDoc, updateDoc, deleteDoc, where } from 'firebase/firestore';
import { BarChart3, FileText, Plus, Search, Users, CheckCircle2, XCircle, Trash2, ShieldCheck, Ticket } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import React, { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { AttendanceRecord, UserProfile } from '../types';
import { useAuth } from '../hooks/useAuth';

export default function AdminDashboard() {
  const { profile: currentAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<'enroll' | 'reports' | 'alloc' | 'approvals' | 'permissions'>('reports');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  
  // New User Form State
  const [newUser, setNewUser] = useState({
    id: '',
    name: '',
    department: '',
    role: 'user' as const,
    weeklyAllocation: 5,
    biometricToken: '',
  });

  const [batchAlloc, setBatchAlloc] = useState({
    department: '',
    amount: 5,
    isProcessing: false
  });

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

  const handleEnrollUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.id || !newUser.name) return;

    try {
      await setDoc(doc(db, 'users', newUser.id), {
        ...newUser,
        ticketsBalance: newUser.weeklyAllocation,
        status: 'pending_approval',
        createdAt: new Date().toISOString(),
      });
      alert("User enrollment submitted for approval.");
      setNewUser({ id: '', name: '', department: '', role: 'user', weeklyAllocation: 5, biometricToken: '' });
      setActiveTab('approvals');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'users');
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
    if (!batchAlloc.department) return;
    setBatchAlloc(prev => ({ ...prev, isProcessing: true }));
    
    try {
      const usersToUpdate = users.filter(u => u.department === batchAlloc.department && u.status === 'active');
      const updates = usersToUpdate.map(user => 
        updateDoc(doc(db, 'users', user.id), {
          ticketsBalance: user.ticketsBalance + batchAlloc.amount
        })
      );
      
      await Promise.all(updates);
      alert(`Successfully allocated ${batchAlloc.amount} tickets to ${usersToUpdate.length} staff in ${batchAlloc.department}`);
      setBatchAlloc(prev => ({ ...prev, department: '', isProcessing: false }));
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'users/batch');
      setBatchAlloc(prev => ({ ...prev, isProcessing: false }));
    }
  };

  const getDepartmentStats = () => {
    const stats: Record<string, number> = {};
    attendance.forEach(record => {
      stats[record.department] = (stats[record.department] || 0) + 1;
    });
    return Object.entries(stats).map(([name, value]) => ({ name, value }));
  };

  const pendingUsers = users.filter(u => u.status === 'pending_approval');
  const deletionRequests = users.filter(u => u.status === 'pending_deletion');
  const activeUsers = users.filter(u => u.status === 'active');

  return (
    <div className="space-y-6">
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
          <button 
            onClick={() => setActiveTab('enroll')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
              activeTab === 'enroll' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <Plus className="w-4 h-4" />
            Enrollment
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
          <button 
            onClick={() => setActiveTab('permissions')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
              activeTab === 'permissions' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            Roles & Permissions
          </button>
        </nav>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'reports' && (
          <motion.div 
            key="reports"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-8"
          >
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
                <h3 className="font-bold text-slate-900 flex items-center gap-2 mb-8 text-lg">
                  <BarChart3 className="w-6 h-6 text-cyan-600" />
                  Feeding by Department
                </h3>
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={getDepartmentStats()}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                      <Tooltip 
                        contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}
                        cursor={{ fill: '#f8fafc' }}
                      />
                      <Bar dataKey="value" fill="#0891b2" radius={[6, 6, 0, 0]} barSize={48} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="font-bold text-slate-900 text-lg">Live Attendance Logs</h3>
                  <button className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-600 flex items-center gap-2 transition-colors">
                    <FileText className="w-4 h-4" />
                    Export CSV
                  </button>
                </div>
                <div className="max-h-[500px] overflow-y-auto">
                  <table className="w-full text-left">
                    <thead className="sticky top-0 bg-white/80 backdrop-blur-md shadow-sm z-10 border-b border-slate-100">
                      <tr>
                        <th className="px-8 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Employee</th>
                        <th className="px-8 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Department</th>
                        <th className="px-8 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Meal Type</th>
                        <th className="px-8 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {attendance.sort((a, b) => b.timestamp?.toMillis() - a.timestamp?.toMillis()).map(record => (
                        <tr key={record.id} className="hover:bg-slate-50/50">
                          <td className="px-8 py-4 text-sm font-bold text-slate-900">{record.userName}</td>
                          <td className="px-8 py-4">
                             <span className="text-[10px] font-bold uppercase bg-slate-100 px-2 py-1 rounded-md text-slate-500">{record.department}</span>
                          </td>
                          <td className="px-8 py-4 text-sm text-cyan-600 font-medium">{record.mealType}</td>
                          <td className="px-8 py-4 text-sm text-slate-400 text-right">{record.timestamp?.toDate().toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="lg:col-span-1 space-y-6">
              <div className="bg-slate-900 rounded-3xl p-8 text-white">
                <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-8">System Overview</h4>
                <div className="space-y-6">
                  <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl">
                    <p className="text-xs text-slate-400 font-bold uppercase">Meals Today</p>
                    <p className="text-3xl font-bold text-cyan-400">{attendance.length}</p>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl">
                    <p className="text-xs text-slate-400 font-bold uppercase">Active Staff</p>
                    <p className="text-3xl font-bold text-emerald-400">{activeUsers.length}</p>
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

        {activeTab === 'enroll' && (
          <motion.div 
            key="enroll"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="max-w-3xl mx-auto"
          >
            <div className="bg-white p-10 rounded-3xl border border-slate-200 shadow-xl">
              <div className="mb-10">
                <h2 className="text-2xl font-bold text-slate-900">New Staff Enrollment</h2>
                <p className="text-slate-500">Add a new employee to the system. Requires checker approval.</p>
              </div>

              <form onSubmit={handleEnrollUser} className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase">Employee ID</label>
                  <input 
                    type="text" 
                    value={newUser.id}
                    onChange={(e) => setNewUser({...newUser, id: e.target.value})}
                    className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-cyan-500 font-mono"
                    placeholder="EMP-001"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase">Full Name</label>
                  <input 
                    type="text" 
                    value={newUser.name}
                    onChange={(e) => setNewUser({...newUser, name: e.target.value})}
                    className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-cyan-500"
                    placeholder="Jane Doe"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase">Department</label>
                  <select 
                    value={newUser.department}
                    onChange={(e) => setNewUser({...newUser, department: e.target.value})}
                    className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-cyan-500"
                    required
                  >
                    <option value="">Select Department</option>
                    <option value="White collar staff">White collar staff</option>
                    <option value="Blue collar staff">Blue collar staff</option>
                    <option value="Delog">Delog</option>
                    <option value="Tuskeegee">Tuskeegee</option>
                    <option value="Medical">Medical</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase">Weekly Allocation</label>
                  <input 
                    type="number" 
                    value={newUser.weeklyAllocation}
                    onChange={(e) => setNewUser({...newUser, weeklyAllocation: parseInt(e.target.value)})}
                    className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-cyan-500"
                    min="1"
                    required
                  />
                </div>
                <div className="md:col-span-2 space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase">Biometric Token</label>
                  <input 
                    type="text" 
                    value={newUser.biometricToken}
                    onChange={(e) => setNewUser({...newUser, biometricToken: e.target.value})}
                    className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-cyan-500 font-mono"
                    placeholder="BIO-HASH-XXX"
                    required
                  />
                </div>
                <button 
                  type="submit"
                  className="md:col-span-2 py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-xl shadow-slate-200"
                >
                  Create Enrollment Request
                </button>
              </form>
            </div>
          </motion.div>
        )}

        {activeTab === 'alloc' && (
          <motion.div 
            key="alloc"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="max-w-2xl mx-auto"
          >
            <div className="bg-white p-10 rounded-3xl border border-slate-200 shadow-xl">
              <div className="mb-10 text-center">
                <div className="w-16 h-16 bg-cyan-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Ticket className="w-8 h-8 text-cyan-600" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900">Mass Ticket Refill</h2>
                <p className="text-slate-500">Allocate tickets to an entire department instantly.</p>
              </div>

              <div className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase">Target Department</label>
                    <select 
                      value={batchAlloc.department}
                      onChange={(e) => setBatchAlloc({...batchAlloc, department: e.target.value})}
                      className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-cyan-500"
                    >
                      <option value="">Select Department...</option>
                      <option value="White collar staff">White collar staff</option>
                      <option value="Blue collar staff">Blue collar staff</option>
                      <option value="Delog">Delog</option>
                      <option value="Tuskeegee">Tuskeegee</option>
                      <option value="Medical">Medical</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase">Refill Amount</label>
                    <input 
                      type="number"
                      value={batchAlloc.amount}
                      onChange={(e) => setBatchAlloc({...batchAlloc, amount: parseInt(e.target.value)})}
                      className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none"
                      min="1"
                    />
                  </div>
                </div>

                <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
                  <p className="text-xs text-blue-700 font-medium">
                    This will affect {users.filter(u => u.department === batchAlloc.department && u.status === 'active').length} staff members.
                  </p>
                </div>

                <button 
                  onClick={handleBatchAllocation}
                  disabled={batchAlloc.isProcessing || !batchAlloc.department}
                  className="w-full py-5 bg-cyan-600 text-white rounded-2xl font-bold hover:bg-cyan-700 disabled:opacity-50 transition-all shadow-lg shadow-cyan-100"
                >
                  {batchAlloc.isProcessing ? 'Processing Batch...' : 'Confirm Mass Allocation'}
                </button>
              </div>
            </div>
          </motion.div>
        )}

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
                  <p className="text-sm text-slate-500">Level 1 requests waiting for Level 2 confirmation.</p>
                </div>
                <div className="px-3 py-1 bg-white rounded-lg text-xs font-bold text-cyan-600 shadow-sm border border-slate-200">
                  {pendingUsers.length} PENDING
                </div>
              </div>

              {pendingUsers.length === 0 ? (
                <div className="p-20 text-center space-y-4">
                  <CheckCircle2 className="w-12 h-12 text-emerald-100 mx-auto" />
                  <p className="text-slate-400 font-medium italic">Approval queue is clear.</p>
                </div>
              ) : (
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-50">
                      <th className="px-8 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Candidate</th>
                      <th className="px-8 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Details</th>
                      <th className="px-8 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {pendingUsers.map(user => (
                      <tr key={user.id}>
                        <td className="px-8 py-6">
                          <p className="font-bold text-slate-900">{user.name}</p>
                          <p className="text-xs font-mono text-slate-400 uppercase">{user.id}</p>
                        </td>
                        <td className="px-8 py-6">
                           <p className="text-xs font-bold text-slate-600 mb-1">{user.department}</p>
                           <p className="text-[10px] text-slate-400">ALLOCATION: {user.weeklyAllocation} TICKETS/WK</p>
                        </td>
                        <td className="px-8 py-6 text-right">
                          <div className="flex justify-end gap-3">
                            <button 
                              onClick={() => handleApprove(user.id, 'reject')}
                              className="p-3 bg-red-50 text-red-500 rounded-xl hover:bg-red-100 transition-colors"
                            >
                              <XCircle className="w-5 h-5" />
                            </button>
                            <button 
                              onClick={() => handleApprove(user.id, 'approve')}
                              className="px-6 py-3 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-slate-800 transition-colors"
                            >
                              Approve Enrollment
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
               <div className="p-6 bg-red-50 border-b border-red-100 flex items-center justify-between">
                  <h3 className="font-bold text-red-900 text-lg">Deletion Requests</h3>
                  <div className="px-3 py-1 bg-white rounded-lg text-xs font-bold text-red-600 shadow-sm border border-red-100">
                    {deletionRequests.length} REQUESTS
                  </div>
               </div>

               {deletionRequests.length === 0 ? (
                 <div className="p-20 text-center text-slate-300 italic">No deletion requests.</div>
               ) : (
                 <table className="w-full text-left">
                   <tbody className="divide-y divide-slate-50">
                     {deletionRequests.map(user => (
                       <tr key={user.id}>
                         <td className="px-8 py-6">
                            <p className="font-bold text-slate-900">{user.name}</p>
                            <p className="text-xs text-slate-400">{user.id} • {user.department}</p>
                         </td>
                         <td className="px-8 py-6 text-right">
                           <div className="flex justify-end gap-3">
                             <button 
                               onClick={() => handleApprove(user.id, 'approve')} // Approval effectively clears deletion status if rejected or resets it
                               className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-50 rounded-lg"
                             >
                               Cancel Deletion
                             </button>
                             <button 
                               onClick={() => handleApprove(user.id, 'finalize_delete')}
                               className="px-6 py-3 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-700"
                             >
                               Finalize Removal
                             </button>
                           </div>
                         </td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
               )}
            </div>
          </motion.div>
        )}
        {activeTab === 'permissions' && (
          <motion.div 
            key="permissions"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-8 border-b border-slate-100">
                <h3 className="text-xl font-bold text-slate-900 mb-2">User Access Control</h3>
                <p className="text-slate-500">Manage administrative privileges and role assignments across the organization.</p>
              </div>

              <div className="p-8">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {users.sort((a, b) => a.name.localeCompare(b.name)).map(user => (
                    <div key={user.id} className="p-6 border border-slate-100 rounded-2xl bg-slate-50/30 space-y-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-bold text-slate-900">{user.name}</p>
                          <p className="text-[10px] font-mono text-slate-400 uppercase">{user.id}</p>
                        </div>
                        <div className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase ${
                          user.role === 'admin' ? 'bg-cyan-100 text-cyan-700' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {user.role}
                        </div>
                      </div>

                      <div className="pt-2 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-slate-500">Admin Level</span>
                          <select 
                            value={user.adminLevel || 0}
                            onChange={async (e) => {
                              const level = parseInt(e.target.value);
                              if (currentAdmin?.adminLevel !== 2) {
                                alert("Only Level 2 Admin can change permissions.");
                                return;
                              }
                              try {
                                await updateDoc(doc(db, 'users', user.id), {
                                  adminLevel: level,
                                  role: level > 0 ? 'admin' : 'user'
                                });
                              } catch (err) {
                                handleFirestoreError(err, OperationType.WRITE, 'users/permissions');
                              }
                            }}
                            className="text-xs bg-white border border-slate-200 rounded-lg px-2 py-1 outline-none font-bold"
                          >
                            <option value={0}>None (User)</option>
                            <option value={1}>Level 1 (Maker)</option>
                            <option value={2}>Level 2 (Checker)</option>
                          </select>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-slate-500">Department</span>
                          <span className="text-xs font-bold text-slate-600">{user.department}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main User List (Always visible in Reports or common view if needed) */}
      {activeTab === 'reports' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-bold text-slate-900">Manage Active Staff</h3>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input type="text" placeholder="Search staff..." className="pl-10 pr-4 py-2 bg-slate-50 rounded-xl text-xs outline-none" />
                </div>
            </div>
            <table className="w-full text-left">
                <thead>
                    <tr className="bg-slate-50">
                        <th className="px-8 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Name</th>
                        <th className="px-8 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tickets</th>
                        <th className="px-8 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</th>
                        <th className="px-8 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                    {activeUsers.map(user => (
                        <tr key={user.id}>
                            <td className="px-8 py-4">
                                <p className="text-sm font-bold text-slate-900">{user.name}</p>
                                <p className="text-[10px] font-mono text-slate-400">{user.id}</p>
                            </td>
                            <td className="px-8 py-4 font-mono text-sm">
                                <span className={user.ticketsBalance > 0 ? 'text-emerald-600' : 'text-red-500'}>
                                    {user.ticketsBalance}
                                </span>
                                <span className="text-slate-300"> / {user.weeklyAllocation}</span>
                            </td>
                            <td className="px-8 py-4">
                                <span className="text-[10px] font-bold uppercase bg-emerald-50 text-emerald-600 px-2 py-1 rounded-md">ACTIVE</span>
                            </td>
                            <td className="px-8 py-4 text-right">
                                <button 
                                    onClick={() => requestDelete(user.id)}
                                    className="p-2 text-slate-300 hover:text-red-500 transition-colors"
                                    title="Revoke Access"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
      )}
    </div>
  );
}

