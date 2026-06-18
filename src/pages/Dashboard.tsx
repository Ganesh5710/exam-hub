import { useEffect, useState } from "react";
import { db } from "../lib/firebase";
import { collection, getDocs, addDoc, query, orderBy, limit } from "../lib/firebase";
import { motion } from "framer-motion";
import {
  Users,
  BookOpen,
  Trophy,
  Clock,
  CheckCircle,
  Activity,
  Plus,
  Code,
  UserCheck,
} from "lucide-react";

const Dashboard = () => {
  const [type, setType] = useState<"mcq" | "code">("mcq");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [difficulty, setDifficulty] = useState("Easy");
  const [tags, setTags] = useState("");
  const [options, setOptions] = useState(["", "", "", ""]);
  const [answer, setAnswer] = useState("");
  const [codeTemplate, setCodeTemplate] = useState("");
  const [sampleInput, setSampleInput] = useState("");
  const [sampleOutput, setSampleOutput] = useState("");
  const [testCases, setTestCases] = useState([{ input: "", expectedOutput: "" }]);
  const [problemStatement, setProblemStatement] = useState("");
  const [constraints, setConstraints] = useState("");
  const [examples, setExamples] = useState([{ input: "", output: "", explanation: "" }]);
  const [users, setUsers] = useState<any[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [selectAll, setSelectAll] = useState(false);
  const [showAddQuestion, setShowAddQuestion] = useState(false);
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");

  // Dashboard metrics
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [totalUsers, setTotalUsers] = useState(0);
  const [activeExams, setActiveExams] = useState(0);
  const [completedExams, setCompletedExams] = useState(0);
  const [recentActivities, setRecentActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Previous metrics for trend calculation
  const [previousMetrics, setPreviousMetrics] = useState({
    questions: 0,
    users: 0,
    completed: 0,
    active: 0
  });

  useEffect(() => {
    const fetchDashboardData = async () => {
      setLoading(true);
      try {
        // Fetch users from both employees collection and Firebase Auth users
        const [employeesSnap, authUsersSnap] = await Promise.all([
          getDocs(collection(db, "employees")),
          getDocs(collection(db, "users"))
        ]);
        
        const employeesList = employeesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        const authUsersList = authUsersSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

        // Build a map by email to ensure we always have a real Auth UID
        const byEmail: Record<string, any> = {};

        // Seed from auth users collection (these ids are real Firebase Auth UIDs)
        (authUsersList as any[]).forEach((u: any) => {
          if (!u?.email) return;
          byEmail[u.email] = {
            id: u.id,
            email: u.email,
            name: u.fullName || u.email,
            title: u.role || 'Member',
            department: u.department || '',
            status: u.status || 'active',
            authUid: u.id,
          };
        });

        // Merge/augment with employees collection to enrich display fields
        (employeesList as any[]).forEach((emp: any) => {
          if (emp?.email && byEmail[emp.email]) {
            byEmail[emp.email] = {
              ...byEmail[emp.email],
              // Prefer richer profile data from employees
              name: emp.name || byEmail[emp.email].name,
              title: emp.title || byEmail[emp.email].title,
              department: emp.department || byEmail[emp.email].department,
              location: emp.location || byEmail[emp.email].location,
              phone: emp.phone || byEmail[emp.email].phone,
              photo: emp.photo || byEmail[emp.email].photo,
              status: emp.status || byEmail[emp.email].status,
            };
          } else if (emp?.email) {
            // If no auth record exists for this email, include only for display, but DO NOT use employee doc id as authUid
            // This avoids assigning questions to a non-auth UID
            byEmail[emp.email] = {
              id: emp.id,
              email: emp.email,
              name: emp.name || emp.email,
              title: emp.title || 'Employee',
              department: emp.department || '',
              location: emp.location,
              phone: emp.phone,
              photo: emp.photo,
              status: emp.status || 'inactive',
              authUid: undefined,
            };
          }
        });

        const combinedUsers = Object.values(byEmail);
        setUsers(combinedUsers as any[]);
        setTotalUsers(combinedUsers.length);

        // Fetch questions
        const questionsSnap = await getDocs(collection(db, "questions"));
        setTotalQuestions(questionsSnap.docs.length);

        // Fetch responses to calculate completed/active exams
        const responsesSnap = await getDocs(collection(db, "responses"));
        const completedCount = responsesSnap.docs.length;
        const activeCount = Math.max(0, combinedUsers.length - completedCount);
        setCompletedExams(completedCount);
        setActiveExams(activeCount);

        // Fetch recent activities
        try {
          const activitiesSnap = await getDocs(
            query(collection(db, "activity_logs"), orderBy("created_at", "desc"), limit(5))
          );
          const activities = activitiesSnap.docs.map((doc) => ({
            id: doc.id,
            ...doc.data()
          }));
          setRecentActivities(activities);
        } catch (error) {
          console.log("No activity logs found, using empty array");
          setRecentActivities([]);
        }

        // Calculate trends (simplified - you can enhance this logic)
        setPreviousMetrics({
          questions: Math.max(0, questionsSnap.docs.length - Math.floor(questionsSnap.docs.length * 0.1)),
          users: Math.max(0, combinedUsers.length - Math.floor(combinedUsers.length * 0.05)),
          completed: Math.max(0, completedCount - Math.floor(completedCount * 0.2)),
          active: activeCount
        });

      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  const calculateTrend = (current: number, previous: number) => {
    if (previous === 0) return { trend: "0%", trendUp: true };
    const percentage = ((current - previous) / previous) * 100;
    return {
      trend: `${percentage >= 0 ? '+' : ''}${percentage.toFixed(1)}%`,
      trendUp: percentage >= 0
    };
  };

  const handleUserSelect = (uid: string) => {
    setSelectedUsers((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  };

  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedUsers([]);
    } else {
      // Only include users that have a valid authUid (actual Firebase Auth user)
      setSelectedUsers(users.filter((u: any) => !!u.authUid).map((u: any) => u.authUid));
    }
    setSelectAll(!selectAll);
  };

  const handleAdd = async () => {
    if (!title.trim() || !description.trim()) {
      alert("⚠️ Title and description are required");
      return;
    }

    if (type === "mcq") {
      if (options.some((opt) => !opt.trim())) {
        alert("⚠️ All options are required");
        return;
      }
      if (!answer.trim()) {
        alert("⚠️ Correct answer is required");
        return;
      }
    }

    if (type === "code") {
      if (!codeTemplate.trim()) {
        alert("⚠️ Code template is required");
        return;
      }
      if (!sampleInput.trim() || !sampleOutput.trim()) {
        alert("⚠️ Sample input/output required");
        return;
      }
      if (!problemStatement.trim()) {
        alert("⚠️ Problem statement is required");
        return;
      }
      if (!constraints.trim()) {
        alert("⚠️ Constraints are required");
        return;
      }

      const invalidCase = testCases.some(
        (tc) => !tc.input.trim() || !tc.expectedOutput.trim()
      );
      if (invalidCase) {
        alert("⚠️ All test cases must be complete");
        return;
      }

      const invalidExample = examples.some(
        (ex) => !ex.input.trim() || !ex.output.trim()
      );
      if (invalidExample) {
        alert("⚠️ All examples must have input and output");
        return;
      }
    }

    if (selectedUsers.length === 0) {
      alert("⚠️ Select at least one user");
      return;
    }
    if (!startAt || !endAt) {
      alert("⚠️ Start time and End time are required");
      return;
    }
    if (new Date(endAt) <= new Date(startAt)) {
      alert("⚠️ End time must be after Start time");
      return;
    }

    const data: any = {
      type,
      title,
      description,
      difficulty,
      tags: tags.split(",").map((tag) => tag.trim()),
      assignedTo: selectedUsers,
      createdAt: new Date(),
    };

    if (type === "mcq") {
      data.options = options;
      data.answer = answer;
    } else {
      data.codeTemplate = codeTemplate;
      data.sampleInput = sampleInput;
      data.sampleOutput = sampleOutput;
      data.testCases = testCases.map((tc, i) => ({
        id: i + 1,
        input: tc.input,
        expectedOutput: tc.expectedOutput,
      }));
      data.problemStatement = problemStatement;
      data.constraints = constraints;
      data.examples = examples.map((ex, i) => ({
        id: i + 1,
        input: ex.input,
        output: ex.output,
        explanation: ex.explanation,
      }));
      data.timeLimit = 2;
      data.memoryLimit = 512;
    }

    try {
      // Add optional scheduling windows
      if (startAt) {
        data.startAt = new Date(startAt);
      }
      if (endAt) {
        data.endAt = new Date(endAt);
      }
      await addDoc(collection(db, "questions"), data);
      
      // Log activity
      try {
        await addDoc(collection(db, "activity_logs"), {
          action: `New ${type.toUpperCase()} question created`,
          description: `Question "${title}" was added to the system`,
          created_at: new Date(),
          type: "question_created"
        });
      } catch (error) {
        console.log("Could not log activity:", error);
      }

      alert("Question added and assigned!");
      resetForm();
      setShowAddQuestion(false);
      setTotalQuestions(prev => prev + 1);
    } catch (err) {
      console.error(err);
      alert("Error adding question");
    }
  };

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setDifficulty("Easy");
    setTags("");
    setOptions(["", "", "", ""]);
    setAnswer("");
    setCodeTemplate("");
    setSampleInput("");
    setSampleOutput("");
    setTestCases([{ input: "", expectedOutput: "" }]);
    setProblemStatement("");
    setConstraints("");
    setExamples([{ input: "", output: "", explanation: "" }]);
    setSelectedUsers([]);
    setSelectAll(false);
    setStartAt("");
    setEndAt("");
  };

  const statCards = [
    {
      title: "Total Questions",
      value: totalQuestions,
      icon: BookOpen,
      color: "blue",
      bgClass: "bg-blue-500",
      iconBg: "bg-blue-100",
      iconColor: "text-blue-600",
      ...calculateTrend(totalQuestions, previousMetrics.questions)
    },
    {
      title: "Total Users",
      value: totalUsers,
      icon: Users,
      color: "blue",
      bgClass: "bg-blue-500",
      iconBg: "bg-blue-100",
      iconColor: "text-blue-600",
      ...calculateTrend(totalUsers, previousMetrics.users)
    },
    {
      title: "Completed Exams",
      value: completedExams,
      icon: CheckCircle,
      color: "blue",
      bgClass: "bg-blue-500",
      iconBg: "bg-blue-100",
      iconColor: "text-blue-600",
      ...calculateTrend(completedExams, previousMetrics.completed)
    },
    {
      title: "Active Exams",
      value: activeExams,
      icon: Clock,
      color: "blue",
      bgClass: "bg-blue-500",
      iconBg: "bg-blue-100",
      iconColor: "text-blue-600",
      ...calculateTrend(activeExams, previousMetrics.active)
    },
  ];

  const quickActions = [
    {
      title: "Create MCQ Question",
      description: "Add multiple choice questions",
      icon: CheckCircle,
      action: () => {
        setType("mcq");
        setShowAddQuestion(true);
      },
      color: "blue",
    },
    {
      title: "Create Coding Question",
      description: "Add programming challenges",
      icon: Code,
      action: () => {
        setType("code");
        setShowAddQuestion(true);
      },
      color: "green",
    },
    {
      title: "  View All Scores",
      description: "Check student performance",
      icon: Trophy,
      action: () => window.location.href = "/ViewScores",
      color: "purple",
    },
    {
      title: "Manage Users",
      description: "Add or edit user accounts",
      icon: UserCheck,
      action: () => window.location.href = "/users",
      color: "orange",
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <motion.h1 
            className="text-3xl font-bold text-slate-900 dark:text-white"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            Dashboard
          </motion.h1>
          <p className="mt-1 text-slate-600 dark:text-slate-400">
            Welcome back!
          </p>
        </div>
        <div className="mt-4 sm:mt-0 flex gap-3">
  <button
    onClick={() => setShowAddQuestion(true)}
    className="inline-flex items-center px-6 py-3 font-semibold rounded-xl
               shadow-[6px_6px_12px_rgba(0,0,0,0.15),-6px_-6px_12px_rgba(255,255,255,0.9)]
               dark:shadow-[6px_6px_12px_rgba(0,0,0,0.6),-6px_-6px_12px_rgba(255,255,255,0.05)]
               bg-[#f8f5f2] text-[#d64b4b]
               dark:bg-[#e0e0e0] dark:text-[#4da6ff]
               hover:shadow-[inset_4px_4px_8px_rgba(0,0,0,0.2),inset_-4px_-4px_8px_rgba(255,255,255,0.8)]
               dark:hover:shadow-[inset_4px_4px_8px_rgba(0,0,0,0.7),inset_-4px_-4px_8px_rgba(255,255,255,0.1)]
               transition-all duration-300 transform hover:scale-105"
  >
    <Plus className="w-5 h-5 mr-2" />
    Add Question
  </button>
</div>

      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat, index) => (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="relative rounded-2xl transition-all duration-300 overflow-hidden group hover:-translate-y-0.5
                       bg-[#eff1f6] text-slate-700 shadow-[8px_8px_16px_rgba(0,0,0,0.12),-8px_-8px_16px_#ffffff]
                       dark:bg-slate-800 dark:text-slate-200 dark:shadow-[8px_8px_16px_rgba(0,0,0,0.6),-8px_-8px_16px_rgba(255,255,255,0.05)]"
          >
            <div className="relative z-10 p-6">
              <div className="flex items-start justify-between">
                <div className="p-3 rounded-xl bg-[#eff1f6] shadow-[inset_6px_6px_10px_rgba(0,0,0,0.12),inset_-6px_-6px_10px_#ffffff] dark:bg-slate-800 dark:shadow-[inset_6px_6px_10px_rgba(0,0,0,0.6),inset_-6px_-6px_10px_rgba(255,255,255,0.06)]">
                  <stat.icon className="w-6 h-6" />
                </div>
                
              </div>
              <div className="mt-6">
                <h3 className="text-sm font-medium opacity-80">{stat.title}</h3>
                <p className="text-3xl font-bold mt-1">{stat.value}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-6">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {quickActions.map((action, index) => (
            <motion.button
              key={action.title}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.1 }}
              onClick={action.action}
              className="relative p-6 rounded-2xl transition-all duration-300 group hover:-translate-y-0.5 text-left
                         bg-[#eff1f6] shadow-[8px_8px_16px_rgba(0,0,0,0.12),-8px_-8px_16px_#ffffff]
                         dark:bg-slate-800 dark:shadow-[8px_8px_16px_rgba(0,0,0,0.6),-8px_-8px_16px_rgba(255,255,255,0.05)]"
            >
              <div className="relative z-10 p-3 rounded-xl bg-[#eff1f6] shadow-[inset_6px_6px_10px_rgba(0,0,0,0.12),inset_-6px_-6px_10px_#ffffff] dark:bg-slate-800 dark:shadow-[inset_6px_6px_10px_rgba(0,0,0,0.6),inset_-6px_-6px_10px_rgba(255,255,255,0.06)] w-fit">
                <action.icon className="w-6 h-6" />
              </div>
              <h3 className="relative z-10 text-lg font-semibold text-slate-800 dark:text-white mt-4">
                {action.title}
              </h3>
              <p className="relative z-10 text-slate-600 dark:text-slate-300 mt-2 text-sm">
                {action.description}
              </p>
              
              
            </motion.button>
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      

      {/* Add Question Modal - keeping existing modal code for brevity */}
      {showAddQuestion && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
          >
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Add New Question</h2>
                  {/* AI MCQ Generation Button beside title */}
                  {type === "mcq" && (
                    <a
                      href="/AddingMCQs"
                      className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold shadow hover:bg-blue-700 transition-colors text-base"
                      style={{ textDecoration: 'none' }}
                    >
                      Generate MCQs Using AI
                    </a>
                  )}
                </div>
                <button
                  onClick={() => setShowAddQuestion(false)}
                  className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Question Type & Difficulty */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Question Type
                  </label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as "mcq" | "code")}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                  >
                    <option value="mcq">Multiple Choice (MCQ)</option>
                    <option value="code">Coding Challenge</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Difficulty Level
                  </label>
                  <select
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                  >
                    <option>Easy</option>
                    <option>Medium</option>
                    <option>Hard</option>
                  </select>
                </div>
              </div>

              {/* Title & Description */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Question Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                  placeholder="Enter a concise question title"
                />
              </div>

              {/* Scheduling (optional) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Start Time (optional)</label>
                  <input
                    type="datetime-local"
                    value={startAt}
                    onChange={(e) => setStartAt(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">End Time (optional)</label>
                  <input
                    type="datetime-local"
                    value={endAt}
                    onChange={(e) => setEndAt(e.target.value)}
                    min={startAt || undefined}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                  placeholder="Provide a detailed description of the question"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Tags (comma-separated)
                </label>
                <input
                  type="text"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                  placeholder="e.g. algorithms, arrays, loops"
                />
              </div>

              {/* MCQ Section */}
              {type === "mcq" && (
                <div className="space-y-4">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Answer Options
                  </label>
                  {options.map((opt, i) => (
                    <input
                      key={i}
                      value={opt}
                      onChange={(e) => {
                        const updated = [...options];
                        updated[i] = e.target.value;
                        setOptions(updated);
                      }}
                      className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                      placeholder={`Option ${i + 1}`}
                    />
                  ))}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      Correct Answer
                    </label>
                    <input
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                      placeholder="Must match one of the options exactly"
                    />
                  </div>
                </div>
              )}

              {/* Coding Section */}
              {type === "code" && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      Problem Statement
                    </label>
                    <textarea
                      value={problemStatement}
                      onChange={(e) => setProblemStatement(e.target.value)}
                      rows={4}
                      className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                      placeholder="Detailed problem statement shown to candidates"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      Constraints
                    </label>
                    <textarea
                      value={constraints}
                      onChange={(e) => setConstraints(e.target.value)}
                      rows={2}
                      className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                      placeholder="e.g. 1 <= n <= 1000"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      Code Template
                    </label>
                    <textarea
                      value={codeTemplate}
                      onChange={(e) => setCodeTemplate(e.target.value)}
                      rows={6}
                      className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white font-mono text-sm"
                      placeholder="// Starter code template"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        Sample Input
                      </label>
                      <input
                        value={sampleInput}
                        onChange={(e) => setSampleInput(e.target.value)}
                        className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                        placeholder="e.g. 5"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        Sample Output
                      </label>
                      <input
                        value={sampleOutput}
                        onChange={(e) => setSampleOutput(e.target.value)}
                        className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                        placeholder="e.g. Yes"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Examples
                    </label>
                    {examples.map((ex, i) => (
                      <div key={i} className="border border-gray-300 dark:border-gray-600 rounded p-3 bg-gray-50 dark:bg-gray-700/30">
                        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Example #{i + 1}</p>
                        <input
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded mb-2 dark:bg-gray-700 dark:text-white"
                          placeholder="Input"
                          value={ex.input}
                          onChange={(e) => {
                            const updated = [...examples];
                            updated[i].input = e.target.value;
                            setExamples(updated);
                          }}
                        />
                        <input
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded mb-2 dark:bg-gray-700 dark:text-white"
                          placeholder="Output"
                          value={ex.output}
                          onChange={(e) => {
                            const updated = [...examples];
                            updated[i].output = e.target.value;
                            setExamples(updated);
                          }}
                        />
                        <input
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
                          placeholder="Explanation (optional)"
                          value={ex.explanation}
                          onChange={(e) => {
                            const updated = [...examples];
                            updated[i].explanation = e.target.value;
                            setExamples(updated);
                          }}
                        />
                      </div>
                    ))}
                    <button
                      className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                      onClick={() => setExamples([...examples, { input: "", output: "", explanation: "" }])}
                    >
                      ➕ Add Another Example
                    </button>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Test Cases
                    </label>
                    {testCases.map((tc, i) => (
                      <div key={i} className="border border-gray-300 dark:border-gray-600 rounded p-3 bg-gray-50 dark:bg-gray-700/30">
                        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Test Case #{i + 1}</p>
                        <input
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded mb-2 dark:bg-gray-700 dark:text-white"
                          placeholder="Input"
                          value={tc.input}
                          onChange={(e) => {
                            const updated = [...testCases];
                            updated[i].input = e.target.value;
                            setTestCases(updated);
                          }}
                        />
                        <input
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
                          placeholder="Expected Output"
                          value={tc.expectedOutput}
                          onChange={(e) => {
                            const updated = [...testCases];
                            updated[i].expectedOutput = e.target.value;
                            setTestCases(updated);
                          }}
                        />
                      </div>
                    ))}
                    <button
                      className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                      onClick={() => setTestCases([...testCases, { input: "", expectedOutput: "" }])}
                    >
                      ➕ Add Another Test Case
                    </button>
                  </div>
                </div>
              )}

              {/* User Assignment */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Assign to Users
                </label>
                <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-4 max-h-48 overflow-y-auto">
                  <button
                    onClick={handleSelectAll}
                    className="mb-3 text-blue-600 hover:text-blue-700 font-medium text-sm"
                  >
                    {selectAll ? "Unselect All" : "Select All"}
                  </button>
                  <div className="space-y-2">
                    {users.map((user) => (
                      <label key={user.authUid} className="flex items-center space-x-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">
                        <input
                          type="checkbox"
                          disabled={!user.authUid}
                          checked={!!user.authUid && selectedUsers.includes(user.authUid)}
                          onChange={() => user.authUid && handleUserSelect(user.authUid)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">{user.name}</p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">{user.email}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end space-x-4 pt-6 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => setShowAddQuestion(false)}
                  className="px-6 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAdd}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-lg hover:shadow-xl"
                >
                  Add Question
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
};

export default Dashboard;
