import { useEffect, useMemo, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  updateDoc,
} from "../lib/firebase";
import { db } from "../lib/firebase";
import { motion } from "framer-motion";
import {
  BookOpen,
  CheckSquare,
  Code,
  Users,
  Pencil,
  Trash2,
  Search,
  Info,
  UserPlus,
  Square,
  CheckSquare as FilledCheckSquare,
} from "lucide-react";
import toast from "react-hot-toast";

type Question = any;

const QuestionBank = () => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"mcq" | "code">("mcq");
  const [search, setSearch] = useState("");
  const [assigneeMap, setAssigneeMap] = useState<
    Record<string, { name: string; email: string }>
  >({});
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [userLoading, setUserLoading] = useState(false);

  // For multi-select
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showBulkUserDropdown, setShowBulkUserDropdown] = useState(false);
  const [showCheckboxes, setShowCheckboxes] = useState(false);

  // Fetch questions
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const qSnap = await getDocs(collection(db, "questions"));
        const list = qSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as Question[];
        setQuestions(list);

        // Preload assignees
        const allUids = new Set<string>();
        list.forEach((q: any) => {
          (Array.isArray(q.assignedTo) ? q.assignedTo : []).forEach(
            (u: string) => allUids.add(u)
          );
        });
        const map: Record<string, { name: string; email: string }> = {};
        await Promise.all(
          Array.from(allUids).map(async (uid) => {
            try {
              const userSnap = await getDoc(doc(db, "users", uid));
              if (userSnap.exists()) {
                const u: any = userSnap.data();
                map[uid] = {
                  name: u.fullName || u.name || u.email || "Unknown",
                  email: u.email || "unknown@example.com",
                };
              }
            } catch {
              // Missing assignee records are ignored; the UI falls back to the UID.
            }
          })
        );
        setAssigneeMap(map);
      } catch (e: any) {
        console.error(e);
        toast.error(e.message || "Failed to load questions");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const fetchUsers = async () => {
    try {
      setUserLoading(true);
      const snap = await getDocs(collection(db, "users"));
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setUsers(list);
    } catch (e: any) {
      toast.error("Failed to fetch users");
    } finally {
      setUserLoading(false);
    }
  };

  const filtered = useMemo(() => {
    return questions
      .filter((q: any) => q.type === tab)
      .filter((q: any) => {
        const hay = `${q.title || ""} ${q.description || ""} ${(
          q.tags || []
        ).join(" ")}`.toLowerCase();
        return hay.includes(search.toLowerCase());
      });
  }, [questions, tab, search]);

  const onDelete = async (id: string) => {
    if (!confirm("Delete this question?")) return;
    try {
      setActionLoadingId(id);
      await deleteDoc(doc(db, "questions", id));
      setQuestions((prev) => prev.filter((q: any) => q.id !== id));
      toast.success("Question deleted");
    } catch (e: any) {
      toast.error(e?.message || "Failed to delete");
    } finally {
      setActionLoadingId(null);
    }
  };

  const onEditTitle = async (q: any) => {
    const next = prompt("Update title", q.title || "");
    if (next == null) return;
    try {
      setActionLoadingId(q.id);
      await updateDoc(doc(db, "questions", q.id), { title: next });
      setQuestions((prev) =>
        prev.map((it: any) => (it.id === q.id ? { ...it, title: next } : it))
      );
      toast.success("Updated");
    } catch (e: any) {
      toast.error(e?.message || "Failed to update");
    } finally {
      setActionLoadingId(null);
    }
  };

  const onAssignUser = async (qId: string, userId: string) => {
    try {
      const qRef = doc(db, "questions", qId);
      const qSnap = await getDoc(qRef);
      const qData = qSnap.data();
      const current = Array.isArray(qData?.assignedTo) ? qData.assignedTo : [];
      if (current.includes(userId)) return;
      const updated = [...current, userId];
      await updateDoc(qRef, { assignedTo: updated });
      setQuestions((prev) =>
        prev.map((q: any) => (q.id === qId ? { ...q, assignedTo: updated } : q))
      );
    } catch {
      toast.error("Assignment failed");
    }
  };

  const onAssignMultiple = async (userId: string) => {
    try {
      for (const qId of selectedIds) {
        await onAssignUser(qId, userId);
      }
      setSelectedIds([]);
      setShowBulkUserDropdown(false);
      toast.success("Assigned successfully");
    } catch {
      toast.error("Bulk assignment failed");
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const renderAssignees = (q: any) => {
    const assigned: string[] = Array.isArray(q.assignedTo) ? q.assignedTo : [];
    const count = assigned.length;
    if (count === 0) return <span className="text-slate-500">Unassigned</span>;
    const toShow = assigned.slice(0, 5);
    return (
      <div className="space-y-1">
        <div className="text-sm">Assigned: {count}</div>
        <div className="grid grid-cols-1 sm:grid-cols-1gap-1">
          {toShow.map((uid) => {
            const info = assigneeMap[uid];
            return (
              <div
                key={uid}
                className="text-xs text-slate-600 dark:text-slate-300 truncate"
              >
                {info ? `${info.name} (${info.email})` : uid}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const QuestionCard = ({ q }: { q: any }) => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl p-6 bg-[#eff1f6] text-slate-800 shadow-md dark:bg-slate-800 dark:text-slate-100 transition-all duration-300 ${
        selectedIds.includes(q.id) ? "ring-2 ring-blue-600" : ""
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3 w-full">
          {/* Checkbox for both MCQ and Coding */}
          {showCheckboxes && (
            <button
              onClick={() => toggleSelect(q.id)}
              className="mt-1 text-blue-600"
            >
              {selectedIds.includes(q.id) ? (
                <FilledCheckSquare className="w-5 h-5" />
              ) : (
                <Square className="w-5 h-5" />
              )}
            </button>
          )}
          <div className="flex items-center gap-3 w-full">
            <div className="p-3 rounded-xl bg-[#f3f5fa] dark:bg-slate-700/70">
              {q.type === "mcq" ? (
                <CheckSquare className="w-5 h-5 text-blue-600" />
              ) : (
                <Code className="w-5 h-5 text-green-600" />
              )}
            </div>
            <div>
              <h3 className="font-semibold">{q.title || "Untitled"}</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 line-clamp-2 max-w-2xl">
                {q.description}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 ml-4">
          <button
            disabled={actionLoadingId === q.id}
            onClick={(e) => {
              e.stopPropagation();
              onEditTitle(q);
            }}
            className="px-3 py-2 rounded-lg bg-app-primary text-white hover:brightness-110 text-sm transition-all"
          >
            <Pencil className="w-4 h-4 mr-1 inline" /> Edit
          </button>
          <button
            disabled={actionLoadingId === q.id}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(q.id);
            }}
            className="px-3 py-2 rounded-lg bg-app-danger text-white hover:brightness-110 text-sm transition-all"
          >
            <Trash2 className="w-4 h-4 mr-1 inline" /> Delete
          </button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Meta */}
        <div className="p-4 rounded-xl bg-[#f3f5fa] dark:bg-slate-700/70">
          <div className="text-xs text-slate-500 flex items-center gap-1 mb-2">
            <Info className="w-3 h-3" /> Meta
          </div>
          <div className="text-sm">
            Difficulty: {q.difficulty || "-"}
            <br />
            Created: {q.createdAt?.toDate?.()?.toLocaleString?.() || "Unknown"}
          </div>
        </div>

        {/* Assignees */}
        <div className="p-4 rounded-xl bg-[#f3f5fa] dark:bg-slate-700/70">
          <div className="text-xs text-slate-500 flex items-center gap-1 mb-2">
            <Users className="w-3 h-3" /> Assignees
          </div>
          {renderAssignees(q)}
        </div>

        {/* Question Data */}
        <div className="p-4 rounded-xl bg-[#f3f5fa] dark:bg-slate-700/70 text-sm">
          {q.type === "mcq" ? (
            <div>
              <div className="text-xs text-slate-500 mb-2">Options</div>
              {(q.options || []).map((opt: string, i: number) => (
                <div
                  key={i}
                  className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-600 mb-1"
                >
                  {opt}
                  {q.answer === opt && (
                    <span className="ml-2 text-green-600 text-xs">✓</span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div>
              <div className="text-xs text-slate-500 mb-2">
                Problem Statement
              </div>
              <div className="max-h-24 overflow-auto bg-slate-100 dark:bg-slate-600 p-2 rounded">
                {q.problemStatement || "-"}
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-100 via-slate-200 to-slate-300 dark:from-slate-950 dark:via-slate-900 dark:to-black flex flex-col items-center py-10 px-4">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-7xl flex flex-col items-center text-center space-y-2"
      >
        <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          🧠 Question Bank
        </h1>
        <p className="text-slate-600 dark:text-slate-400 text-sm max-w-md">
          Effortlessly manage, search, and assign your questions in one elegant dashboard.
        </p>
      </motion.div>
  
      {/* Controls Panel */}
      <div className="w-full max-w-6xl mt-10 bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-6 flex flex-wrap justify-between items-center gap-4 transition-all duration-300">
        <div className="flex flex-wrap items-center gap-3">
          {/* Selection Mode */}
          <button
            onClick={() => {
              setShowCheckboxes(!showCheckboxes);
              setSelectedIds([]);
            }}
            className="text-blue-600 dark:text-blue-400 hover:scale-110 transition"
            title="Toggle Selection Mode"
          >
            {showCheckboxes ? (
              <FilledCheckSquare className="w-6 h-6" />
            ) : (
              <Square className="w-6 h-6" />
            )}
          </button>
  
          {/* Tabs */}
          <div className="flex rounded-xl overflow-hidden border border-slate-300 dark:border-slate-700">
            <button
              onClick={() => setTab("mcq")}
              className={`px-5 py-2 text-sm font-medium transition-all ${
                tab === "mcq"
                  ? "bg-blue-600 text-white shadow-md"
                  : "bg-slate-100 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              MCQ
            </button>
            <button
              onClick={() => setTab("code")}
              className={`px-5 py-2 text-sm font-medium transition-all ${
                tab === "code"
                  ? "bg-blue-600 text-white shadow-md"
                  : "bg-slate-100 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              Coding
            </button>
          </div>
  
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search questions..."
              className="pl-9 pr-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition w-64"
            />
          </div>
        </div>
  
        {/* Bulk Assign */}
        {selectedIds.length > 0 && (
          <div className="relative">
            <button
              onClick={async () => {
                if (users.length === 0) await fetchUsers();
                setShowBulkUserDropdown((v) => !v);
              }}
              className="px-5 py-2 flex items-center gap-2 bg-gradient-to-r from-blue-600 to-blue-500 text-white text-sm rounded-lg shadow-md hover:brightness-110 transition"
            >
              <UserPlus className="w-4 h-4" /> Assign Selected ({selectedIds.length})
            </button>
  
            {showBulkUserDropdown && (
              <div className="absolute right-0 mt-3 max-h-56 overflow-auto bg-white/90 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-2 shadow-2xl backdrop-blur-md z-10">
                {userLoading ? (
                  <p className="text-xs text-center text-slate-500">Loading...</p>
                ) : (
                  users.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => onAssignMultiple(u.id)}
                      className="block w-full text-left text-xs px-2 py-1 rounded hover:bg-blue-50 dark:hover:bg-slate-700 transition"
                    >
                      {u.fullName || u.name || u.email} ({u.email})
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>
  
      {/* Grid */}
      <div className="w-full max-w-6xl mt-10">
        {loading ? (
          <div className="text-center py-16 text-slate-600 dark:text-slate-400 text-lg font-medium">
            Loading questions...
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-slate-500 dark:text-slate-400">
            <BookOpen className="w-16 h-16 mx-auto mb-4 opacity-70" />
            No questions found.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-1gap-8">
            {filtered.map((q: any) => (
              <motion.div
                key={q.id}
                whileHover={{ scale: 1.02, y: -4 }}
                transition={{ type: "spring", stiffness: 250 }}
                className={`rounded-2xl border border-slate-200 dark:border-slate-700 p-6 
                  bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl 
                  shadow-xl hover:shadow-2xl transition-all duration-300
                  ${
                    selectedIds.includes(q.id)
                      ? "ring-2 ring-blue-600"
                      : "hover:ring-1 hover:ring-slate-300 dark:hover:ring-slate-700"
                  }`}
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    {showCheckboxes && (
                      <button
                        onClick={() => toggleSelect(q.id)}
                        className="text-blue-600"
                      >
                        {selectedIds.includes(q.id) ? (
                          <FilledCheckSquare className="w-5 h-5" />
                        ) : (
                          <Square className="w-5 h-5" />
                        )}
                      </button>
                    )}
                    <div
                      className={`p-3 rounded-xl ${
                        q.type === "mcq"
                          ? "bg-blue-100 dark:bg-blue-900/30"
                          : "bg-green-100 dark:bg-green-900/30"
                      }`}
                    >
                      {q.type === "mcq" ? (
                        <CheckSquare className="w-5 h-5 text-blue-600" />
                      ) : (
                        <Code className="w-5 h-5 text-green-600" />
                      )}
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">
                        {q.title || "Untitled"}
                      </h3>
                      <p className="text-sm text-slate-600 dark:text-slate-300 line-clamp-2 max-w-xl">
                        {q.description}
                      </p>
                    </div>
                  </div>
  
                  <div className="flex gap-2">
                    <button
                      onClick={() => onEditTitle(q)}
                      disabled={actionLoadingId === q.id}
                      className="px-3 py-1.5 rounded-lg text-xs bg-blue-600 text-white hover:bg-blue-700 transition"
                    >
                      <Pencil className="w-3.5 h-3.5 inline mr-1" /> Edit
                    </button>
                    <button
                      onClick={() => onDelete(q.id)}
                      disabled={actionLoadingId === q.id}
                      className="px-3 py-1.5 rounded-lg text-xs bg-red-600 text-white hover:bg-red-700 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5 inline mr-1" /> Delete
                    </button>
                  </div>
                </div>
  
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                  <div className="p-3 rounded-xl bg-slate-100/60 dark:bg-slate-800/50">
                    <div className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                      <Info className="w-3 h-3" /> Meta
                    </div>
                    <div>
                      <p>Difficulty: {q.difficulty || "-"}</p>
                      <p>
                        Created:{" "}
                        {q.createdAt?.toDate?.()?.toLocaleString?.() || "Unknown"}
                      </p>
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-100/60 dark:bg-slate-800/50">
                    <div className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                      <Users className="w-3 h-3" /> Assignees
                    </div>
                    {renderAssignees(q)}
                  </div>
                  <div className="p-3 rounded-xl bg-slate-100/60 dark:bg-slate-800/50">
                    {q.type === "mcq" ? (
                      <>
                        <div className="text-xs text-slate-500 mb-1">Options</div>
                        {(q.options || []).map((opt: string, i: number) => (
                          <div
                            key={i}
                            className="px-2 py-1 mb-1 rounded bg-slate-200 dark:bg-slate-700 flex justify-between items-center"
                          >
                            <span>{opt}</span>
                            {q.answer === opt && (
                              <span className="text-green-600 text-xs">✓</span>
                            )}
                          </div>
                        ))}
                      </>
                    ) : (
                      <>
                        <div className="text-xs text-slate-500 mb-1">
                          Problem Statement
                        </div>
                        <div className="max-h-24 overflow-auto bg-slate-200 dark:bg-slate-700 p-2 rounded text-xs">
                          {q.problemStatement || "-"}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
  
};

export default QuestionBank;
