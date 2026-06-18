type StoredDoc = Record<string, any>;

const STORAGE_KEY = "exam_portal_local_db";
const AUTH_KEY = "exam_portal_auth_user";

type LocalDatabase = Record<string, Record<string, StoredDoc>>;

const readDatabase = (): LocalDatabase => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
};

const writeDatabase = (database: LocalDatabase) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(database));
};

const createId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

export const analytics = null;
export const auth = {
  currentUser: JSON.parse(localStorage.getItem(AUTH_KEY) || "null"),
};
export const db = {};

export class Timestamp {
  private value: string;

  constructor(date = new Date()) {
    this.value = date.toISOString();
  }

  static now() {
    return new Timestamp();
  }

  static fromDate(date: Date) {
    return new Timestamp(date);
  }

  toDate() {
    return new Date(this.value);
  }

  toJSON() {
    return this.value;
  }
}

export const serverTimestamp = () => new Date().toISOString();
export const deleteField = () => undefined;

export const collection = (_db: unknown, name: string) => ({
  kind: "collection" as const,
  name,
});

export const doc = (_db: unknown, collectionName: string, id: string) => ({
  kind: "doc" as const,
  collectionName,
  id,
});

export const where = (field: string, op: string, value: unknown) => ({
  type: "where" as const,
  field,
  op,
  value,
});

export const orderBy = (field: string, direction: "asc" | "desc" = "asc") => ({
  type: "orderBy" as const,
  field,
  direction,
});

export const limit = (count: number) => ({ type: "limit" as const, count });

export const query = (collectionRef: ReturnType<typeof collection>, ...constraints: any[]) => ({
  ...collectionRef,
  constraints,
});

const normalizeDates = (value: any): any => {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalizeDates);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, normalizeDates(entry)])
    );
  }
  return value;
};

const wrapDoc = (id: string, data: StoredDoc) => ({
  id,
  data: () => clone(data),
  exists: () => true,
});

const getCollectionDocs = (collectionName: string, constraints: any[] = []) => {
  const database = readDatabase();
  let docs = Object.entries(database[collectionName] || {}).map(([id, data]) =>
    wrapDoc(id, data)
  );

  constraints.forEach((constraint) => {
    if (constraint.type === "where") {
      docs = docs.filter((item) => {
        const value = item.data()[constraint.field];
        return constraint.op === "==" ? value === constraint.value : true;
      });
    }

    if (constraint.type === "orderBy") {
      docs = [...docs].sort((a, b) => {
        const left = a.data()[constraint.field] ?? "";
        const right = b.data()[constraint.field] ?? "";
        const result = String(left).localeCompare(String(right));
        return constraint.direction === "desc" ? -result : result;
      });
    }

    if (constraint.type === "limit") {
      docs = docs.slice(0, constraint.count);
    }
  });

  return docs;
};

export const getDocs = async (ref: any) => {
  const docs = getCollectionDocs(ref.name, ref.constraints || []);
  return {
    docs,
    size: docs.length,
    empty: docs.length === 0,
    forEach: (callback: (doc: ReturnType<typeof wrapDoc>) => void) => docs.forEach(callback),
  };
};

export const getDoc = async (ref: ReturnType<typeof doc>) => {
  const data = readDatabase()[ref.collectionName]?.[ref.id];
  return data
    ? wrapDoc(ref.id, data)
    : { id: ref.id, data: () => undefined, exists: () => false };
};

export const setDoc = async (
  ref: ReturnType<typeof doc>,
  data: StoredDoc,
  options?: { merge?: boolean }
) => {
  const database = readDatabase();
  database[ref.collectionName] ||= {};
  database[ref.collectionName][ref.id] = options?.merge
    ? { ...(database[ref.collectionName][ref.id] || {}), ...normalizeDates(data) }
    : normalizeDates(data);
  writeDatabase(database);
};

export const addDoc = async (ref: ReturnType<typeof collection>, data: StoredDoc) => {
  const id = createId();
  await setDoc(doc(db, ref.name, id), data);
  return { id };
};

export const updateDoc = async (ref: ReturnType<typeof doc>, data: StoredDoc) => {
  await setDoc(ref, data, { merge: true });
};

export const deleteDoc = async (ref: ReturnType<typeof doc>) => {
  const database = readDatabase();
  delete database[ref.collectionName]?.[ref.id];
  writeDatabase(database);
};

export const onSnapshot = (ref: any, callback: (snapshot: any) => void) => {
  getDocs(ref).then(callback);
  return () => {};
};

export const getAuth = () => auth;

export const createUserWithEmailAndPassword = async (_auth: unknown, email: string) => {
  const uid = createId();
  const user = { uid, email };
  auth.currentUser = user;
  localStorage.setItem(AUTH_KEY, JSON.stringify(user));
  return { user };
};

export const signInWithEmailAndPassword = async (_auth: unknown, email: string) => {
  const users = await getDocs(query(collection(db, "users"), where("email", "==", email)));
  const user = users.docs[0]?.data();
  const authUser = { uid: user?.uid || users.docs[0]?.id || createId(), email };
  auth.currentUser = authUser;
  localStorage.setItem(AUTH_KEY, JSON.stringify(authUser));
  return { user: authUser };
};

export const signOut = async () => {
  auth.currentUser = null;
  localStorage.removeItem(AUTH_KEY);
};

export const onAuthStateChanged = (
  _auth: unknown,
  callback: (user: { uid: string; email: string } | null) => void
) => {
  callback(auth.currentUser);
  return () => {};
};

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

export const createNewUser = async (userData: {
  email: string;
  password?: string;
  fullName: string;
  role: Role;
  department?: Department;
  permissions?: string[];
}) => {
  const uid = createId();
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
  return { id: uid, ...userData, status: "active" };
};

export const getServerTime = async (): Promise<Date> => new Date();
