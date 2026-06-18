import React, { useState, useEffect } from "react";
import { db } from "../lib/firebase";
import { collection, getDocs, addDoc } from "../lib/firebase";
import { motion } from "framer-motion";

const AddingMCQs: React.FC = () => {
  const [formData, setFormData] = useState({
    questionType: "Multiple Choice (MCQ)",
    difficulty: "Easy",
    questionTitle: "",
    startTime: "",
    endTime: "",
    description: "",
    questionCount: "5",
  });

  const [geminiResponse, setGeminiResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedQuestions, setSelectedQuestions] = useState<number[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [selectAll, setSelectAll] = useState(false);
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    const fetchUsers = async () => {
      const snap = await getDocs(collection(db, "users"));
      setUsers(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    };
    fetchUsers();
  }, []);

  const handleUserSelect = (uid: string) => {
    setSelectedUsers((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  };

  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedUsers([]);
    } else {
      setSelectedUsers(users.map((u: any) => u.id));
    }
    setSelectAll(!selectAll);
  };

  const handleAssignQuestions = async () => {
    if (selectedQuestions.length === 0) {
      alert("Select at least one question");
      return;
    }
    if (selectedUsers.length === 0) {
      alert("Select at least one user");
      return;
    }
    setAssigning(true);
    try {
      let mcqs = geminiResponse
        .split(/\d+\.\s+/)
        .filter((q) => q.trim() !== "");
      if (mcqs.length && !/^([A-D]\)|Answer:|\d)/.test(mcqs[0])) {
        mcqs = mcqs.slice(1);
      }
      const parsed = mcqs.map((q) => {
        const lines = q.split("\n").filter((l) => l.trim() !== "");
        const question = lines[0];
        const options = lines
          .slice(1)
          .filter((l) => /^[A-D]\)/i.test(l.trim()))
          .map((opt) => opt.trim());
        const answerLine = lines.find((l) => /answer|correct/i.test(l.trim()));
        const answer = answerLine ? answerLine.replace(/.*:/, "").trim() : "";
        return { question, options, answer };
      });

      for (const qIdx of selectedQuestions) {
        const mcq = parsed[qIdx];
        const data = {
          type: "mcq",
          title: formData.questionTitle,
          description: mcq.question,
          difficulty: formData.difficulty,
          options: mcq.options,
          answer: mcq.answer,
          assignedTo: selectedUsers,
          createdAt: new Date(),
        };
        await addDoc(collection(db, "questions"), data);
      }
      alert("Selected questions added and assigned to selected users!");
      setSelectedQuestions([]);
      setSelectedUsers([]);
      setSelectAll(false);
    } catch (err) {
      alert("Error assigning questions");
    } finally {
      setAssigning(false);
    }
  };

  const parseMCQs = (response: string) => {
    if (!response) return null;

    let mcqs = response.split(/\d+\.\s+/).filter((q) => q.trim() !== "");
    if (mcqs.length && !/^([A-D]\)|Answer:|\d)/.test(mcqs[0])) {
      mcqs = mcqs.slice(1);
    }

    const parsed = mcqs.map((q) => {
      const lines = q.split("\n").filter((l) => l.trim() !== "");
      const question = lines[0];
      const options = lines
        .slice(1)
        .filter((l) => /^[A-D]\)/i.test(l.trim()))
        .map((opt) => opt.trim());
      const answerLine = lines.find((l) => /answer|correct/i.test(l.trim()));
      const answer = answerLine ? answerLine.replace(/.*:/, "").trim() : "";
      return { question, options, answer };
    });

    const handleSelect = (idx: number) => {
      setSelectedQuestions((prev) =>
        prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]
      );
    };

    return (
      <ol className="space-y-6 mt-4">
        {parsed.map((mcq, idx) => (
          <li
            key={idx}
            className="bg-white dark:bg-slate-900 p-4 rounded-xl shadow border border-slate-200 dark:border-slate-700 flex items-start gap-4"
          >
            <input
              type="checkbox"
              checked={selectedQuestions.includes(idx)}
              onChange={() => handleSelect(idx)}
              className="mt-1 accent-blue-600 w-5 h-5"
            />
            <div className="flex-1">
              <div className="text-lg font-semibold text-slate-800 dark:text-white mb-3">
                {idx + 1}. {mcq.question}
              </div>
              <ul className="mb-3 space-y-2">
                {mcq.options.map((opt, i) => (
                  <li
                    key={i}
                    className="text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 px-3 py-2 rounded-lg"
                  >
                    {opt}
                  </li>
                ))}
              </ul>
              {mcq.answer && (
                <div className="font-semibold text-green-600 dark:text-green-400 mt-3 bg-green-50 dark:bg-green-900/20 px-3 py-2 rounded-lg">
                  ✅ Correct Answer: {mcq.answer}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
    );
  };

  // ✅ FIXED GEMINI API CALL
  async function handleGenerateMCQs() {
    if (!formData.description) {
      alert("Please provide a detailed description of the question!");
      return;
    }

    const questionCount = parseInt(formData.questionCount);
    if (isNaN(questionCount) || questionCount < 1 || questionCount > 20) {
      alert("Please enter a valid number of questions between 1 and 20");
      return;
    }

    setLoading(true);
    setGeminiResponse("Generating MCQs... please wait...");

    const prompt = `
Generate ${questionCount} multiple choice questions (MCQs) on the topic:
"${formData.description}"

Each question should be of ${formData.difficulty} difficulty level and follow this format:
1. Question text
A) Option 1
B) Option 2
C) Option 3
D) Option 4
Answer: B) Option 2
`;

    // 🔑 Directly use your Gemini API key here
    const apiKey = "AIzaSyAU2ULHJBssu3ysvG0lU_ylB3PzptMbGvw"; // <-- paste your real key here
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const options: RequestInit = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      }),
    };

    try {
      const response = await fetch(url, options);
      const data = await response.json();

      if (!response.ok) {
        console.error("Gemini API error:", data);
        throw new Error(data.error?.message || "Failed to generate content");
      }

      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      setGeminiResponse(text);
    } catch (error: any) {
      console.error("Gemini API Error:", error);
      setGeminiResponse(
        "❌ Error generating MCQs. Please check your API key or model name."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-slate-900 dark:to-slate-800 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header Section */}
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-slate-800 dark:text-white mb-4">
            Dashboard
          </h1>
          <div className="w-24 h-1 bg-blue-500 mx-auto rounded-full"></div>
        </div>

        {/* Main Content Card */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 mb-8 border border-slate-200 dark:border-slate-700">
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">
            Add New Question
          </h2>
          <p className="text-slate-600 dark:text-slate-300 mb-8">
            Create and manage multiple choice questions
          </p>

          {/* Form Section */}
          <div className="space-y-8">
            {/* Question Type & Difficulty Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-slate-800 dark:text-white font-semibold mb-3 text-lg">
                  Question Type
                </label>
                <select
                  className="w-full p-4 rounded-xl bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 border border-slate-200 dark:border-slate-600 transition-all duration-200"
                  value={formData.questionType}
                  onChange={(e) =>
                    setFormData({ ...formData, questionType: e.target.value })
                  }
                >
                  <option>Multiple Choice (MCQ)</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-800 dark:text-white font-semibold mb-3 text-lg">
                  Difficulty Level
                </label>
                <select
                  className="w-full p-4 rounded-xl bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 border border-slate-200 dark:border-slate-600 transition-all duration-200"
                  value={formData.difficulty}
                  onChange={(e) =>
                    setFormData({ ...formData, difficulty: e.target.value })
                  }
                >
                  <option value="Easy">Easy</option>
                  <option value="Medium">Medium</option>
                  <option value="Hard">Hard</option>
                </select>
              </div>
            </div>

            {/* Time Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-slate-800 dark:text-white font-semibold mb-3 text-lg">
                  Start Time (optional)
                </label>
                <input
                  type="datetime-local"
                  className="w-full p-4 rounded-xl bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 border border-slate-200 dark:border-slate-600 transition-all duration-200"
                  value={formData.startTime}
                  onChange={(e) =>
                    setFormData({ ...formData, startTime: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="block text-slate-800 dark:text-white font-semibold mb-3 text-lg">
                  End Time (optional)
                </label>
                <input
                  type="datetime-local"
                  className="w-full p-4 rounded-xl bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 border border-slate-200 dark:border-slate-600 transition-all duration-200"
                  value={formData.endTime}
                  onChange={(e) =>
                    setFormData({ ...formData, endTime: e.target.value })
                  }
                />
              </div>
            </div>

            {/* Question Title & Count Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-slate-800 dark:text-white font-semibold mb-3 text-lg">
                  Question Title
                </label>
                <input
                  type="text"
                  className="w-full p-4 rounded-xl bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 border border-slate-200 dark:border-slate-600 transition-all duration-200"
                  placeholder="Enter a concise question title"
                  value={formData.questionTitle}
                  onChange={(e) =>
                    setFormData({ ...formData, questionTitle: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="block text-slate-800 dark:text-white font-semibold mb-3 text-lg">
                  Number of Questions
                </label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  className="w-full p-4 rounded-xl bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 border border-slate-200 dark:border-slate-600 transition-all duration-200"
                  placeholder="Enter number of questions"
                  value={formData.questionCount}
                  onChange={(e) =>
                    setFormData({ ...formData, questionCount: e.target.value })
                  }
                />
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                  Enter between 1-20 questions
                </p>
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-slate-800 dark:text-white font-semibold mb-3 text-lg">
                Description
              </label>
              <textarea
                className="w-full p-4 rounded-xl bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 border border-slate-200 dark:border-slate-600 transition-all duration-200 resize-none"
                placeholder="e.g. algorithms, arrays, loops"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                rows={4}
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-4 mt-10">
            <motion.button
              key="generate"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0 }}
              onClick={handleGenerateMCQs}
              className={`px-8 py-4 rounded-xl font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-lg transition-all duration-200 flex items-center gap-2 ${
                loading ? "opacity-60 cursor-not-allowed" : ""
              }`}
              disabled={loading}
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Generating...
                </>
              ) : (
                `Generate ${formData.questionCount} MCQs`
              )}
            </motion.button>
            <motion.button
              key="reset"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 }}
              onClick={() => setGeminiResponse("")}
              className="px-8 py-4 rounded-xl font-semibold text-blue-600 bg-white border-2 border-blue-600 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-400 shadow transition-all duration-200"
            >
              Reset
            </motion.button>
          </div>
        </div>

        {/* Generated MCQs Section */}
        <div className="mt-8">
          {geminiResponse && (
            <>
              <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 border border-slate-200 dark:border-slate-700">
                <h3 className="text-2xl font-bold text-slate-800 dark:text-white mb-6">
                  Generated Questions
                </h3>
                {parseMCQs(geminiResponse)}

                {/* Assign to Users Section */}
                <div className="mt-10 pt-8 border-t border-slate-200 dark:border-slate-700">
                  <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-4">
                    Assign to Users
                  </h3>
                  <div className="border rounded-xl p-6 bg-slate-50 dark:bg-slate-700/50 max-w-2xl">
                    <div className="flex items-center justify-between mb-4">
                      <span className="font-semibold text-slate-800 dark:text-white">
                        Select Users
                      </span>
                      <button
                        type="button"
                        className="text-blue-600 hover:underline font-medium text-sm"
                        onClick={handleSelectAll}
                      >
                        {selectAll ? "Unselect All" : "Select All"}
                      </button>
                    </div>
                    <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                      {users.map((user) => (
                        <label
                          key={user.id}
                          className="flex items-center space-x-4 p-3 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 hover:bg-blue-50 dark:hover:bg-slate-700 transition-colors duration-200"
                        >
                          <input
                            type="checkbox"
                            checked={selectedUsers.includes(user.id)}
                            onChange={() => handleUserSelect(user.id)}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-5 h-5"
                          />
                          <div className="flex-1">
                            <p className="font-medium text-slate-900 dark:text-white">
                              {user.fullName || user.name || user.email}
                            </p>
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                              {user.email}
                            </p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-4 mt-6">
                    <button
                      type="button"
                      onClick={handleAssignQuestions}
                      className="px-8 py-4 rounded-xl font-semibold text-white bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 focus:outline-none focus:ring-2 focus:ring-green-500 shadow-lg transition-all duration-200 flex items-center gap-2"
                      disabled={assigning}
                    >
                      {assigning ? (
                        <>
                          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          Assigning...
                        </>
                      ) : (
                        "Assign Selected Questions"
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
          {!geminiResponse && (
            <div className="text-center py-12">
              <p className="text-slate-600 dark:text-slate-300 text-lg">
                Enter a description above and click{" "}
                <strong className="text-blue-600 dark:text-blue-400">
                  Generate MCQs
                </strong>{" "}
                to get started!
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AddingMCQs;
