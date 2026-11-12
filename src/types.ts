export type UserRole = 'user' | 'admin';

export interface UserProfile {
  id: string;
  name: string;
  employmentType?: string; // e.g. "White collar staff", "Blue collar staff", "Delog", "Tuskeegee", "Medical"
  department: string;     // e.g. "HR", "Engineering", "Finance", "Production", "Pre Press", "Logistics", "Quality", "SHER"
  role: UserRole;
  adminLevel?: number;
  status: 'pending_approval' | 'active' | 'pending_deletion';
  ticketsBalance: number;
  weeklyAllocation: number;
  rfidCardId?: string; // Serial / UID of the physical RFID or NFC card
  rfidCardAssignedAt?: string;
  email?: string;
  createdAt: string;
}

export interface AttendanceRecord {
  id: string;
  userId: string;
  userName: string;
  department: string;
  employmentType?: string;
  timestamp: any; // Firestore Timestamp
  mealType: string;
  authMethod?: 'rfid' | 'manual';
  cardId?: string;
}

export type MealType = 'Breakfast' | 'Lunch' | 'Dinner';
