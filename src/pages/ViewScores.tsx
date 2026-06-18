import { useEffect, useState, useMemo, useCallback } from "react";
import {
  collection,
  getDocs,
  doc,
  getDoc,
  query,
  where,
  deleteDoc,
} from "../lib/firebase";
import { db } from "../lib/firebase";
import { motion } from "framer-motion";
import {
  Trophy,
  User,
  CheckCircle,
  XCircle,
  Code,
  FileText,
  Eye,
  Search,
  BarChart3,
  Mic,
  Headphones,
  Calculator,
  Trash2,
} from "lucide-react";
import { debounce } from "lodash";

// Enhanced TypeScript interfaces
interface CommunicationResponse {
  userId: string;
  questionIndex: number;
  question: string;
  responseText: string;
  score?: number;
  accuracyScore?: number;
}

interface ListeningScore {
  id: string;
  userId: string;
  testId: string;
  testTitle: string;
  score: number;
  total: number;
  percentage: number;
  completedAt: any;
  answers?: Array<{
    question: string;
    selectedOption: string;
    correctAnswer: string;
    isCorrect: boolean;
  }>;
  userEmail: string;
}

interface Round1 {
  correct: number;
  wrong: number;
  score: number;
  percentage: number;
  answers?: Record<
    string,
    {
      question: string;
      selected: string;
      correct: string;
      isCorrect: boolean;
    }
  >;
}

interface Round2 {
  percentage: number;
  passed: number;
  total: number;
  solutions: Array<{
    id: string;
    problemId: string;
    passed: number;
    total: number;
    code?: string;
  }>;
}

interface Round3 {
  score: number;
  total: number;
  avgAccuracy: number;
  percentage: number;
  responseCount: number;
}

interface Round4 {
  score: number;
  total: number;
  percentage: number;
  testCount: number;
  avgScore: number;
}

interface User {
  uid: string;
  name: string;
  email: string;
  round1: Round1;
  round2: Round2;
  round3: Round3;
  round4: Round4;
  totalScore: number;
  overallPercentage: number;
  weightedPercentage: number;
  isUnknown?: boolean; // Added to track deleted users
}

const roundWeights = {
  round1: 0.25,
  round2: 0.25,
  round3: 0.25,
  round4: 0.25,
} as const;

// Utility to get performance badge
const getPerformanceBadge = (percentage: number) => {
  if (percentage >= 90)
    return {
      label: "Excellent",
      color: "bg-green-100 text-green-800 border-green-200",
      level: "A",
    };
  if (percentage >= 80)
    return {
      label: "Very Good",
      color: "bg-blue-100 text-blue-800 border-blue-200",
      level: "B",
    };
  if (percentage >= 70)
    return {
      label: "Good",
      color: "bg-teal-100 text-teal-800 border-teal-200",
      level: "C",
    };
  if (percentage >= 60)
    return {
      label: "Average",
      color: "bg-yellow-100 text-yellow-800 border-yellow-200",
      level: "D",
    };
  if (percentage >= 35)
    return {
      label: "Below Average",
      color: "bg-orange-100 text-orange-800 border-orange-200",
      level: "E",
    };
  return {
    label: "Needs Improvement",
    color: "bg-red-100 text-red-800 border-red-200",
    level: "F",
  };
};

// Top Performers Component
const TopPerformers = ({ users }: { users: User[] }) => (
  <div className="rounded-2xl p-6 bg-gray-100 dark:bg-slate-800 shadow-lg">
    <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6 flex items-center">
      <Trophy className="w-6 h-6 text-blue-600 mr-2" />
      Top Three Performers
    </h2>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {users.slice(0, 3).map((user, index) => {
        const badge = getPerformanceBadge(user.weightedPercentage);
        return (
          <motion.div
            key={user.uid}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="relative rounded-2xl p-5 bg-gray-50 dark:bg-slate-700 shadow-md hover:-translate-y-0.5 transition-all"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold bg-gray-200 dark:bg-slate-600 text-blue-600">
                {index + 1}
              </div>
              <div
                className={`px-2 py-1 rounded-full text-xs font-semibold ${badge.color}`}
              >
                {badge.level}
              </div>
            </div>
            <h3 className="font-semibold text-gray-800 dark:text-white">
              {user.name}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">
              {user.email}
            </p>
            <div className="space-y-2">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {user.weightedPercentage}%
              </div>
              <div className="text-sm text-gray-500">Weighted Score</div>
            </div>
            <div className="flex items-center justify-between mt-3 text-xs">
              <span className="text-gray-500">Raw: {user.totalScore}</span>
              <span className="text-green-600">
                Avg: {user.overallPercentage}%
              </span>
            </div>
          </motion.div>
        );
      })}
      {users.length === 0 && (
        <div className="col-span-full text-center py-8 text-gray-500 dark:text-gray-400">
          No top performers found
        </div>
      )}
    </div>
  </div>
);

