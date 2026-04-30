export type UserRole = 'user' | 'admin';

export interface UserProfile {
  id: string;
  name: string;
  department: string;
  role: UserRole;
  adminLevel?: number;
  status: 'pending_approval' | 'active' | 'pending_deletion';
  ticketsBalance: number;
  weeklyAllocation: number;
  biometricToken?: string;
  email?: string;
  createdAt: string;
}

export interface AttendanceRecord {
  id: string;
  userId: string;
  userName: string;
  department: string;
  timestamp: any; // Firestore Timestamp
  mealType: string;
}

export type MealType = 'Breakfast' | 'Lunch' | 'Dinner';
