import React, { useState, useEffect } from "react";
import { useAuthStore } from "../store/authStore";
import { db } from "../lib/firebase";
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  getDocs,
  serverTimestamp,
  query,
  where,
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
  Save,
  Play,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import toast from "react-hot-toast";

// Define interfaces
interface Question {
  question: string;
  options: string[];
  correctAnswer: number;
}

interface ParagraphSet {
  paragraph: string;
  questions: Question[];
}

interface Test {
  id: string;
  title: string;
  description?: string;
  instructions?: string;
  paragraphSets: ParagraphSet[];
  assigned: string[];
  startAt: any;
  endAt: any;
  status: string;
  createdAt?: any;
}

interface UserAnswer {
  questionIndex: number;
  selectedOption: number;
  isCorrect: boolean;
  question: string;
  correctAnswer: number;
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
  answers?: UserAnswer[];
  userEmail: string;
  hasPlayedAudio?: boolean;
}

const ListeningRound: React.FC = () => {
  const { user, userRole } = useAuthStore();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [paragraphSets, setParagraphSets] = useState<ParagraphSet[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [existingTests, setExistingTests] = useState<Test[]>([]);
  const [loading, setLoading] = useState(false);
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [viewTest, setViewTest] = useState<Test | null>(null);
  const [editTestId, setEditTestId] = useState<string>("");
  const [aiFormData, setAiFormData] = useState<{
    paragraphLength: "Short" | "Medium" | "Long";
    paragraphTopic: string;
    mcqCount: number;
  }>({
    paragraphLength: "Medium",
    paragraphTopic: "",
    mcqCount: 4,
  });
  const [geminiResponse, setGeminiResponse] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [currentParagraph, setCurrentParagraph] = useState("");
  const [currentQuestions, setCurrentQuestions] = useState<Question[]>([
    { question: "", options: ["", "", "", ""], correctAnswer: 0 },
  ]);
  const [showParagraphEditor, setShowParagraphEditor] = useState(false);
  const [editingSetIndex, setEditingSetIndex] = useState<number | null>(null);
  const [showAIGenerator, setShowAIGenerator] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [userAnswers, setUserAnswers] = useState<Record<number, UserAnswer>>(
    {}
  );
  const [testCompleted, setTestCompleted] = useState(false);
  const [assignedTest, setAssignedTest] = useState<Test | null>(null);
  const [existingScore, setExistingScore] = useState<ListeningScore | null>(
    null
  );
  const [checkingSubmission, setCheckingSubmission] = useState(true);

  const fetchEmployees = async () => {
    try {
      const snap = await getDocs(collection(db, "employees"));
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setEmployees(data);
    } catch (error) {
      console.error("Error fetching employees:", error);
      toast.error("Failed to fetch employees");
    }
  };

  const checkExistingSubmission = async (testId: string) => {
    if (!user) return;

    try {
      const scoresQuery = query(
        collection(db, "listeningScores"),
        where("userId", "==", user.uid),
        where("testId", "==", testId)
      );
      const scoresSnap = await getDocs(scoresQuery);

      if (!scoresSnap.empty) {
        const doc = scoresSnap.docs[0];
        const scoreData = doc.data() as Omit<ListeningScore, "id">;
        setExistingScore({
          id: doc.id,
          ...scoreData,
          hasPlayedAudio: scoreData.hasPlayedAudio || false,
        });
        setTestCompleted(!!scoreData.completedAt);
        if (scoreData.hasPlayedAudio) {
          setIsPlaying(false);
          setCurrentQuestionIndex(0);
        }
      }
    } catch (error) {
      console.error("Error checking existing submission:", error);
    } finally {
      setCheckingSubmission(false);
    }
  };

  const fetchTests = async () => {
    try {
      const snap = await getDocs(collection(db, "LISTENINGROUND"));
      const tests: Test[] = snap.docs.map((d) => ({
        id: d.id,
        title: d.data().title || "",
        description: d.data().description || "",
        instructions: d.data().instructions || "",
        paragraphSets: d.data().paragraphSets || [],
        assigned: d.data().assigned || [],
        startAt: d.data().startAt,
        endAt: d.data().endAt,
        status: d.data().status || "active",
        createdAt: d.data().createdAt,
      }));
      setExistingTests(tests);

      if (userRole === "user" && user) {
        const userEmail = String(user.email || "");
        const assignedTest = tests.find(
          (test) =>
            test.assigned.includes(userEmail) &&
            test.status === "active" &&
            new Date() >= test.startAt.toDate() &&
            new Date() <= test.endAt.toDate()
        );

        if (assignedTest) {
          setAssignedTest(assignedTest);
          await checkExistingSubmission(assignedTest.id);
        } else {
          setCheckingSubmission(false);
        }
      } else {
        setCheckingSubmission(false);
      }
    } catch (error) {
      console.error("Error fetching tests:", error);
      toast.error("Failed to fetch tests");
      setCheckingSubmission(false);
    }
  };

  useEffect(() => {
    if (userRole === "hr") {
      fetchEmployees();
    }
    fetchTests();

    return () => {
      window.speechSynthesis.cancel();
      setIsPlaying(false);
    };
  }, [userRole, user]);

  const playParagraph = async (paragraph: string) => {
    if (isPlaying || existingScore?.hasPlayedAudio || testCompleted) return;

    setIsPlaying(true);
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(paragraph);
    utterance.onend = async () => {
      setIsPlaying(false);
      if (!existingScore?.hasPlayedAudio && !testCompleted) {
        setCurrentQuestionIndex(0);
      }
    };

    if (user && assignedTest && !existingScore?.hasPlayedAudio) {
      try {
        await addDoc(collection(db, "listeningScores"), {
          userId: user.uid,
          userEmail: user.email,
          testId: assignedTest.id,
          testTitle: assignedTest.title,
          hasPlayedAudio: true,
          startedAt: serverTimestamp(),
        });
        setExistingScore({
          id: "",
          userId: user.uid,
          userEmail: user.email || "",
          testId: assignedTest.id,
          testTitle: assignedTest.title,
          score: 0,
          total: 0,
          percentage: 0,
          completedAt: null,
          hasPlayedAudio: true,
        });
      } catch (error) {
        console.error("Error saving audio play status:", error);
        toast.error("Failed to save audio play status");
      }
    }

    window.speechSynthesis.speak(utterance);
  };

  const handleAnswerSubmit = (selectedOption: number) => {
    if (!assignedTest || currentQuestionIndex < 0 || testCompleted) return;

    const currentSet = assignedTest.paragraphSets[0];
    const currentQuestion = currentSet.questions[currentQuestionIndex];
    const isCorrect = selectedOption === currentQuestion.correctAnswer;

    const answer: UserAnswer = {
      questionIndex: currentQuestionIndex,
      selectedOption,
      isCorrect,
      question: currentQuestion.question,
      correctAnswer: currentQuestion.correctAnswer,
    };

    setUserAnswers((prev) => ({
      ...prev,
      [currentQuestionIndex]: answer,
    }));

    toast.success("Answer saved!");
  };

  const handlePreviousQuestion = () => {
    if (currentQuestionIndex > 0 && !testCompleted) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
    }
  };

  const handleNextQuestion = () => {
    if (!assignedTest || testCompleted) return;
    const currentSet = assignedTest.paragraphSets[0];
    if (currentQuestionIndex < currentSet.questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    }
  };

  const submitTestResults = async () => {
    if (!assignedTest || !user || testCompleted) return;

    const answersArray = Object.values(userAnswers);
    const correctCount = answersArray.filter((a) => a.isCorrect).length;
    const totalQuestions = assignedTest.paragraphSets[0].questions.length;
    const score = correctCount;
    const percentage = Math.round((correctCount / totalQuestions) * 100);

    try {
      const scoreData = {
        userId: user.uid,
        userEmail: user.email,
        testId: assignedTest.id,
        testTitle: assignedTest.title,
        answers: answersArray,
        score,
        total: totalQuestions,
        percentage,
        completedAt: serverTimestamp(),
        hasPlayedAudio: existingScore?.hasPlayedAudio || true,
      };

      let scoreDocRef;
      if (existingScore && !existingScore.completedAt) {
        scoreDocRef = doc(db, "listeningScores", existingScore.id);
        await updateDoc(scoreDocRef, scoreData);
      } else {
        scoreDocRef = await addDoc(
          collection(db, "listeningScores"),
          scoreData
        );
      }

      setTestCompleted(true);
      setUserAnswers({}); // Clear answers after submission
      toast.success(`Test completed! Score: ${score}/${totalQuestions}`);
      await checkExistingSubmission(assignedTest.id);
    } catch (error) {
      console.error("Error saving score:", error.message);
      toast.error(`Failed to save score: ${error.message}`);
    }
  };

  const handleSaveTest = async () => {
    if (!title || paragraphSets.length === 0) {
      toast.error(
        "Please enter a title and at least one paragraph with questions"
      );
      return;
    }
    if (selectedEmployees.length === 0) {
      toast.error("Please select at least one employee");
      return;
    }
    if (!startAt || !endAt) {
      toast.error("Please set Start Time and End Time");
      return;
    }

    setLoading(true);
    try {
      if (editTestId) {
        await updateDoc(doc(db, "LISTENINGROUND", editTestId), {
          title,
          description,
          instructions,
          paragraphSets,
          assigned: selectedEmployees,
          startAt: new Date(startAt),
          endAt: new Date(endAt),
          updatedAt: serverTimestamp(),
        });
        toast.success("Test updated successfully!");
      } else {
        await addDoc(collection(db, "LISTENINGROUND"), {
          title,
          description,
          instructions,
          paragraphSets,
          assigned: selectedEmployees,
          createdAt: serverTimestamp(),
          status: "active",
          startAt: new Date(startAt),
          endAt: new Date(endAt),
        });
        toast.success("Listening test created and assigned successfully!");
      }
      resetForm();
      setShowCreateForm(false);
      fetchTests();
    } catch (error) {
      console.error("Error saving test", error);
      toast.error("Error creating/updating test");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setInstructions("");
    setParagraphSets([]);
    setSelectedEmployees([]);
    setEditTestId("");
    setStartAt("");
    setEndAt("");
    setCurrentParagraph("");
    setCurrentQuestions([
      { question: "", options: ["", "", "", ""], correctAnswer: 0 },
    ]);
  };

  const handleSelectEmployee = (email: string) => {
    setSelectedEmployees((prev) =>
      prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email]
    );
  };

  const handleSelectAll = () => {
    if (selectedEmployees.length === employees.length) {
      setSelectedEmployees([]);
    } else {
      setSelectedEmployees(employees.map((emp) => emp.email));
    }
  };

  const handleView = (test: Test) => setViewTest(test);

  const handleEdit = (test: Test) => {
    setTitle(test.title || "");
    setDescription(test.description || "");
    setInstructions(test.instructions || "");
    setParagraphSets(test.paragraphSets || []);
    setSelectedEmployees(test.assigned || []);
    setEditTestId(test.id);
    setStartAt(test.startAt?.toDate?.()?.toISOString().slice(0, 16) || "");
    setEndAt(test.endAt?.toDate?.()?.toISOString().slice(0, 16) || "");
    setShowCreateForm(true);
  };

  const handleAddQuestion = () => {
    setCurrentQuestions([
      ...currentQuestions,
      { question: "", options: ["", "", "", ""], correctAnswer: 0 },
    ]);
  };

  const handleRemoveQuestion = (index: number) => {
    if (currentQuestions.length > 1) {
      setCurrentQuestions(currentQuestions.filter((_, i) => i !== index));
    }
  };

  const handleQuestionChange = (index: number, value: string) => {
    const updated = [...currentQuestions];
    updated[index].question = value;
    setCurrentQuestions(updated);
  };

  const handleOptionChange = (
    qIndex: number,
    oIndex: number,
    value: string
  ) => {
    const updated = [...currentQuestions];
    updated[qIndex].options[oIndex] = value;
    setCurrentQuestions(updated);
  };

  const handleCorrectAnswerChange = (qIndex: number, value: number) => {
    const updated = [...currentQuestions];
    updated[qIndex].correctAnswer = value;
    setCurrentQuestions(updated);
  };

  const handleSaveParagraphSet = () => {
    if (!currentParagraph.trim()) {
      toast.error("Please enter a paragraph");
      return;
    }
    const validQuestions = currentQuestions.filter(
      (q) => q.question.trim() && q.options.every((opt) => opt.trim())
    );
    if (validQuestions.length === 0) {
      toast.error("Please add at least one complete question with all options");
      return;
    }
    const newSet: ParagraphSet = {
      paragraph: currentParagraph,
      questions: validQuestions,
    };
    if (editingSetIndex !== null) {
      const updated = [...paragraphSets];
      updated[editingSetIndex] = newSet;
      setParagraphSets(updated);
      toast.success("Paragraph set updated!");
    } else {
      setParagraphSets([...paragraphSets, newSet]);
      toast.success("Paragraph set added!");
    }
    setCurrentParagraph("");
    setCurrentQuestions([
      { question: "", options: ["", "", "", ""], correctAnswer: 0 },
    ]);
    setShowParagraphEditor(false);
    setEditingSetIndex(null);
  };

  const handleEditParagraphSet = (index: number) => {
    const set = paragraphSets[index];
    setCurrentParagraph(set.paragraph);
    setCurrentQuestions(set.questions);
    setEditingSetIndex(index);
    setShowParagraphEditor(true);
  };

  const handleDeleteParagraphSet = (index: number) => {
    if (confirm("Are you sure you want to delete this paragraph set?")) {
      setParagraphSets(paragraphSets.filter((_, i) => i !== index));
      toast.success("Paragraph set deleted!");
    }
  };

  const handleGenerateWithAI = async () => {
    if (!aiFormData.paragraphTopic) {
      toast.error("Please enter a topic before generating!");
      return;
    }
    setAiLoading(true);
    setGeminiResponse("Generating content... please wait...");
    const wordLimits: Record<string, number> = {
      Short: 60,
      Medium: 120,
      Long: 240,
    };
    const limit = wordLimits[aiFormData.paragraphLength] || 150;
    const prompt = `
Generate a comprehension passage about "${aiFormData.paragraphTopic}".
The passage must be exactly ${limit} words (±10 words).
The passage should be engaging, informative, and suitable for a listening comprehension test.
Then, generate ${aiFormData.mcqCount} multiple-choice questions based on the passage.
Each question must have:
- A clear question statement
- 4 distinct options labeled A, B, C, D
- Indicate the correct answer
Format your response EXACTLY as follows:
PARAGRAPH:
[Your passage here]
QUESTIONS:
1. [Question text]
A) [Option A]
B) [Option B]
C) [Option C]
D) [Option D]
CORRECT: [A/B/C/D]
2. [Next question...]
`;
    try {
      const response = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "X-goog-api-key": "AIzaSyCfZOjBS6XFakLn7rj2gE-kPP4Z9tAtcTM",
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
      setGeminiResponse("Error generating content. Try again!");
    } finally {
      setAiLoading(false);
    }
  };

  const handleUseAIContent = () => {
    if (!geminiResponse) {
      toast.error("No content to use");
      return;
    }
    try {
      const paragraphMatch = geminiResponse.match(
        /PARAGRAPH:\s*([\s\S]*?)(?=QUESTIONS:|$)/
      );
      const questionsMatch = geminiResponse.match(/QUESTIONS:\s*([\s\S]*)/);
      if (!paragraphMatch || !questionsMatch) {
        toast.error("Could not parse AI response");
        return;
      }
      const paragraph = paragraphMatch[1].trim();
      const questionsText = questionsMatch[1];
      const questionBlocks = questionsText.split(/\d+\.\s+/).filter(Boolean);
      const parsedQuestions: Question[] = [];
      questionBlocks.forEach((block) => {
        const lines = block.trim().split("\n");
        const questionText = lines[0].trim();
        const options: string[] = [];
        let correctAnswer = 0;
        lines.forEach((line, _) => {
          if (line.match(/^[A-D]\)/)) {
            options.push(line.substring(2).trim());
          }
          if (line.startsWith("CORRECT:")) {
            const correctLetter = line.split(":")[1].trim().charAt(0);
            correctAnswer = correctLetter.charCodeAt(0) - 65;
          }
        });
        if (questionText && options.length === 4) {
          parsedQuestions.push({
            question: questionText,
            options,
            correctAnswer,
          });
        }
      });
      if (parsedQuestions.length === 0) {
        toast.error("No valid questions found");
        return;
      }
      setParagraphSets([
        ...paragraphSets,
        { paragraph, questions: parsedQuestions },
      ]);
      if (!title) {
        setTitle(aiFormData.paragraphTopic || "AI Generated Test");
      }
      if (!instructions) {
        setInstructions(
          "Listen carefully to the passage and answer the multiple-choice questions based on what you heard."
        );
      }
      setShowAIGenerator(false);
      setGeminiResponse("");
      setAiFormData({
        paragraphLength: "Medium",
        paragraphTopic: "",
        mcqCount: 4,
      });
      toast.success(
        `Paragraph with ${parsedQuestions.length} questions added successfully!`
      );
    } catch (error) {
      console.error("Error parsing AI content:", error);
      toast.error("Error parsing AI content");
    }
  };

  if (userRole === "user") {
    if (checkingSubmission) {
      return (
        <div className="min-h-screen flex items-center justify-center dark:bg-gray-900">
          <div className="text-center">
            <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-400">
              Checking test status...
            </p>
          </div>
        </div>
      );
    }

    if (!assignedTest) {
      return (
        <div className="min-h-screen flex items-center justify-center dark:bg-gray-900">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              No Active Tests
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              You have no active listening tests assigned at this time.
            </p>
          </div>
        </div>
      );
    }

    const currentSet = assignedTest.paragraphSets[0];

    if (testCompleted || (existingScore && existingScore.completedAt)) {
      const scoreData = existingScore || {
        score: Object.values(userAnswers).filter((a) => a.isCorrect).length,
        total: currentSet.questions.length,
        percentage: Math.round(
          (Object.values(userAnswers).filter((a) => a.isCorrect).length /
            currentSet.questions.length) *
            100
        ),
        hasPlayedAudio: true,
      };

      return (
        <div className="min-h-screen flex flex-col items-center justify-center dark:bg-gray-900 p-4">
          <div className="text-center bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 max-w-2xl w-full">
            <div className="mb-6">
              <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-12 h-12 text-green-600 dark:text-green-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                {existingScore?.completedAt
                  ? "Test Already Completed"
                  : "Test Completed!"}
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                {existingScore?.completedAt
                  ? "You have already submitted this test and cannot retake it."
                  : "Your responses have been submitted successfully"}
              </p>
            </div>

            {existingScore && existingScore.completedAt && (
              <div className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Submitted on:{" "}
                {existingScore.completedAt.toDate().toLocaleDateString()} at{" "}
                {existingScore.completedAt.toDate().toLocaleTimeString()}
              </div>
            )}

            
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Your detailed results will be available in the scores section
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen flex flex-col items-center justify-center dark:bg-gray-900 p-4">
        {currentQuestionIndex === -1 ? (
          <div className="text-center bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 max-w-2xl w-full">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              {assignedTest.title}
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              {assignedTest.instructions ||
                "Listen to the passage and answer the questions."}
            </p>
            <button
              onClick={() => playParagraph(currentSet.paragraph)}
              disabled={isPlaying || existingScore?.hasPlayedAudio}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center mx-auto"
            >
              <Play className="w-4 h-4 mr-2" />
              {isPlaying
                ? "Playing..."
                : existingScore?.hasPlayedAudio
                ? "Audio Played"
                : "Start Listening"}
            </button>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 max-w-2xl w-full">
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Question {currentQuestionIndex + 1} of{" "}
                  {currentSet.questions.length}
                </span>
                <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                  {Object.keys(userAnswers).length} answered
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{
                    width: `${
                      (Object.keys(userAnswers).length /
                        currentSet.questions.length) *
                      100
                    }%`,
                  }}
                />
              </div>
            </div>

            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
              {currentSet.questions[currentQuestionIndex].question}
            </h3>

            <div className="space-y-3">
              {currentSet.questions[currentQuestionIndex].options.map(
                (option, index) => {
                  const isSelected =
                    userAnswers[currentQuestionIndex]?.selectedOption === index;

                  return (
                    <button
                      key={index}
                      onClick={() => handleAnswerSubmit(index)}
                      className={`w-full text-left px-6 py-4 rounded-xl transition-colors border-2 ${
                        isSelected
                          ? "bg-blue-50 dark:bg-blue-900/20 border-blue-500 dark:border-blue-400"
                          : "bg-gray-50 dark:bg-gray-700 border-transparent hover:bg-blue-50 dark:hover:bg-gray-600 hover:border-blue-500 dark:hover:border-blue-400"
                      }`}
                    >
                      <span
                        className={`font-semibold mr-3 ${
                          isSelected
                            ? "text-blue-600 dark:text-blue-400"
                            : "text-gray-600 dark:text-gray-400"
                        }`}
                      >
                        {String.fromCharCode(65 + index)}.
                      </span>
                      <span className="text-gray-800 dark:text-gray-200">
                        {option}
                      </span>
                      {isSelected && (
                        <span className="ml-2 text-blue-600 dark:text-blue-400">
                          ✓
                        </span>
                      )}
                    </button>
                  );
                }
              )}
            </div>

            <div className="mt-8 space-y-4">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-3">
                  Question Navigation
                </p>
                <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-2">
                  {currentSet.questions.map((_, index) => {
                    const isAnswered = userAnswers[index] !== undefined;
                    const isCurrent = index === currentQuestionIndex;

                    return (
                      <button
                        key={index}
                        onClick={() => setCurrentQuestionIndex(index)}
                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                          isCurrent
                            ? "bg-blue-600 text-white shadow-lg"
                            : isAnswered
                            ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/40"
                            : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
                        }`}
                      >
                        {index + 1}
                      </button>
                    );
                  })}
                </div>
                <div className="flex gap-4 mt-3 text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded bg-blue-600"></div>
                    <span className="text-gray-600 dark:text-gray-400">
                      Current
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700"></div>
                    <span className="text-gray-600 dark:text-gray-400">
                      Answered
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600"></div>
                    <span className="text-gray-600 dark:text-gray-400">
                      Not Answered
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <div className="flex gap-2 w-full sm:w-auto">
                  <button
                    onClick={handlePreviousQuestion}
                    disabled={currentQuestionIndex === 0}
                    className="flex-1 sm:flex-none px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                  >
                    <ChevronLeft className="w-4 h-4 mr-2" />
                    Previous
                  </button>
                  <button
                    onClick={handleNextQuestion}
                    disabled={
                      currentQuestionIndex === currentSet.questions.length - 1
                    }
                    className="flex-1 sm:flex-none px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                  >
                    Next
                    <ChevronRight className="w-4 h-4 ml-2" />
                  </button>
                </div>

                <button
                  onClick={() => {
                    const answeredCount = Object.keys(userAnswers).length;
                    const totalQuestions = currentSet.questions.length;

                    if (answeredCount < totalQuestions) {
                      if (
                        !confirm(
                          `You have answered ${answeredCount} out of ${totalQuestions} questions. Do you want to submit anyway?`
                        )
                      ) {
                        return;
                      }
                    }
                    submitTestResults();
                  }}
                  className="w-full sm:w-auto px-8 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors shadow-lg hover:shadow-xl flex items-center justify-center font-semibold"
                >
                  <Send className="w-4 h-4 mr-2" />
                  Submit Test
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <motion.h1
            className="text-3xl font-bold text-gray-900 dark:text-white"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            Listening Round Assessment
          </motion.h1>
          <p className="mt-1 text-gray-600 dark:text-gray-400">
            Create paragraph-based MCQ tests for listening evaluation
          </p>
        </div>
        <div className="mt-4 sm:mt-0 flex gap-2 items-center">
          <button
            onClick={() => {
              resetForm();
              setShowCreateForm(true);
            }}
className="inline-flex items-center px-6 py-3 font-semibold rounded-xl bg-[#f8f5f2] text-[#d64b4b] dark:bg-[#e0e0e0] dark:text-[#4da6ff] transition-all duration-300 transform hover:scale-105"
          >
            <Plus className="w-5 h-5 mr-2" />
            Create Test
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[
          {
            title: "Total Tests",
            value: existingTests.length,
            icon: FileText,
            color: "blue",
          },
          {
            title: "Active Tests",
            value: existingTests.filter((t) => t.status === "active").length,
            icon: Clock,
            color: "green",
          },
          {
            title: "Total Employees",
            value: employees.length,
            icon: Users,
            color: "purple",
          },
          {
            title: "Assigned Tests",
            value: existingTests.reduce(
              (acc, test) => acc + (test.assigned?.length || 0),
              0
            ),
            icon: Target,
            color: "orange",
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

      <div className="rounded-2xl bg-[#eff1f6] shadow-[8px_8px_16px_rgba(0,0,0,0.12),-8px_-8px_16px_#ffffff] dark:bg-slate-800 dark:shadow-[8px_8px_16px_rgba(0,0,0,0.6),-8px_-8px_16px_rgba(255,255,255,0.05)]">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center">
            Existing Listening Tests
          </h2>
        </div>
        <div className="p-6">
          {existingTests.length === 0 ? (
            <div className="text-center py-12">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                No tests created yet
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Create your first listening test to get started.
              </p>
              <button
                onClick={() => {
                  resetForm();
                  setShowCreateForm(true);
                }}
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create Test
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {existingTests.map((test) => (
                <motion.div
                  key={test.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.1 }}
                  className="relative rounded-2xl p-6 transition-all duration-300 overflow-hidden hover:-translate-y-0.5 bg-[#eff1f6] shadow-[8px_8px_16px_rgba(0,0,0,0.12),-8px_-8px_16px_#ffffff] dark:bg-slate-800 dark:shadow-[8px_8px_16px_rgba(0,0,0,0.6),-8px_-8px_16px_rgba(255,255,255,0.05)]"
                >
                  <div className="relative z-10">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                          {test.title}
                        </h3>
                        <p className="text-slate-600 dark:text-slate-300 text-sm mb-3">
                          {test.description || "No description provided"}
                        </p>
                      </div>
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          test.status === "active"
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {test.status}
                      </span>
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center text-sm text-slate-700 dark:text-slate-300">
                        <FileText className="w-4 h-4 mr-2" />
                        {test.paragraphSets?.length || 0} paragraph sets
                      </div>
                      <div className="flex items-center text-sm text-slate-700 dark:text-slate-300">
                        <Users className="w-4 h-4 mr-2" />
                        {test.assigned?.length || 0} employees assigned
                      </div>
                      <div className="flex items-center text-sm text-slate-700 dark:text-slate-300">
                        <Calendar className="w-4 h-4 mr-2" />
                        {test.createdAt?.toDate?.()?.toLocaleDateString() ||
                          "Date not available"}
                      </div>
                    </div>
                    <div className="mt-6 flex space-x-2">
  <button
    onClick={() => handleView(test)}
    className="flex-1 inline-flex items-center justify-center px-3 py-2 border text-sm font-medium rounded-lg hover:-translate-y-0.5 transition-all bg-[#f3f5fa] dark:bg-slate-700"
  >
    <Eye className="w-4 h-4 mr-1" />
    View
  </button>
                      <button
                        onClick={() => handleEdit(test)}
                        className="flex-1 inline-flex items-center justify-center px-3 py-2 border text-sm font-medium rounded-lg hover:-translate-y-0.5 transition-all bg-[#f3f5fa] dark:bg-slate-700"                      >
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

      {viewTest && (
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
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
                  View Listening Test
                </h2>
                <button
                  onClick={() => setViewTest(null)}
                  className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                  {viewTest.title}
                </h3>
                <p className="mt-1 text-gray-600 dark:text-gray-400">
                  {viewTest.description || "No description provided"}
                </p>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Instructions
                </h4>
                <p className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                  {viewTest.instructions || "—"}
                </p>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                  Paragraph Sets
                </h4>
                <div className="space-y-6">
                  {(viewTest.paragraphSets || []).map(
                    (set: ParagraphSet, index: number) => (
                      <div
                        key={index}
                        className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4"
                      >
                        <h5 className="font-semibold text-gray-900 dark:text-white mb-3">
                          Paragraph {index + 1}
                        </h5>
                        <p className="text-gray-800 dark:text-gray-200 mb-4 whitespace-pre-wrap">
                          {set.paragraph}
                        </p>
                        <div className="space-y-4">
                          {set.questions.map((q, qIdx) => (
                            <div
                              key={qIdx}
                              className="bg-white dark:bg-gray-800 rounded-lg p-4"
                            >
                              <p className="font-medium text-gray-900 dark:text-white mb-2">
                                Q{qIdx + 1}: {q.question}
                              </p>
                              <div className="space-y-2">
                                {q.options.map((opt, oIdx) => (
                                  <div
                                    key={oIdx}
                                    className={`p-2 rounded ${
                                      oIdx === q.correctAnswer
                                        ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300"
                                        : "bg-gray-50 dark:bg-gray-700"
                                    }`}
                                  >
                                    {String.fromCharCode(65 + oIdx)}) {opt}
                                    {oIdx === q.correctAnswer && " ✓"}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  )}
                </div>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                  Assigned Employees
                </h4>
                <div className="flex flex-wrap gap-2">
                  {(viewTest.assigned || []).length === 0 ? (
                    <span className="text-gray-600 dark:text-gray-400">
                      None
                    </span>
                  ) : (
                    (viewTest.assigned || []).map((email: string) => {
                      const emp = employees.find((e) => e.email === email);
                      const label = emp?.fullName || email;
                      return (
                        <span
                          key={email}
                          className="px-3 py-1 rounded-full bg-[#f3f5fa] dark:bg-slate-700 text-sm text-gray-800 dark:text-gray-200"
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

      {showCreateForm && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-y-auto"
          >
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
                  {editTestId ? "Edit Listening Test" : "Create Listening Test"}
                </h2>
                <button
                  onClick={() => setShowCreateForm(false)}
                  className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Test Title *
                  </label>
                  <input
                    type="text"
                    placeholder="Enter test title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Description
                  </label>
                  <textarea
                    placeholder="Brief description of the test"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Instructions for Candidates
                  </label>
                  <textarea
                    placeholder="Detailed instructions for taking the test"
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    rows={4}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Start Time *
                  </label>
                  <input
                    type="datetime-local"
                    value={startAt}
                    onChange={(e) => setStartAt(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    End Time *
                  </label>
                  <input
                    type="datetime-local"
                    value={endAt}
                    onChange={(e) => setEndAt(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                  />
                </div>
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-4">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mr-auto">
                    Paragraph Sets *
                  </label>
                  <button
                    onClick={() => {
                      setCurrentParagraph("");
                      setCurrentQuestions([
                        {
                          question: "",
                          options: ["", "", "", ""],
                          correctAnswer: 0,
                        },
                      ]);
                      setEditingSetIndex(null);
                      setShowParagraphEditor(true);
                    }}
                    className="inline-flex items-center px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Add Paragraph Set
                  </button>
                  <button
                    onClick={() => setShowAIGenerator(true)}
                    className="inline-flex items-center px-4 py-2 text-sm font-semibold rounded-lg shadow bg-purple-600 text-white hover:bg-purple-700 transition-all duration-300"
                  >
                    <Sparkles className="w-4 h-4 mr-2" />
                    Generate with AI
                  </button>
                </div>
                {paragraphSets.length === 0 ? (
                  <div className="text-center py-8 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <FileText className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                    <p className="text-gray-600 dark:text-gray-400">
                      No paragraph sets added yet. Click "Add Paragraph Set" or
                      "Generate with AI" to start.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {paragraphSets.map((set, index) => (
                      <div
                        key={index}
                        className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 border-2 border-gray-200 dark:border-gray-600"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <h5 className="font-semibold text-gray-900 dark:text-white">
                            Paragraph Set {index + 1}
                          </h5>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleEditParagraphSet(index)}
                              className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteParagraphSet(index)}
                              className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        <p className="text-sm text-gray-700 dark:text-gray-300 mb-2 line-clamp-3">
                          {set.paragraph}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {set.questions.length} question
                          {set.questions.length !== 1 ? "s" : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <div className="flex items-center justify-between mb-4">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
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
                <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-4 max-h-64 overflow-y-auto">
                  <div className="space-y-3">
                    {employees.map((emp) => (
                      <label
                        key={emp.id}
                        className="flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedEmployees.includes(emp.email)}
                          onChange={() => handleSelectEmployee(emp.email)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-semibold">
                            {emp.fullName?.charAt(0)?.toUpperCase() || "U"}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">
                              {emp.fullName}
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
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  {selectedEmployees.length} of {employees.length} employees
                  selected
                </p>
              </div>
              <div className="flex justify-end space-x-4 pt-6 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => setShowCreateForm(false)}
                  className="px-6 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveTest}
                  disabled={loading}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
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

      {showParagraphEditor && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto"
          >
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {editingSetIndex !== null
                    ? "Edit Paragraph Set"
                    : "Add Paragraph Set"}
                </h2>
                <button
                  onClick={() => {
                    setShowParagraphEditor(false);
                    setEditingSetIndex(null);
                  }}
                  className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Paragraph Content *
                </label>
                <textarea
                  placeholder="Enter the paragraph that students will listen to..."
                  value={currentParagraph}
                  onChange={(e) => setCurrentParagraph(e.target.value)}
                  rows={6}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white resize-none"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-4">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Multiple Choice Questions *
                  </label>
                  <button
                    onClick={handleAddQuestion}
                    className="inline-flex items-center px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Add Question
                  </button>
                </div>
                <div className="space-y-6">
                  {currentQuestions.map((q, qIndex) => (
                    <div
                      key={qIndex}
                      className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 border-2 border-gray-200 dark:border-gray-600"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <h5 className="font-semibold text-gray-900 dark:text-white">
                          Question {qIndex + 1}
                        </h5>
                        {currentQuestions.length > 1 && (
                          <button
                            onClick={() => handleRemoveQuestion(qIndex)}
                            className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Question Text
                          </label>
                          <textarea
                            placeholder="Enter the question..."
                            value={q.question}
                            onChange={(e) =>
                              handleQuestionChange(qIndex, e.target.value)
                            }
                            rows={2}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:text-white resize-none"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Options
                          </label>
                          <div className="space-y-2">
                            {q.options.map((opt, oIndex) => (
                              <div
                                key={oIndex}
                                className="flex items-center gap-3"
                              >
                                <input
                                  type="radio"
                                  name={`correct-${qIndex}`}
                                  checked={q.correctAnswer === oIndex}
                                  onChange={() =>
                                    handleCorrectAnswerChange(qIndex, oIndex)
                                  }
                                  className="text-green-600 focus:ring-green-500"
                                />
                                <span className="font-medium text-gray-700 dark:text-gray-300 w-6">
                                  {String.fromCharCode(65 + oIndex)})
                                </span>
                                <input
                                  type="text"
                                  placeholder={`Option ${String.fromCharCode(
                                    65 + oIndex
                                  )}`}
                                  value={opt}
                                  onChange={(e) =>
                                    handleOptionChange(
                                      qIndex,
                                      oIndex,
                                      e.target.value
                                    )
                                  }
                                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:text-white"
                                />
                              </div>
                            ))}
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                            Select the radio button next to the correct answer
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex justify-end space-x-4 pt-6 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => {
                    setShowParagraphEditor(false);
                    setEditingSetIndex(null);
                  }}
                  className="px-6 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveParagraphSet}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-lg hover:shadow-xl flex items-center"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {editingSetIndex !== null ? "Update Set" : "Save Set"}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}

      {showAIGenerator && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto"
          >
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
                  <Sparkles className="w-6 h-6 mr-2 text-purple-600" />
                  AI Paragraph & MCQ Generator
                </h2>
                <button
                  onClick={() => {
                    setShowAIGenerator(false);
                    setGeminiResponse("");
                  }}
                  className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Paragraph Topic *
                  </label>
                  <input
                    type="text"
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 dark:bg-gray-700 dark:text-white"
                    placeholder="e.g. Climate Change"
                    value={aiFormData.paragraphTopic}
                    onChange={(e) =>
                      setAiFormData({
                        ...aiFormData,
                        paragraphTopic: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Paragraph Length
                  </label>
                  <select
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 dark:bg-gray-700 dark:text-white"
                    value={aiFormData.paragraphLength}
                    onChange={(e) =>
                      setAiFormData({
                        ...aiFormData,
                        paragraphLength: e.target.value as
                          | "Short"
                          | "Medium"
                          | "Long",
                      })
                    }
                  >
                    <option value="Short">Short</option>
                    <option value="Medium">Medium</option>
                    <option value="Long">Long</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Number of MCQs
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 dark:bg-gray-700 dark:text-white"
                    value={aiFormData.mcqCount}
                    onChange={(e) =>
                      setAiFormData({
                        ...aiFormData,
                        mcqCount: Number(e.target.value),
                      })
                    }
                  />
                </div>
              </div>
              <div className="flex gap-4">
                <button
                  onClick={handleGenerateWithAI}
                  disabled={aiLoading}
                  className={`px-8 py-3 rounded-xl font-semibold text-white bg-purple-600 hover:bg-purple-700 transition-colors shadow-lg flex items-center ${
                    aiLoading ? "opacity-60 cursor-not-allowed" : ""
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
                      Generate Content
                    </>
                  )}
                </button>
                <button
                  onClick={() => setGeminiResponse("")}
                  className="px-8 py-3 rounded-xl font-semibold text-purple-600 bg-white border-2 border-purple-600 hover:bg-purple-50 transition-colors"
                >
                  Reset
                </button>
              </div>
              {geminiResponse && (
                <div className="space-y-6">
                  <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                      Generated Content
                    </h3>
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-6">
                      <pre className="whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-200 font-mono">
                        {geminiResponse}
                      </pre>
                    </div>
                  </div>
                  <div className="flex justify-end gap-4 pt-6 border-t border-gray-200 dark:border-gray-700">
                    <button
                      onClick={() => setGeminiResponse("")}
                      className="px-6 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      Discard
                    </button>
                    <button
                      onClick={handleUseAIContent}
                      className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors shadow-lg hover:shadow-xl flex items-center"
                    >
                      <Save className="w-4 h-4 mr-2" />
                      Use This Content
                    </button>
                  </div>
                </div>
              )}
              {!geminiResponse && (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <Sparkles className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>
                    Enter a topic and click Generate to create AI-powered
                    content
                  </p>
                  <p className="text-sm mt-2">
                    AI will generate a paragraph with multiple-choice questions
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
};

export default ListeningRound;
