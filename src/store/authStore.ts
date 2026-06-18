import { create } from 'zustand';
import { 
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User
} from '../lib/firebase';
import { auth, db } from '../lib/firebase';
import { doc, getDoc, collection, query, where, getDocs } from '../lib/firebase';
import toast from 'react-hot-toast';

interface UserData {
  uid: string;
  email: string | null;
  role: string;
  fullName: string;
  department?: string;
  permissions: string[];
}

// Helper function to determine user role based on email
const getUserRole = (email: string | null): 'hr' | 'user' => {
  if (!email) return 'user';
  return email.toLowerCase() === 'hr@enkonix.in' ? 'hr' : 'user';
};

interface AuthState {
  user: User | null;
  userData: UserData | null;
  loading: boolean;
  userRole: 'hr' | 'user';
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  setUser: (user: User | null) => void;
  setUserData: (userData: UserData | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  userData: null,
  loading: true,
  userRole: 'user',
  signIn: async (email: string, password: string) => {
    try {
      // Prevent sign-in for regular users if lockout is active
      const lockoutUntilRaw = localStorage.getItem('exam_lockout_until');
      if (lockoutUntilRaw) {
        const lockoutUntil = parseInt(lockoutUntilRaw, 10);
        if (!Number.isNaN(lockoutUntil) && Date.now() < lockoutUntil) {
          const msRemaining = lockoutUntil - Date.now();
          const minutes = Math.floor(msRemaining / 60000);
          const seconds = Math.ceil((msRemaining % 60000) / 1000);
          const timeLeft = `${minutes}m ${seconds}s`;
          toast.error(`Access locked due to violations. Try again in ${timeLeft}.`);
          throw new Error('User is currently locked out');
        }
      }

      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const userRole = getUserRole(userCredential.user.email);
      set({ user: userCredential.user, userRole });
      
      // Fetch additional user data from Firestore
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('uid', '==', userCredential.user.uid));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        const userData = querySnapshot.docs[0].data() as UserData;
        set({ userData });
      }
      
      toast.success('Successfully signed in!');
    } catch (error: any) {
      console.error('Sign in error:', error);
      toast.error(error.message || 'Failed to sign in');
      throw error;
    }
  },
  signOut: async () => {
    try {
      await firebaseSignOut(auth);
      set({ user: null, userData: null, userRole: 'user' });
      toast.success('Successfully signed out!');
    } catch (error: any) {
      console.error('Sign out error:', error);
      toast.error(error.message || 'Failed to sign out');
      throw error;
    }
  },
  setUser: (user) => {
    const userRole = getUserRole(user?.email || null);
    set({ user, loading: false, userRole });
  },
  setUserData: (userData) => set({ userData }),
}));

// Initialize auth state listener
onAuthStateChanged(auth, async (user) => {
  const state = useAuthStore.getState();
  if (user) {
    // Fetch user data when auth state changes
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('uid', '==', user.uid));
    const querySnapshot = await getDocs(q);
    
    if (!querySnapshot.empty) {
      const userData = querySnapshot.docs[0].data() as UserData;
      state.setUserData(userData);
    }
  } else {
    state.setUserData(null);
  }
  state.setUser(user);
});