// Filters Component
const Filters = ({
  searchTerm,
  setSearchTerm,
  sortBy,
  setSortBy,
  filterByRound,
  setFilterByRound,
  showUnknownUsers,
  setShowUnknownUsers,
}: {
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  sortBy: string;
  setSortBy: (value: string) => void;
  filterByRound: string;
  setFilterByRound: (value: string) => void;
  showUnknownUsers: boolean;
  setShowUnknownUsers: (value: boolean) => void;
}) => (
  <div className="rounded-2xl p-6 bg-gray-100 dark:bg-slate-800 shadow-lg">
    <div className="flex flex-col sm:flex-row gap-4 items-center">
      <div className="flex-1 relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
        <input
          type="text"
          placeholder="Search by name or email..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-3 rounded-xl bg-gray-50 dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Search students by name or email"
        />
      </div>
      <div className="flex gap-4 items-center">
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="px-4 py-3 rounded-xl bg-gray-50 dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Sort results by"
        >
          <option value="weightedPercentage">Weighted Score</option>
          <option value="overallPercentage">Average Score</option>
          <option value="totalScore">Total Score</option>
          <option value="name">Name</option>
        </select>
        <select
          value={filterByRound}
          onChange={(e) => setFilterByRound(e.target.value)}
          className="px-4 py-3 rounded-xl bg-gray-50 dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Filter by round"
        >
          <option value="all">All Rounds</option>
          <option value="round1">Round 1</option>
          <option value="round2">Round 2</option>
          <option value="round3">Round 3</option>
          <option value="round4">Round 4</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            checked={showUnknownUsers}
            onChange={(e) => setShowUnknownUsers(e.target.checked)}
            className="rounded"
          />
          Show Unknown Users
        </label>
      </div>
    </div>
  </div>
);

