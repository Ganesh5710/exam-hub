import { deleteApp, initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBJb3lqJWvft_Tdwbfb5eESp5VUf_jPQVM",
  authDomain: "exam-hub-enkonix.firebaseapp.com",
  projectId: "exam-hub-enkonix",
  storageBucket: "exam-hub-enkonix.firebasestorage.app",
  messagingSenderId: "939298750751",
  appId: "1:939298750751:web:7218264bfc1fca82db302a",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const analytics = isSupported().then((supported) =>
  supported ? getAnalytics(app) : null
);

export {
  addDoc,
  collection,
  createUserWithEmailAndPassword,
  deleteDoc,
  deleteField,
  doc,
  getAuth,
  getDoc,
  getDocs,
  limit,
  onAuthStateChanged,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  signInWithEmailAndPassword,
  signOut,
  Timestamp,
  updateDoc,
  where,
};
export type { User };

export const ROLES = {
  SUPER_ADMIN: "super_admin",
  ADMIN: "admin",
  PROJECT_MANAGER: "project_manager",
  TEAM_LEAD: "team_lead",
  DEVELOPER: "developer",
  DESIGNER: "designer",
  QA: "qa",
  MARKETING: "marketing",
  SALES: "sales",
  HR: "hr",
  MEMBER: "member",
} as const;

export const DEPARTMENTS = {
  ENGINEERING: "Engineering",
  DESIGN: "Design",
  PRODUCT: "Product",
  MARKETING: "Marketing",
  SALES: "Sales",
  HR: "Human Resources",
  OPERATIONS: "Operations",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];
export type Department = (typeof DEPARTMENTS)[keyof typeof DEPARTMENTS];

export const createAuthUserWithoutSwitchingSession = async (
  email: string,
  password = "123456"
) => {
  const secondaryApp = initializeApp(
    firebaseConfig,
    `secondary-auth-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  const secondaryAuth = getAuth(secondaryApp);

  try {
    return await createUserWithEmailAndPassword(secondaryAuth, email, password);
  } finally {
    await deleteApp(secondaryApp);
  }
};

export const createNewUser = async (userData: {
  email: string;
  password?: string;
  fullName: string;
  role: Role;
  department?: Department;
  permissions?: string[];
}) => {
  const userCredential = await createAuthUserWithoutSwitchingSession(
    userData.email,
    userData.password || "123456"
  );
  const { uid } = userCredential.user;
  const user = {
    uid,
    email: userData.email,
    fullName: userData.fullName,
    role: userData.role,
    department: userData.department || "",
    permissions: userData.permissions || [],
    createdAt: serverTimestamp(),
    status: "active",
  };

  await setDoc(doc(db, "users", uid), user);

  return {
    id: uid,
    ...user,
  };
};

export const getServerTime = async (): Promise<Date> => new Date();
