import { create } from 'zustand';
import { 
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User
} from '../lib/firebase';
import { auth, db } from '../lib/firebase';
import { collection, doc, getDoc, getDocs, query, where } from '../lib/firebase';
import toast from 'react-hot-toast';

interface UserData {
  uid: string;
  email: string | null;
  role: string;
  fullName: string;
  department?: string;
  permissions: string[];
}

const AUTH_SESSION_KEY = 'exam_hub_active_login';
const ADMIN_EMAILS = new Set(['hr@enkonix.in', 'ceo@enkonix.in']);

const getUserRole = (email: string | null): 'hr' | 'user' => {
  if (email && ADMIN_EMAILS.has(email.toLowerCase())) return 'hr';
  return 'user';
};

const fetchUserData = async (uid: string): Promise<UserData | null> => {
  const directSnap = await getDoc(doc(db, 'users', uid));
  if (directSnap.exists()) {
    return directSnap.data() as UserData;
  }

  const usersRef = collection(db, 'users');
  const q = query(usersRef, where('uid', '==', uid));
  const querySnapshot = await getDocs(q);

  if (!querySnapshot.empty) {
    return querySnapshot.docs[0].data() as UserData;
  }

  return null;
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

      sessionStorage.setItem(AUTH_SESSION_KEY, 'true');
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const userData = await fetchUserData(userCredential.user.uid);
      const userRole = getUserRole(userCredential.user.email);
      set({ user: userCredential.user, userData, loading: false, userRole });
      
      toast.success('Successfully signed in!');
    } catch (error: any) {
      sessionStorage.removeItem(AUTH_SESSION_KEY);
      console.error('Sign in error:', error);
      toast.error(error.message || 'Failed to sign in');
      throw error;
    }
  },
  signOut: async () => {
    try {
      sessionStorage.removeItem(AUTH_SESSION_KEY);
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

  if (user && sessionStorage.getItem(AUTH_SESSION_KEY) !== 'true') {
    await firebaseSignOut(auth);
    state.setUserData(null);
    state.setUser(null);
    return;
  }

  if (user) {
    const userData = await fetchUserData(user.uid);
    state.setUserData(userData);
  } else {
    sessionStorage.removeItem(AUTH_SESSION_KEY);
    state.setUserData(null);
  }
  state.setUser(user);
});