const ViewScores = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<
    "name" | "totalScore" | "overallPercentage" | "weightedPercentage"
  >("weightedPercentage");
  const [filterByRound, setFilterByRound] = useState<
    "all" | "round1" | "round2" | "round3" | "round4"
  >("all");
  const [showUnknownUsers, setShowUnknownUsers] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commResponses, setCommResponses] = useState<CommunicationResponse[]>(
    []
  );
  const [listeningScores, setListeningScores] = useState<ListeningScore[]>([]);

  // Debounced search handler
  const debouncedSetSearchTerm = useCallback(
    debounce((value: string) => setSearchTerm(value), 300),
    []
  );

  // Updated fetchUserData with better fallback naming and unknown flag
  const fetchUserData = async (uid: string): Promise<User | null> => {
    try {
      const [userSnap, empSnap, round2Snap, commSnap, listeningSnap, resSnap] =
        await Promise.all([
          getDoc(doc(db, "users", uid)).catch(() => null),
          getDoc(doc(db, "employees", uid)).catch(() => null),
          getDocs(collection(db, "responses", uid, "round2")).catch(() => null),
          getDocs(
            query(
              collection(db, "communicationResponse"),
              where("userId", "==", uid)
            )
          ).catch(() => null),
          getDocs(
            query(collection(db, "listeningScores"), where("userId", "==", uid))
          ).catch(() => null),
          getDoc(doc(db, "responses", uid)).catch(() => null),
        ]);

      const data = resSnap?.exists() ? resSnap.data() : {};
      if (!data || Object.keys(data).length === 0) return null;

      let displayName = `User-${uid.substring(0, 8)}`; // Better fallback with UID prefix
      let displayEmail = `${uid.substring(0, 8)}@deleted.example.com`;
      const isUnknown = !userSnap?.exists() && !empSnap?.exists();

      if (userSnap?.exists()) {
        const u = userSnap.data() as any;
        displayName = u.fullName || u.name || u.email || displayName;
        displayEmail = u.email || displayEmail;
      } else if (empSnap?.exists()) {
        const emp = empSnap.data() as any;
        displayName = emp.name || displayName;
        displayEmail = emp.email || displayEmail;
      }

      const round1: Round1 = {
        correct: data.round1?.correct || 0,
        wrong: data.round1?.wrong || 0,
        score: data.round1?.score || 0,
        percentage: 0,
        answers: data.round1?.answers,
      };
      const r1TotalQuestions = round1.correct + round1.wrong;
      round1.percentage =
        r1TotalQuestions > 0
          ? Math.round((round1.score / r1TotalQuestions) * 100)
          : 0;

      let round2: Round2 = {
        percentage: 0,
        passed: 0,
        total: 0,
        solutions: [],
      };
      if (round2Snap) {
        round2.solutions = round2Snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
          passed: Number(d.data().passed) || 0,
          total: Number(d.data().total) || 0,
        }));
        round2.passed = round2.solutions.reduce((sum, s) => sum + s.passed, 0);
        round2.total = round2.solutions.reduce((sum, s) => sum + s.total, 0);
        round2.percentage =
          round2.total > 0
            ? Math.round((round2.passed / round2.total) * 100)
            : 0;
      }

      let round3: Round3 = {
        score: 0,
        total: 0,
        avgAccuracy: 0,
        percentage: 0,
        responseCount: 0,
      };
      if (commSnap) {
        const accuracyScores: number[] = [];
        commSnap.forEach((doc) => {
          const d = doc.data() as CommunicationResponse;
          round3.responseCount++;
          if (d.score !== undefined && !isNaN(Number(d.score))) {
            const score = Number(d.score);
            round3.score += score;
            round3.total += 100;
            accuracyScores.push(score);
          }
          if (
            d.accuracyScore !== undefined &&
            !isNaN(Number(d.accuracyScore))
          ) {
            accuracyScores.push(Number(d.accuracyScore));
          }
        });
        round3.avgAccuracy =
          accuracyScores.length > 0
            ? Math.round(
                accuracyScores.reduce((a, b) => a + b, 0) /
                  accuracyScores.length
              )
            : 0;
        round3.percentage =
          round3.total > 0
            ? Math.round((round3.score / round3.total) * 100)
            : 0;
      }

      let round4: Round4 = {
        score: 0,
        total: 0,
        percentage: 0,
        testCount: 0,
        avgScore: 0,
      };
      if (listeningSnap) {
        const percentages: number[] = [];
        listeningSnap.forEach((doc) => {
          const d = doc.data();
          round4.testCount++;
          const score = Number(d.score) || 0;
          const total = Number(d.total) || 0;
          const percentage = Number(d.percentage) || 0;
          round4.score += score;
          round4.total += total;
          percentages.push(percentage);
        });
        round4.percentage =
          round4.total > 0
            ? Math.round((round4.score / round4.total) * 100)
            : 0;
        round4.avgScore =
          percentages.length > 0
            ? Math.round(
                percentages.reduce((a, b) => a + b, 0) / percentages.length
              )
            : 0;
      }

      const totalScore =
        round1.score + round2.passed + round3.score + round4.score;
      const roundPercentages = [
        round1.percentage,
        round2.percentage,
        round3.percentage,
        round4.percentage,
      ].filter((p) => p > 0);
      const overallPercentage =
        roundPercentages.length > 0
          ? Math.round(
              roundPercentages.reduce((a, b) => a + b, 0) /
                roundPercentages.length
            )
          : 0;
      const weightedPercentage = Math.round(
        round1.percentage * roundWeights.round1 +
          round2.percentage * roundWeights.round2 +
          round3.percentage * roundWeights.round3 +
          round4.percentage * roundWeights.round4
      );

      return {
        uid,
        name: displayName,
        email: displayEmail,
        round1,
        round2,
        round3,
        round4,
        totalScore,
        overallPercentage,
        weightedPercentage,
        isUnknown,
      };
    } catch (error) {
      console.error(`Error fetching data for user ${uid}:`, error);
      return null;
    }
  };

  // Cleanup orphaned responses
  const cleanupOrphanedResponses = async () => {
    if (
      !confirm(
        "This will permanently delete scores for users without active profiles. Are you sure? This cannot be undone."
      )
    )
      return;
    setLoading(true);
    try {
      const resSnap = await getDocs(collection(db, "responses"));
      const deletePromises = resSnap.docs.map(async (res) => {
        const uid = res.id;
        const [userSnap, empSnap] = await Promise.all([
          getDoc(doc(db, "users", uid)).catch(() => null),
          getDoc(doc(db, "employees", uid)).catch(() => null),
        ]);
        if (!userSnap?.exists() && !empSnap?.exists()) {
          await deleteDoc(doc(db, "responses", uid));
          // Optionally delete subcollections (uncomment if needed)
          // await deleteCollection(db, "responses", uid, "round2");
          // await deleteCollection(db, "communicationResponse", uid); // Requires custom deleteCollection function
        }
      });
      await Promise.all(deletePromises);
      const updatedUsers = (
        await Promise.all(resSnap.docs.map((res) => fetchUserData(res.id)))
      ).filter((u): u is User => u !== null);
      setUsers(updatedUsers);
      alert("Cleanup complete!");
    } catch (error) {
      console.error("Cleanup error:", error);
      setError("Failed to cleanup orphaned data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const resSnap = await getDocs(collection(db, "responses"));
        const userPromises = resSnap.docs.map((res) => fetchUserData(res.id));
        const userList = (await Promise.all(userPromises)).filter(
          (user): user is User => user !== null
        );
        setUsers(userList);
      } catch (error) {
        console.error("Error fetching data:", error);
        setError("Failed to load scores. Please try again later.");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (selectedUser) {
      const fetchUserDetails = async () => {
        try {
          const [commSnap, listeningSnap] = await Promise.all([
            getDocs(
              query(
                collection(db, "communicationResponse"),
                where("userId", "==", selectedUser.uid)
              )
            ),
            getDocs(
              query(
                collection(db, "listeningScores"),
                where("userId", "==", selectedUser.uid)
              )
            ),
          ]);

          setCommResponses(
            commSnap.docs.map((d) => {
              const data = d.data() as CommunicationResponse;
              return {
                ...data,
                questionIndex: data.questionIndex ?? 0, // Fallback to 0 if undefined
              };
            })
          );
          setListeningScores(
            listeningSnap.docs.map((d) => ({
              id: d.id,
              userId: String(d.data().userId || selectedUser.uid),
              testId: String(d.data().testId || ""),
              testTitle: String(d.data().testTitle || ""),
              score: Number(d.data().score) || 0,
              total: Number(d.data().total) || 0,
              percentage: Number(d.data().percentage) || 0,
              completedAt: d.data().completedAt ?? null,
              answers: Array.isArray(d.data().answers) ? d.data().answers : [],
              userEmail: String(d.data().userEmail || selectedUser.email || ""),
            }))
          );
        } catch (error) {
          console.error("Error fetching user details:", error);
          setError("Failed to load user details.");
        }
      };
      fetchUserDetails();
    }
  }, [selectedUser]);

  const filteredAndSortedUsers = useMemo(() => {
    return users
      .filter((user) => {
        const matchesSearch =
          user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          user.email.toLowerCase().includes(searchTerm.toLowerCase());
        const isValidRound =
          filterByRound === "all" ||
          (filterByRound === "round1" && user.round1.percentage > 0) ||
          (filterByRound === "round2" && user.round2.percentage > 0) ||
          (filterByRound === "round3" && user.round3.percentage > 0) ||
          (filterByRound === "round4" && user.round4.percentage > 0);
        const showUser = showUnknownUsers || !user.isUnknown;
        return matchesSearch && isValidRound && showUser;
      })
      .sort((a, b) => {
        switch (sortBy) {
          case "name":
            return a.name.localeCompare(b.name);
          case "totalScore":
            return b.totalScore - a.totalScore;
          case "overallPercentage":
            return b.overallPercentage - a.overallPercentage;
          case "weightedPercentage":
            return b.weightedPercentage - a.weightedPercentage;
          default:
            return 0;
        }
      });
  }, [users, searchTerm, sortBy, filterByRound, showUnknownUsers]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading scores...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Retry loading scores"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 container mx-auto px-4">
      <motion.h1
        className="text-3xl font-bold text-gray-900 dark:text-white"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        Exam Scores Dashboard
      </motion.h1>
      <TopPerformers users={filteredAndSortedUsers} />
      <Filters
        searchTerm={searchTerm}
        setSearchTerm={debouncedSetSearchTerm}
        sortBy={sortBy}
        setSortBy={setSortBy}
        filterByRound={filterByRound}
        setFilterByRound={setFilterByRound}
        showUnknownUsers={showUnknownUsers}
        setShowUnknownUsers={setShowUnknownUsers}
      />
      <div className="rounded-2xl bg-gray-100 dark:bg-slate-800 shadow-lg overflow-hidden">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center">
            <BarChart3 className="w-6 h-6 mr-2 text-blue-600" />
            Detailed Results ({filteredAndSortedUsers.length} students)
          </h2>
          <button
            onClick={cleanupOrphanedResponses}
            className="flex items-center gap-2 px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors disabled:opacity-50"
            disabled={loading}
            aria-label="Delete scores for users without active profiles"
          >
            <Trash2 className="w-4 h-4" />
            Cleanup Results
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-slate-700">
              <tr>
                {[
                  "Student",
                  "Round 1 (MCQ)",
                  "Round 2 (Coding)",
                  "Round 3 (Communication)",
                  "Round 4 (Listening)",
                  "Total Score",
                  "Average Score",
                  "Performance",
                  "Actions",
                ].map((header) => (
                  <th
                    key={header}
                    scope="col"
                    className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredAndSortedUsers.map((user, index) => {
                const badge = getPerformanceBadge(user.weightedPercentage);
                return (
                  <motion.tr
                    key={user.uid}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="hover:bg-gray-50 dark:hover:bg-slate-700 transition-all"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-slate-600 text-gray-700 dark:text-white flex items-center justify-center font-semibold">
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-semibold text-gray-900 dark:text-white">
                            {user.name}
                            {user.isUnknown && (
                              <span className="ml-2 px-2 py-1 bg-gray-200 text-xs rounded">
                                Archived
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {user.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="space-y-1">
                        <div className="flex items-center justify-center space-x-4">
                          <span className="flex items-center text-green-600">
                            <CheckCircle className="w-4 h-4 mr-1" />
                            {user.round1.correct}
                          </span>
                          <span className="flex items-center text-red-600">
                            <XCircle className="w-4 h-4 mr-1" />
                            {user.round1.wrong}
                          </span>
                        </div>
                        <div className="text-lg font-bold text-blue-600">
                          {user.round1.percentage}%
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {user.round2.percentage > 0 ? (
                        <div className="space-y-1">
                          <div className="text-sm">
                            {user.round2.passed}/{user.round2.total} tests
                          </div>
                          <div className="text-lg font-bold text-green-600">
                            {user.round2.percentage}%
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-500 text-sm">
                          Not attempted
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {user.round3.percentage > 0 ? (
                        <div className="space-y-1">
                          <div className="text-lg font-bold text-purple-600">
                            {user.round3.percentage}%
                          </div>
                          <div className="text-xs text-gray-500">
                            {user.round3.responseCount} responses
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-500 text-sm">
                          Not attempted
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {user.round4.percentage > 0 ? (
                        <div className="space-y-1">
                          <div className="text-lg font-bold text-orange-600">
                            {user.round4.percentage}%
                          </div>
                          <div className="text-xs text-gray-500">
                            {user.round4.testCount} tests
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-500 text-sm">
                          Not attempted
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="text-xl font-bold text-gray-800 dark:text-blue-400">
                        {user.totalScore}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="text-xl font-bold text-green-600 dark:text-green-400">
                        {user.weightedPercentage}%
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span
                        className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${badge.color}`}
                      >
                        {badge.level} - {badge.label}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => setSelectedUser(user)}
                        className="inline-flex items-center px-3 py-2 rounded-xl bg-gray-50 dark:bg-slate-700 hover:bg-gray-100 dark:hover:bg-slate-600 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500"
                        aria-label={`View details for ${user.name}`}
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        Details
                      </button>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
          {filteredAndSortedUsers.length === 0 && (
            <div className="text-center py-12">
              <User className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400">
                No students found matching your criteria.
              </p>
            </div>
          )}
        </div>
      </div>

      {selectedUser && (
        <motion.div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onClick={() => setSelectedUser(null)}
          role="dialog"
          aria-labelledby="user-details-title"
        >
          <motion.div
            className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold">
                    {selectedUser.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3
                      id="user-details-title"
                      className="text-2xl font-bold text-gray-900 dark:text-white"
                    >
                      {selectedUser.name}
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400">
                      {selectedUser.email}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedUser(null)}
                  className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  aria-label="Close dialog"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {selectedUser.totalScore}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    Total Raw Score
                  </div>
                </div>
                <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                    {selectedUser.weightedPercentage}%
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    Weighted Score
                  </div>
                </div>
                <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                    {selectedUser.overallPercentage}%
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    Average Score
                  </div>
                </div>
                <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                    {getPerformanceBadge(selectedUser.weightedPercentage).level}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    Grade
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                  <Calculator className="w-5 h-5 mr-2" />
                  Round Performance Breakdown
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-lg font-bold text-blue-600">
                      {selectedUser.round1.percentage}%
                    </div>
                    <div className="text-sm text-gray-600">Round 1 (MCQ)</div>
                    <div className="text-xs text-gray-500">
                      {selectedUser.round1.correct}/
                      {selectedUser.round1.correct + selectedUser.round1.wrong}{" "}
                      correct
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-green-600">
                      {selectedUser.round2.percentage}%
                    </div>
                    <div className="text-sm text-gray-600">
                      Round 2 (Coding)
                    </div>
                    <div className="text-xs text-gray-500">
                      {selectedUser.round2.passed}/{selectedUser.round2.total}{" "}
                      tests passed
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-purple-600">
                      {selectedUser.round3.percentage}%
                    </div>
                    <div className="text-sm text-gray-600">
                      Round 3 (Communication)
                    </div>
                    <div className="text-xs text-gray-500">
                      {selectedUser.round3.responseCount} responses
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-orange-600">
                      {selectedUser.round4.percentage}%
                    </div>
                    <div className="text-sm text-gray-600">
                      Round 4 (Listening)
                    </div>
                    <div className="text-xs text-gray-500">
                      {selectedUser.round4.testCount} tests completed
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center">
                  <FileText className="w-5 h-5 mr-2 text-blue-600" />
                  Round 1 (MCQ) - Detailed Answers
                </h4>
                {selectedUser.round1.answers &&
                Object.keys(selectedUser.round1.answers).length > 0 ? (
                  <div className="space-y-3">
                    {Object.entries(selectedUser.round1.answers).map(
                      ([qid, ans]) => (
                        <div
                          key={qid}
                          className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4"
                        >
                          <p className="font-medium text-gray-900 dark:text-white mb-2">
                            {ans.question}
                          </p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="text-gray-600 dark:text-gray-400">
                                Your Answer:{" "}
                              </span>
                              <span
                                className={
                                  ans.isCorrect
                                    ? "text-green-600 font-semibold"
                                    : "text-red-600 font-semibold"
                                }
                              >
                                {ans.selected}
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-600 dark:text-gray-400">
                                Correct Answer:{" "}
                              </span>
                              <span className="font-semibold text-gray-900 dark:text-white">
                                {ans.correct}
                              </span>
                            </div>
                          </div>
                        </div>
                      )
                    )}
                  </div>
                ) : (
                  <p className="text-gray-500 dark:text-gray-400">
                    No detailed answers available.
                  </p>
                )}
              </div>

              <div className="space-y-4">
                <h4 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center">
                  <Code className="w-5 h-5 mr-2 text-green-600" />
                  Round 2 (Coding) - Solutions
                </h4>
                {selectedUser.round2.solutions.length > 0 ? (
                  <div className="space-y-4">
                    {selectedUser.round2.solutions.map((solution) => (
                      <div
                        key={solution.id}
                        className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <h5 className="font-medium text-gray-900 dark:text-white">
                            Problem: {solution.problemId}
                          </h5>
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-semibold ${
                              solution.passed === solution.total
                                ? "bg-green-100 text-green-800"
                                : solution.passed > 0
                                ? "bg-yellow-100 text-yellow-800"
                                : "bg-red-100 text-red-800"
                            }`}
                          >
                            {solution.passed}/{solution.total} passed
                          </span>
                        </div>
                        <div className="space-y-2 text-sm">
                          <div>
                            <span className="text-gray-600 dark:text-gray-400">
                              Test Cases:{" "}
                            </span>
                            <span className="font-semibold">
                              {solution.passed}/{solution.total}
                            </span>
                            <span className="ml-2 text-gray-600 dark:text-gray-400">
                              (
                              {solution.total
                                ? Math.round(
                                    (solution.passed / solution.total) * 100
                                  )
                                : 0}
                              %)
                            </span>
                          </div>
                          {solution.code && (
                            <details className="mt-3">
                              <summary className="cursor-pointer text-blue-600 hover:text-blue-700 font-medium">
                                View Code Solution
                              </summary>
                              <pre className="mt-2 bg-gray-900 text-gray-100 p-3 rounded-lg overflow-x-auto text-xs">
                                {solution.code}
                              </pre>
                            </details>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 dark:text-gray-400">
                    No coding solutions submitted.
                  </p>
                )}
              </div>

              <div className="space-y-4">
                <h4 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center">
                  <Mic className="w-5 h-5 mr-2 text-purple-600" />
                  Round 3 (Communication) - Responses
                </h4>
                <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm mb-4">
                    <div>
                      <span className="font-semibold">Total Score:</span>{" "}
                      {selectedUser.round3.score}/{selectedUser.round3.total}
                    </div>
                    <div>
                      <span className="font-semibold">Average Accuracy:</span>{" "}
                      {selectedUser.round3.avgAccuracy}%
                    </div>
                    <div className="md:col-span-2">
                      <span className="font-semibold">Overall Percentage:</span>{" "}
                      {selectedUser.round3.percentage}%
                    </div>
                    <div className="md:col-span-2">
                      <span className="font-semibold">Responses:</span>{" "}
                      {selectedUser.round3.responseCount}
                    </div>
                  </div>
                </div>
                {commResponses.length > 0 ? (
                  <div className="space-y-3">
                    {commResponses.map((resp, idx) => (
                      <div
                        key={idx}
                        className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4"
                      >
                        <div className="font-medium text-gray-900 dark:text-white mb-2">
                          Q{idx + 1}: {resp.question}
                        </div>
                        <div className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                          <span className="font-semibold">Spoken Text:</span>{" "}
                          {resp.responseText}
                        </div>
                        <div className="text-sm text-purple-700 dark:text-purple-300 font-bold">
                          Score: {resp.score || "N/A"}/100
                        </div>
                        {resp.accuracyScore && (
                          <div className="text-xs text-purple-600 dark:text-purple-400">
                            Accuracy: {resp.accuracyScore}%
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 dark:text-gray-400">
                    No communication responses found.
                  </p>
                )}
              </div>

              <div className="space-y-4">
                <h4 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center">
                  <Headphones className="w-5 h-5 mr-2 text-orange-600" />
                  Round 4 (Listening) - Test Results
                </h4>
                {listeningScores.length > 0 ? (
                  <div className="space-y-3">
                    {listeningScores.map((score, idx) => (
                      <div
                        key={idx}
                        className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4"
                      >
                        <div className="font-medium text-gray-900 dark:text-white mb-2">
                          Test: {score.testTitle || `Test ${idx + 1}`}
                        </div>
                        <div className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                          <span className="font-semibold">Score:</span>{" "}
                          {score.score}/{score.total}
                        </div>
                        <div className="text-sm text-orange-700 dark:text-orange-300 font-bold">
                          Percentage: {score.percentage}%
                        </div>
                        {score.completedAt && (
                          <div className="text-xs text-orange-600 dark:text-orange-400">
                            Completed:{" "}
                            {score.completedAt.toDate().toLocaleDateString()}
                          </div>
                        )}
                        {score.answers && score.answers.length > 0 && (
                          <details className="mt-3">
                            <summary className="cursor-pointer text-blue-600 hover:text-blue-700 font-medium text-sm">
                              View Question Details
                            </summary>
                            <div className="mt-2 space-y-2">
                              {score.answers.map(
                                (answer: any, ansIdx: number) => (
                                  <div
                                    key={ansIdx}
                                    className="border-l-4 border-orange-500 pl-3 py-1"
                                  >
                                    <div className="text-sm font-medium">
                                      {answer.question}
                                    </div>
                                    <div
                                      className={`text-xs ${
                                        answer.isCorrect
                                          ? "text-green-600"
                                          : "text-red-600"
                                      }`}
                                    >
                                      Your answer: {answer.selectedOption} |
                                      Correct: {answer.correctAnswer} |{" "}
                                      {answer.isCorrect
                                        ? "✓ Correct"
                                        : "✗ Wrong"}
                                    </div>
                                  </div>
                                )
                              )}
                            </div>
                          </details>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 dark:text-gray-400">
                    No listening test results found.
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
};

export default ViewScores;