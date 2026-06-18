import React, { useState, useEffect } from "react";
import { db } from "../lib/firebase";
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  getDocs,
  serverTimestamp,
} from "../lib/firebase";
import { motion } from "framer-motion";
import {
  Users,
  Plus,
  Send,
  Edit3,
  Trash2,
  Clock,
  FileText,
  Eye,
  Calendar,
  Target,
  Sparkles,
  ChevronDown,
} from "lucide-react";

const CommunicationRound: React.FC = () => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [questions, setQuestions] = useState<string[]>([""]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [existingTests, setExistingTests] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [viewTest, setViewTest] = useState<any | null>(null);
  const [editTestId, setEditTestId] = useState<string | null>(null);
  const [expandedTestId, setExpandedTestId] = useState<string | null>(null);

  // AI Generation State
  const [showAIGenerator, setShowAIGenerator] = useState(false);
  const [aiFormData, setAiFormData] = useState({
    paragraphLength: "Medium",
    paragraphCount: 3,
    paragraphTopic: "",
  });
  const [geminiResponse, setGeminiResponse] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [selectedParas, setSelectedParas] = useState<number[]>([]);

  // Fetch employees from Firestore
  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        const snap = await getDocs(collection(db, "employees"));
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setEmployees(data);
      } catch (error) {
        console.error("Error fetching employees:", error);
      }
    };
    fetchEmployees();
  }, []);

  const fetchTests = async () => {
    try {
      const snap = await getDocs(collection(db, "COMMUNICATIONTEST"));
      const tests = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setExistingTests(tests);
    } catch (error) {
      console.error("Error fetching tests:", error);
    }
  };

  useEffect(() => {
    fetchTests();
  }, []);

  const handleAddQuestion = () => {
    setQuestions([...questions, ""]);
  };

  const handleQuestionChange = (index: number, value: string) => {
    const updated = [...questions];
    updated[index] = value;
    setQuestions(updated);
  };

  const handleRemoveQuestion = (index: number) => {
    if (questions.length > 1) {
      const updated = questions.filter((_, i) => i !== index);
      setQuestions(updated);
    }
  };

  const handleSaveTest = async () => {
    if (!title || questions.length === 0 || questions.some((q) => !q.trim())) {
      alert("Please enter a title and at least one complete question");
      return;
    }

    if (selectedEmployees.length === 0) {
      alert("Please select at least one employee");
      return;
    }
    if (!startAt || !endAt) {
      alert("Please set Start Time and End Time");
      return;
    }

    setLoading(true);
    try {
      if (editTestId) {
        await updateDoc(doc(db, "COMMUNICATIONTEST", editTestId), {
          title,
          description,
          instructions,
          questions: questions.filter((q) => q.trim()),
          assigned: selectedEmployees,
          ...(startAt ? { startAt: new Date(startAt) } : {}),
          ...(endAt ? { endAt: new Date(endAt) } : {}),
          updatedAt: serverTimestamp(),
        });
        alert("Test updated successfully!");
      } else {
        await addDoc(collection(db, "COMMUNICATIONTEST"), {
          title,
          description,
          instructions,
          questions: questions.filter((q) => q.trim()),
          assigned: selectedEmployees,
          createdAt: serverTimestamp(),
          status: "active",
          ...(startAt ? { startAt: new Date(startAt) } : {}),
          ...(endAt ? { endAt: new Date(endAt) } : {}),
        });
        alert("Communication test created and assigned successfully!");
      }

      resetForm();
      setShowCreateForm(false);
      fetchTests();
    } catch (err) {
      console.error("Error saving test", err);
      alert("Error creating/updating test. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setInstructions("");
    setQuestions([""]);
    setSelectedEmployees([]);
    setEditTestId(null);
    setStartAt("");
    setEndAt("");
  };

  const handleSelectEmployee = (id: string) => {
    setSelectedEmployees((prev) =>
      prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedEmployees.length === employees.length) {
      setSelectedEmployees([]);
    } else {
      setSelectedEmployees(employees.map((emp) => emp.id));
    }
  };

  const handleView = (test: any) => setViewTest(test);

  const handleEdit = (test: any) => {
    setTitle(test.title || "");
    setDescription(test.description || "");
    setInstructions(test.instructions || "");
    // Ensure questions is an array, default to [""] if undefined or empty
    setQuestions(
      test.questions && test.questions.length > 0 ? [...test.questions] : [""]
    );
    setSelectedEmployees(test.assigned || []);
    setEditTestId(test.id);
    setStartAt(test.startAt?.toDate?.()?.toISOString().slice(0, 16) || "");
    setEndAt(test.endAt?.toDate?.()?.toISOString().slice(0, 16) || "");
    setShowCreateForm(true);
  };

  // AI Generation Functions
  const handleGenerateParagraphs = async () => {
    if (!aiFormData.paragraphTopic) {
      alert("Please enter a topic before generating!");
      return;
    }

    setAiLoading(true);
    setGeminiResponse("Generating paragraphs... please wait...");

    const wordLimits: Record<string, number> = {
      Short: 15,
      Medium: 30,
      Long: 60,
    };
    const limit = wordLimits[aiFormData.paragraphLength] || 30;

    const prompt = `
Generate ${aiFormData.paragraphCount} separate paragraphs about "${aiFormData.paragraphTopic}".
Each paragraph must be self-contained and meaningful.
Each paragraph must strictly be under ${limit} words.
Separate each paragraph with a blank line.
Use natural, fluent English.
`;

    try {
      const response = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "X-goog-api-key": "AIzaSyAU2ULHJBssu3ysvG0lU_ylB3PzptMbGvw",
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
          }),
        }
      );

      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      setGeminiResponse(text);
    } catch (error) {
      console.error(error);
      setGeminiResponse("Error generating paragraphs. Try again!");
    } finally {
      setAiLoading(false);
    }
  };

  const handleUseSelectedParagraphs = () => {
    if (selectedParas.length === 0) {
      alert("Please select at least one paragraph");
      return;
    }

    const paras = geminiResponse
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    const selectedParagraphs = selectedParas
      .map((idx) => paras[idx])
      .filter(Boolean);

    setQuestions((prevQuestions) => {
      const cleanedPrev = prevQuestions.filter((q) => q.trim().length > 0);
      return [...cleanedPrev, ...selectedParagraphs];
    });

    if (!title) {
      setTitle(aiFormData.paragraphTopic || "AI Generated Test");
    }
    if (!instructions) {
      setInstructions(
        "This communication test was generated using AI (Gemini). Read and analyze the content carefully."
      );
    }

    setShowAIGenerator(false);
    setGeminiResponse("");
    setSelectedParas([]);
    setAiFormData({
      paragraphLength: "Medium",
      paragraphCount: 3,
      paragraphTopic: "",
    });

    alert(`✅ ${selectedParagraphs.length} questions added successfully!`);
  };

  const renderParagraphs = (response: string) => {
    if (!response) return null;

    const paras = response.split(/\n\s*\n/).filter((p) => p.trim().length > 0);

    const handleSelect = (idx: number) => {
      setSelectedParas((prev) =>
        prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]
      );
    };

    return (
      <div className="space-y-6 mt-4">
        {paras.map((para, idx) => (
          <div
            key={idx}
            className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-300 dark:border-slate-600
 flex items-start gap-3 border border-slate-300 dark:border-slate-600
"
          >
            <input
              type="checkbox"
              checked={selectedParas.includes(idx)}
              onChange={() => handleSelect(idx)}
              className="mt-1 accent-blue-600 w-5 h-5"
            />
            <div className="flex-1 text-slate-800 dark:text-slate-100 leading-relaxed">
              <h3 className="font-semibold mb-2">Paragraph {idx + 1}</h3>
              <p className="text-sm">{para}</p>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderQuestions = (questions: string[]) => {
    return (
      <div className="space-y-4 mt-4">
        {questions.map((q, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="bg-white  p-4 rounded-xl border border-slate-200 dark:border-slate-500
 dark:border-gray-600 "
          >
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600 dark:text-purple-400 font-semibold text-sm mt-2">
                {i + 1}
              </div>
              <div className="flex-1">
                <p className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                  {q}
                </p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <motion.h1
            className="text-3xl font-bold text-app-text"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            Communication Assessment
          </motion.h1>
          <p className="mt-1 text-app-text opacity-70">
            Create and manage communication tests for evaluation
          </p>
        </div>

        <div className="mt-4 sm:mt-0 flex gap-2 items-center">
          <button
            onClick={() => {
              resetForm();
              setShowCreateForm(true);
            }}
            className="inline-flex items-center px-6 py-3 font-semibold rounded-xl
      shadow bg-[#f8f5f2] text-[#d64b4b] dark:bg-[#e0e0e0] dark:text-[#4da6ff]
      hover:shadow transition-all duration-300 transform hover:scale-105"
          >
            <Plus className="w-5 h-5 mr-2" />
            Create Test
          </button>
        </div>
      </div>
{/* Stats Cards */}
<div className="grid grid-cols-1 md:grid-cols-4 gap-6">
  {[
    {
      title: "Total Tests",
      value: existingTests.length,
      icon: FileText,
    },
    {
      title: "Active Tests",
      value: existingTests.filter((t) => t.status === "active").length,
      icon: Clock,
    },
    {
      title: "Total Employees",
      value: employees.length,
      icon: Users,
    },
    {
      title: "Assigned Tests",
      value: existingTests.reduce(
        (acc, test) => acc + (test.assigned?.length || 0),
        0
      ),
      icon: Target,
    },
  ].map((stat, index) => (
    <motion.div
    key={stat.title}
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: index * 0.1 }}
    className="relative rounded-2xl transition-all duration-300 overflow-hidden hover:-translate-y-0.5 bg-[#eff1f6] dark:bg-slate-800"
  >
    <div className="relative z-10 p-6">
      <div className="flex items-center justify-between">
        {/* Removed shadow from icon container */}
        <div className="p-3 rounded-xl bg-[#f3f5fa] dark:bg-slate-700">
          <stat.icon className="w-6 h-6" />
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-slate-800 dark:text-white">
            {stat.value}
          </p>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {stat.title}
          </p>
        </div>
      </div>
    </div>
  </motion.div>
  
  ))}
</div>


{/* Existing Tests */}
<div className="rounded-2xl bg-[#eff1f6] dark:bg-slate-800 transition-all duration-300">
<div className="p-6">
    <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100 flex items-center">
      Existing Communication Tests
    </h2>
  </div>

  <div className="p-6">
    {existingTests.length === 0 ? (
      <div className="text-center py-12">
        <h3 className="text-lg font-medium text-slate-800 dark:text-slate-100 mb-2">
          No tests created yet
        </h3>
        <p className="text-slate-600 dark:text-slate-400 mb-6">
          Create your first communication test to get started.
        </p>
        <button
          onClick={() => {
            resetForm();
            setShowCreateForm(true);
          }}
          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg 
            hover:bg-blue-700 hover:scale-[1.03] transition-all duration-300 shadow-sm"
        >
          <Plus className="w-4 h-4 mr-2" />
          Create Test
        </button>
      </div>
    ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {existingTests.map((test, index) => (
          <motion.div
            key={test.id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.1 }}
            className="relative rounded-2xl p-6 bg-white/90 dark:bg-slate-800/80 
              border border-slate-200 dark:border-slate-500
 shadow-sm hover:shadow-md 
              hover:-translate-y-1 transition-all duration-300"
          >
            <div className="relative z-10">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-2">
                    {test.title}
                  </h3>
                  <p className="text-slate-600 dark:text-slate-400 text-sm mb-3">
                    {test.description || "No description provided"}
                  </p>
                </div>
                <span
                  className={`px-2 py-1 rounded-full text-xs font-medium ${
                    test.status === "active"
                      ? "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                  }`}
                >
                  {test.status || "active"}
                </span>
              </div>

              <div className="space-y-3">
                <div className="flex items-center text-sm text-slate-700 dark:text-slate-300">
                  <FileText className="w-4 h-4 mr-2 text-blue-500" />
                  {test.questions?.length || 0} questions
                </div>

                <div className="flex items-center text-sm text-slate-700 dark:text-slate-300">
                  <Users className="w-4 h-4 mr-2 text-indigo-500" />
                  {test.assigned?.length || 0} employees assigned
                </div>

                <div className="flex items-center text-sm text-slate-700 dark:text-slate-300">
                  <Calendar className="w-4 h-4 mr-2 text-purple-500" />
                  {test.createdAt?.toDate?.()?.toLocaleDateString() ||
                    "Date not available"}
                </div>
              </div>

              {/* Toggle Questions Button */}
            


              {expandedTestId === test.id && test.questions && (
                <div className="mt-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-slate-800 dark:text-slate-200">
  {renderQuestions(test.questions)}
</div>
              )}

              {/* Action Buttons */}
              <div className="mt-6 flex space-x-2">
                <button
                  onClick={() => handleView(test)}
                  className="flex-1 inline-flex items-center justify-center px-3 py-2 border 
                    border-slate-200 dark:border-slate-500
 text-sm font-medium rounded-lg 
                    bg-gray-50 dark:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-700 
                    transition-all duration-300 hover:shadow-md"
                >
                  <Eye className="w-4 h-4 mr-1" />
                  View
                </button>

                <button
                  onClick={() => handleEdit(test)}
                  className="flex-1 inline-flex items-center justify-center px-3 py-2 border 
                    border-slate-200 dark:border-slate-500
 text-sm font-medium rounded-lg 
                    bg-gray-50 dark:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-700 
                    transition-all duration-300 hover:shadow-md"
                >
                  <Edit3 className="w-4 h-4 mr-1" />
                  Edit
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    )}
  </div>
</div>


  {/* View Test Modal */}
{viewTest && (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50"
  >
    <motion.div
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.25 }}
      className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md rounded-2xl 
        border border-slate-200 dark:border-slate-500
 
        shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
    >
      {/* Header */}
      <div className="p-6 border-b border-slate-200 dark:border-slate-500
 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          📘 View Communication Test
        </h2>
        <button
          onClick={() => setViewTest(null)}
          className="p-2 rounded-lg text-slate-500 dark:text-slate-400 
            hover:text-slate-700 dark:hover:text-slate-200 
            hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Body */}
      <div className="p-6 space-y-6">
        {/* Title & Description */}
        <div>
          <h3 className="text-xl font-semibold text-slate-800 dark:text-slate-100">
            {viewTest.title}
          </h3>
          <p className="mt-1 text-slate-600 dark:text-slate-400">
            {viewTest.description || "No description provided"}
          </p>
        </div>

        {/* Instructions */}
        <div>
          <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wide">
            Instructions
          </h4>
          <p className="text-slate-800 dark:text-slate-200 whitespace-pre-wrap bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200 dark:border-slate-500
">
            {viewTest.instructions || "—"}
          </p>
        </div>

        {/* Questions */}
        <div>
          <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 uppercase tracking-wide">
            Questions
          </h4>
          <div className="space-y-4">
            {(viewTest.questions || []).map((q: string, i: number) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="bg-white dark:bg-slate-800/70 p-4 rounded-xl 
                  border border-slate-200 dark:border-slate-500
 
                  shadow-sm hover:shadow-md transition-all duration-300"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/40 
                    flex items-center justify-center text-purple-600 dark:text-purple-400 font-semibold text-sm mt-1">
                    {i + 1}
                  </div>
                  <div className="flex-1">
                    <p className="text-slate-800 dark:text-slate-200 whitespace-pre-wrap">
                      {q}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Assigned Employees */}
        <div>
          <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 uppercase tracking-wide">
            Assigned Employees
          </h4>
          <div className="flex flex-wrap gap-2">
            {(viewTest.assigned || []).length === 0 ? (
              <span className="text-slate-600 dark:text-slate-400">None</span>
            ) : (
              (viewTest.assigned || []).map((id: string) => {
                const emp = employees.find((e) => e.id === id);
                const label = emp?.name || id;
                return (
                  <span
                    key={id}
                    className="px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 
                      border border-slate-200 dark:border-slate-500
 
                      text-sm text-slate-800 dark:text-slate-200 shadow-sm"
                  >
                    {label}
                  </span>
                );
              })
            )}
          </div>
        </div>
      </div>
    </motion.div>
  </motion.div>
)}


      {/* Create / Edit Test Modal */}
      {showCreateForm && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-app-surface rounded-2xl border border-slate-300 dark:border-slate-600
 max-w-4xl w-full max-h-[90vh] overflow-y-auto"
          >
<div className="p-6 border-b border-slate-200 dark:border-slate-500
 dark:border-slate-500
 bg-white dark:bg-slate-900 rounded-t-2xl">
<div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-app-text flex items-center">
                  {editTestId
                    ? "Edit Communication Test"
                    : "Create Communication Test"}
                </h2>
                <button
                  onClick={() => setShowCreateForm(false)}
                  className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6 bg-white dark:bg-slate-800 rounded-2xl shadow-lg max-w-4xl mx-auto my-10 border border-slate-200 dark:border-slate-500
 dark:border-slate-500
">

              {/* Basic Information */}
              <div className="grid grid-cols-1 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-app-text opacity-80 mb-2">
                    Test Title *
                  </label>
                  <input
                    type="text"
                    placeholder="Enter test title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600
 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-app-text opacity-80 mb-2">
                    Description
                  </label>
                  <textarea
                    placeholder="Brief description of the test"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600
 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-app-text opacity-80 mb-2">
                    Instructions for Candidates
                  </label>
                  <textarea
                    placeholder="Detailed instructions for taking the test"
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    rows={4}
                    className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600
 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                  />
                </div>
              </div>

              {/* Scheduling */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-app-text opacity-80 mb-2">
                    Start Time *
                  </label>
                  <input
                    type="datetime-local"
                    value={startAt}
                    onChange={(e) => setStartAt(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600
 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-app-text opacity-80 mb-2">
                    End Time *
                  </label>
                  <input
                    type="datetime-local"
                    value={endAt}
                    onChange={(e) => setEndAt(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600
 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                  />
                </div>
              </div>

              {/* Questions */}
              <div>
  {/* Header bar for question controls */}
  <div className="flex flex-wrap items-center justify-center gap-3 mb-6 
    bg-white/80 dark:bg-slate-900/70 backdrop-blur-md 
    p-4 rounded-2xl border border-slate-200 dark:border-slate-500
 
    shadow-md hover:shadow-lg transition-all duration-300">
    
    <label className="block text-base font-semibold text-slate-700 dark:text-slate-200 opacity-90 mr-auto tracking-wide">
      Questions *
    </label>

    <button
      onClick={handleAddQuestion}
      className="inline-flex items-center px-4 py-2 text-sm font-semibold 
      rounded-lg bg-blue-600 text-white shadow-sm 
      hover:bg-blue-700 hover:scale-[1.03] transition-all duration-300"
    >
      <Plus className="w-4 h-4 mr-2" />
      Add Question
    </button>

    <button
      onClick={() => setShowAIGenerator(true)}
      className="inline-flex items-center px-4 py-2 text-sm font-semibold 
      rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 
      text-white shadow-sm hover:from-purple-700 hover:to-indigo-700 
      transition-all duration-300 hover:scale-[1.03]"
    >
      <Sparkles className="w-4 h-4 mr-2" />
      Generate with AI
    </button>
  </div>

  {/* Question list container */}
  <div className="space-y-4 bg-white/80 dark:bg-slate-900/70 backdrop-blur-xl 
    p-6 rounded-2xl border border-slate-200 dark:border-slate-500
 
    shadow-xl transition-all duration-300 max-w-4xl mx-auto">

    {questions.map((question, index) => (
      <motion.div
        key={index}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.05 }}
        className="bg-white dark:bg-slate-800/80 
        p-5 rounded-xl border border-slate-200 dark:border-slate-500
 
        shadow-sm hover:shadow-md transition-all duration-300"
      >
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-8 h-8 rounded-full 
            bg-purple-100 dark:bg-purple-900/30 
            flex items-center justify-center 
            text-purple-600 dark:text-purple-400 font-semibold text-sm mt-2">
            {index + 1}
          </div>

          <div className="flex-1">
            <textarea
              placeholder={`Enter question ${index + 1}...`}
              value={question}
              onChange={(e) => handleQuestionChange(index, e.target.value)}
              rows={3}
              className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 
              rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 
              dark:bg-slate-800 dark:text-slate-100 resize-none shadow-inner"
            />
          </div>

          {questions.length > 1 && (
            <button
              onClick={() => handleRemoveQuestion(index)}
              className="flex-shrink-0 p-2 text-red-600 dark:text-red-400 
              hover:text-red-700 dark:hover:text-red-300 
              hover:bg-red-50 dark:hover:bg-red-900/30 
              rounded-lg transition-all mt-2"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          )}
        </div>
      </motion.div>
    ))}
  </div>
</div>


              {/* Employee Assignment */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <label className="block text-sm font-semibold text-app-text opacity-80">
                    Assign to Employees *
                  </label>
                  <button
                    onClick={handleSelectAll}
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                  >
                    {selectedEmployees.length === employees.length
                      ? "Unselect All"
                      : "Select All"}
                  </button>
                </div>

                <div className="border border-slate-300 dark:border-slate-600
 rounded-lg p-4 max-h-64 overflow-y-auto">
                  <div className="space-y-3">
                    {employees.map((emp) => (
                      <label
                        key={emp.id}
                        className="flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedEmployees.includes(emp.id)}
                          onChange={() => handleSelectEmployee(emp.id)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-semibold">
                            {emp.name?.charAt(0)?.toUpperCase() || "U"}
                          </div>
                          <div>
                            <p className="font-medium text-app-text">
                              {emp.name}
                            </p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              {emp.email}
                            </p>
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <p className="mt-2 text-sm text-app-text opacity-70">
                  {selectedEmployees.length} of {employees.length} employees
                  selected
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end space-x-4 pt-6 border-t border-slate-300 dark:border-slate-600
">
                <button
                  onClick={() => setShowCreateForm(false)}
                  className="px-6 py-3 border border-slate-300 dark:border-slate-600
 text-app-text opacity-80 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveTest}
                  disabled={loading}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors border border-slate-300 dark:border-slate-600
 hover:border border-slate-300 dark:border-slate-600
 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                >
                  {loading ? (
                    <>
                      <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                      {editTestId ? "Updating..." : "Creating..."}
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      {editTestId ? "Update Test" : "Create & Assign Test"}
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* AI Generator Modal */}
      {showAIGenerator && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
        >
         <motion.div
  initial={{ scale: 0.9, opacity: 0 }}
  animate={{ scale: 1, opacity: 1 }}
  className="bg-white/90 dark:bg-slate-900/85 
  rounded-2xl border border-slate-300 dark:border-slate-600
  text-slate-800 dark:text-slate-100
  max-w-5xl w-full max-h-[90vh] overflow-y-auto shadow-xl transition-all duration-300"
>
  {/* Header */}
  <div className="p-6 border-b border-slate-300 dark:border-slate-700">
    <div className="flex items-center justify-between">
      <h2 className="text-2xl font-bold flex items-center text-slate-800 dark:text-slate-100">
        <Sparkles className="w-6 h-6 mr-2 text-purple-600 dark:text-purple-400" />
        AI Content Generator
      </h2>
      <button
        onClick={() => {
          setShowAIGenerator(false);
          setGeminiResponse("");
          setSelectedParas([]);
        }}
        className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 
        rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
      >
        ✕
      </button>
    </div>
  </div>

  {/* Body */}
  <div className="p-6 space-y-6">
    {/* Form */}
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Paragraph Topic */}
      <div>
        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
          Paragraph Topic *
        </label>
        <input
          type="text"
          className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 
          rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 
          dark:bg-slate-800 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-400"
          placeholder="e.g. Importance of Communication"
          value={aiFormData.paragraphTopic}
          onChange={(e) =>
            setAiFormData({
              ...aiFormData,
              paragraphTopic: e.target.value,
            })
          }
        />
      </div>

      {/* Paragraph Length */}
      <div>
        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
          Paragraph Length
        </label>
        <select
          className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 
          rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 
          dark:bg-slate-800 dark:text-slate-100"
          value={aiFormData.paragraphLength}
          onChange={(e) =>
            setAiFormData({
              ...aiFormData,
              paragraphLength: e.target.value,
            })
          }
        >
          <option>Short</option>
          <option>Medium</option>
          <option>Long</option>
        </select>
      </div>

      {/* Paragraph Count */}
      <div>
        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
          Number of Paragraphs
        </label>
        <input
          type="number"
          min="1"
          max="10"
          className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 
          rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 
          dark:bg-slate-800 dark:text-slate-100"
          value={aiFormData.paragraphCount}
          onChange={(e) =>
            setAiFormData({
              ...aiFormData,
              paragraphCount: Number(e.target.value),
            })
          }
        />
      </div>
    </div>

    {/* Buttons */}
    <div className="flex gap-4">
      <button
        onClick={handleGenerateParagraphs}
        disabled={aiLoading}
        className={`px-8 py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-purple-600 to-indigo-600 
        hover:from-purple-700 hover:to-indigo-700 transition-all duration-300 border border-transparent 
        flex items-center ${
          aiLoading ? "opacity-60 cursor-not-allowed" : "hover:scale-[1.02]"
        }`}
      >
        {aiLoading ? (
          <>
            <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
            Generating...
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4 mr-2" />
            Generate Paragraphs
          </>
        )}
      </button>

      <button
        onClick={() => {
          setGeminiResponse("");
          setSelectedParas([]);
        }}
        className="px-8 py-3 rounded-xl font-semibold text-purple-600 bg-white dark:bg-slate-800 
        border-2 border-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 
        transition-all duration-300"
      >
        Reset
      </button>
    </div>

    {/* Generated Content */}
    {geminiResponse ? (
      <div className="space-y-6">
        <div className="border-t border-slate-300 dark:border-slate-700 pt-6">
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">
            Generated Content
            <span className="text-sm font-normal text-slate-500 dark:text-slate-400 ml-2">
              (Select paragraphs to use)
            </span>
          </h3>
          {renderParagraphs(geminiResponse)}
        </div>

        {selectedParas.length > 0 && (
          <div className="flex justify-end gap-4 pt-6 border-t border-slate-300 dark:border-slate-700">
            <button
              onClick={() => setSelectedParas([])}
              className="px-6 py-3 border border-slate-300 dark:border-slate-600 
              text-slate-700 dark:text-slate-200 rounded-lg 
              hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
            >
              Clear Selection
            </button>
            <button
              onClick={handleUseSelectedParagraphs}
              className="px-6 py-3 bg-purple-600 text-white rounded-lg 
              hover:bg-purple-700 transition-colors flex items-center"
            >
              <Send className="w-4 h-4 mr-2" />
              Use Selected Content ({selectedParas.length})
            </button>
          </div>
        )}
      </div>
    ) : (
      <div className="text-center py-8 text-slate-500 dark:text-slate-400">
        <Sparkles className="w-12 h-12 mx-auto mb-3 opacity-60" />
        <p>Enter a topic and click Generate to create AI-powered content.</p>
      </div>
    )}
  </div>
</motion.div>

        </motion.div>
      )}
    </div>
  );
};

export default CommunicationRound;
