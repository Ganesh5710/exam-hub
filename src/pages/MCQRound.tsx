import React, { useEffect, useRef, useState } from "react";
import {
  collection,
  getDocs,
  doc,
  setDoc,
  getDoc,
} from "../lib/firebase";
import { db, getServerTime } from "../lib/firebase";
import { getAuth } from "../lib/firebase";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import {
  CheckCircle,
  Clock,
  AlertTriangle,
  Shield,
  Monitor,
  Play,
  Send,
  ChevronLeft,
  ChevronRight,
  FileText,
  User,
  Volume2,
  VolumeX,
  BookOpen,
  Target,
} from "lucide-react";

const MCQRoundPage = () => {
  const auth = getAuth();
  const user = auth.currentUser;
  const navigate = useNavigate();

  const [questions, setQuestions] = useState<any[]>([]);
  const [answers, setAnswers] = useState<{ [key: string]: string }>({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [rulesChecked, setRulesChecked] = useState(false);
  const [acceptedRules, setAcceptedRules] = useState(false);
  const [started, setStarted] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  // Track whether we showed a warning once (optional UI)
  
  const [timerSec, setTimerSec] = useState(0);
  const [violations, setViolations] = useState(0);
  const [warningMsg, setWarningMsg] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showFullscreen, setShowFullscreen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [remainingSec, setRemainingSec] = useState<number | null>(null);
  const warnShownRef = useRef(false);
  const timerRef = React.useRef<number | null>(null);

  // Save draft to Firestore
  const saveDraft = async (draft: any) => {
    if (!user) return;
    await setDoc(
      doc(db, "responses", user.uid),
      { round1Draft: draft },
      { merge: true }
    );
  };

  // On mount, check for submission and restore draft if present
  useEffect(() => {
    const checkAlreadySubmitted = async () => {
      if (!user) return;
      const snap = await getDoc(doc(db, "responses", user.uid));
      if (snap.exists()) {
        const data = snap.data();
        if (data?.round1Submitted) {
          setSubmitted(true);
        } else if (data?.round1Draft) {
          // Restore draft answers and timer
          const draftAnswers = data.round1Draft.answers || {};
          setAnswers(draftAnswers);
          setTimerSec(data.round1Draft.timerSec || 0);
          setViolations(data.round1Draft.violations || 0);
          // Find first unanswered question index
          let firstUnanswered = 0;
          if (Array.isArray(questions) && questions.length > 0) {
            for (let i = 0; i < questions.length; i++) {
              if (!draftAnswers[questions[i].id]) {
                firstUnanswered = i;
                break;
              }
              // If all answered, stay at last
              if (i === questions.length - 1) firstUnanswered = i;
            }
          } else {
            firstUnanswered = data.round1Draft.currentQuestionIndex || 0;
          }
          setCurrentQuestionIndex(firstUnanswered);
        }
      }
      setDraftLoaded(true);
    };
    checkAlreadySubmitted();
  }, [user, questions]);

  useEffect(() => {
    const fetchQuestions = async () => {
      if (!user) return;
      // Fetch all questions and filter client-side: include mcq assigned to user OR with assignedTo missing/empty (global)
      const now = await getServerTime();
      const qSnap = await getDocs(collection(db, "questions"));
      const list = qSnap.docs
        .map((d) => ({ id: d.id, ...d.data() } as any))
        .filter((q: any) => {
          if (q.type !== "mcq") return false;
          const assigned = Array.isArray(q.assignedTo) ? q.assignedTo : [];
          const hasAssignment = assigned.length > 0;
          const inAssignees = !hasAssignment || assigned.includes(user.uid);
          const startOk = !q.startAt || (q.startAt?.toDate?.() || new Date(q.startAt)) <= now;
          const endOk = !q.endAt || (q.endAt?.toDate?.() || new Date(q.endAt)) >= now;
          return inAssignees && startOk && endOk;
        });
      setQuestions(list);

      // Setup countdown to earliest end time among loaded questions (if any)
      const ends: number[] = list
        .map((q: any) => q.endAt ? (q.endAt?.toDate?.()?.getTime?.() || new Date(q.endAt).getTime()) : Infinity)
        .filter((n: number) => Number.isFinite(n));
      if (ends.length > 0) {
        const earliest = Math.min(...ends);
        const baseRemaining = Math.max(0, Math.floor((earliest - now.getTime()) / 1000));
        setRemainingSec(baseRemaining);
      } else {
        setRemainingSec(null);
      }
    };
    fetchQuestions();
  }, [user]);

  // Timer
  useEffect(() => {
    if (!started || submitted) return;
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      setTimerSec((s) => {
        const next = s + 1;
        saveDraft({
          answers,
          timerSec: next,
          violations,
          currentQuestionIndex,
        });
        return next;
      });
    }, 1000) as unknown as number;

    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [started, submitted, answers, violations, currentQuestionIndex]);

  // Anti-cheat monitoring
  useEffect(() => {
    const handleViolation = async () => {
      if (!started || submitted) return;
      
      setViolations(v => {
        const newViolations = v + 1;
        if (newViolations < 5) {
          setWarningMsg(`Warning: Do not exit fullscreen or switch tabs. Violation ${newViolations} of 5.`);
          if (soundEnabled) {
            const audio = new Audio("data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj");
            audio.play().catch(() => {});
          }
          reEnterFullscreen();
        } else {
          setWarningMsg("Exam rejected due to excessive violations (5 reached).");
          handleReject();
        }
        return newViolations;
      });
    };

    const handleVisibility = () => {
      if (document.hidden) handleViolation();
    };

    const handleFullscreenExit = () => {
      if (!document.fullscreenElement) {
        setShowFullscreen(false);
        handleViolation();
      } else {
        setShowFullscreen(true);
      }
    };

    const handleESCKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleViolation();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Disable refresh
      if ((e.ctrlKey || e.metaKey) && e.key === "r") e.preventDefault();
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "R") e.preventDefault();
      if (e.key === "F5") e.preventDefault();
    };

    if (started && !submitted) {
      document.addEventListener("visibilitychange", handleVisibility);
      document.addEventListener("fullscreenchange", handleFullscreenExit);
      window.addEventListener("keydown", handleESCKey);
      window.addEventListener("keydown", handleKeyDown);

      const preventContext = (e: MouseEvent) => e.preventDefault();
      document.addEventListener("contextmenu", preventContext);

      return () => {
        document.removeEventListener("visibilitychange", handleVisibility);
        document.removeEventListener("fullscreenchange", handleFullscreenExit);
        window.removeEventListener("keydown", handleESCKey);
        window.removeEventListener("keydown", handleKeyDown);
        document.removeEventListener("contextmenu", preventContext);
      };
    }
  }, [started, submitted, soundEnabled]);

  const reEnterFullscreen = async () => {
    const el = document.documentElement as any;
    try {
      if (!document.fullscreenElement && el.requestFullscreen) {
        await el.requestFullscreen({ navigationUI: "hide" } as any);
        setShowFullscreen(true);
      }
    } catch {
      // ignore
    }
  };

  const exitFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        setShowFullscreen(false);
      }
    } catch {
      // ignore
    }
  };

  const handleStart = async () => {
    setStarted(true);
    await reEnterFullscreen();
  };

  const handleSelect = (qid: string, opt: string) => {
    if (submitted) return;
    setAnswers((prev) => {
      const updated = { ...prev, [qid]: opt };
      saveDraft({
        answers: updated,
        timerSec,
        violations,
        currentQuestionIndex,
      });
      return updated;
    });
  };

  // Save draft when currentQuestionIndex changes
  useEffect(() => {
    if (!started || submitted) return;
    saveDraft({
      answers,
      timerSec,
      violations,
      currentQuestionIndex,
    });
  }, [currentQuestionIndex, started, submitted, answers, timerSec, violations]);

  const handleSubmit = async () => {
    if (!user || loading) return;
    
    setLoading(true);

    let correctCount = 0;
    let wrongCount = 0;
    const answerDetails: { [key: string]: any } = {};

    for (const q of questions) {
      const selectedAnswer = answers[q.id] || "";
      const isCorrect = selectedAnswer === q.answer;

      if (isCorrect) correctCount++;
      else wrongCount++;

      answerDetails[q.id] = {
        question: q.title,
        selected: selectedAnswer,
        correct: q.answer,
        isCorrect,
      };
    }

    const totalScore = correctCount;

    try {
      await setDoc(
        doc(db, "responses", user.uid),
        {
          round1: {
            submittedAt: new Date(),
            score: totalScore,
            correct: correctCount,
            wrong: wrongCount,
            answers: answerDetails,
            examDuration: timerSec,
            violations: violations,
          },
          round1Submitted: true,
        },
        { merge: true }
      );

      setSubmitted(true);
      // await exitFullscreen();

      if (soundEnabled) {
        const audio = new Audio("data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj");
        audio.play().catch(() => {});
      }

      // Navigate to dashboard after successful submission
      setTimeout(() => {
        navigate("/dashboard");
      }, 1000);
    } catch (error) {
      console.error("Submission failed:", error);
      setWarningMsg("Submission failed. Please try again.");
      setLoading(false);
    }
  };

  const handleReject = async () => {
    if (!user) return;
    setSubmitted(true);

    await setDoc(
      doc(db, "responses", user.uid),
      {
        round1Submitted: true,
        round1Rejected: true,
        rejectedAt: new Date(),
        violations: violations,
      },
      { merge: true }
    );

    await exitFullscreen();
    navigate("/rejected");
  };

  const fmtTime = (s: number) => {
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  };

  const currentQuestion = questions[currentQuestionIndex];
  const answeredCount = Object.keys(answers).length;
  const progressPercentage = questions.length > 0 ? (answeredCount / questions.length) * 100 : 0;

  // Global countdown based on end time with 1-minute warning and auto-submit
  useEffect(() => {
    if (submitted) return;
    if (remainingSec == null) return;
    const id = window.setInterval(() => {
      setRemainingSec((s) => {
        if (s == null) return s;
        const next = s - 1;
        if (next === 60 && !warnShownRef.current) {
          warnShownRef.current = true;
          toast("MCQ ends in 1 minute!", { icon: "⏰" });
          if (soundEnabled) {
            const audio = new Audio("data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj");
            audio.play().catch(() => {});
          }
        }
        if (next <= 0) {
          window.clearInterval(id);
          if (!submitted) {
            handleSubmit();
          }
          return 0;
        }
        return next;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [remainingSec, submitted, soundEnabled]);

  // No camera to turn off on logout in MCQ round

  // Redirect to dashboard if submitted
  if (submitted) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-6 bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md bg-[#f0f0f3] dark:bg-[#1e1e2a] rounded-3xl p-8 shadow-[6px_6px_12px_rgba(0,0,0,0.15),-6px_-6px_12px_rgba(255,255,255,0.7)] dark:shadow-[6px_6px_12px_rgba(0,0,0,0.6),-6px_-6px_12px_rgba(255,255,255,0.05)] text-center"
        >
          <motion.h2
            className="text-2xl font-bold text-gray-800 dark:text-gray-200 mb-4"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            Successfully Submitted!
          </motion.h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Your MCQ round has been completed and submitted. Redirecting to dashboard...
          </p>
        </motion.div>
      </div>
    );
  }

  if (!questions.length) {
    if (!draftLoaded) {
      // Wait for draft to load before rendering questions
      return (
        <div className="flex items-center justify-center min-h-96 bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
          <div className="text-center bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-3xl p-8 border border-white/20 dark:border-slate-700/50 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]">
            <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-400">Loading...</p>
          </div>
        </div>
      );
    }
    return (
      <div className="flex items-center justify-center min-h-96 bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
        <div className="text-center bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-3xl p-8 border border-white/20 dark:border-slate-700/50 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]">
          <BookOpen className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No MCQ questions assigned</h3>
          <p className="text-gray-600 dark:text-gray-400">Please contact your administrator.</p>
        </div>
      </div>
    );
  }

  if (!acceptedRules) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-6 bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-2xl w-full bg-[#eff1f6] dark:bg-slate-800 rounded-2xl shadow-[8px_8px_16px_rgba(0,0,0,0.12),-8px_-8px_16px_#ffffff] dark:shadow-[8px_8px_16px_rgba(0,0,0,0.6),-8px_-8px_16px_rgba(255,255,255,0.05)] p-8"
        >
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <FileText className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Round 1 — MCQ Test</h1>
            <p className="text-slate-600 dark:text-slate-400">Multiple Choice Question Assessment</p>
            
            {/* Timing Information */}
            {questions.length > 0 && (
              <div className="mt-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
                <div className="flex items-center justify-center space-x-4 text-sm">
                  <div className="flex items-center space-x-2">
                    <Clock className="w-4 h-4 text-blue-600" />
                    <span className="text-blue-800 dark:text-blue-300">
                      {questions[0]?.startAt ? 
                        `Starts: ${questions[0].startAt.toDate?.()?.toLocaleString() || new Date(questions[0].startAt).toLocaleString()}` : 
                        'No start time set'
                      }
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Clock className="w-4 h-4 text-red-600" />
                    <span className="text-red-800 dark:text-red-300">
                      {questions[0]?.endAt ? 
                        `Ends: ${questions[0].endAt.toDate?.()?.toLocaleString() || new Date(questions[0].endAt).toLocaleString()}` : 
                        'No end time set'
                      }
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
          
          <div className="space-y-4 mb-8">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Examination Rules:</h3>
            <ul className="space-y-3 text-slate-700 dark:text-slate-300">
              <li className="flex items-start p-3 bg-[#f3f5fa] dark:bg-slate-700/50 rounded-xl shadow-[inset_4px_4px_8px_rgba(0,0,0,0.08),inset_-4px_-4px_8px_#ffffff] dark:shadow-[inset_4px_4px_8px_rgba(0,0,0,0.2),inset_-4px_-4px_8px_rgba(255,255,255,0.05)] border border-white/30 dark:border-slate-600/30">
                <Shield className="w-5 h-5 text-blue-600 mr-3 mt-0.5 flex-shrink-0" />
                <span>The test will run in full-screen mode for security</span>
              </li>
              <li className="flex items-start p-3 bg-[#f3f5fa] dark:bg-slate-700/50 rounded-xl shadow-[inset_4px_4px_8px_rgba(0,0,0,0.08),inset_-4px_-4px_8px_#ffffff] dark:shadow-[inset_4px_4px_8px_rgba(0,0,0,0.2),inset_-4px_-4px_8px_rgba(255,255,255,0.05)] border border-white/30 dark:border-slate-600/30">
                <Monitor className="w-5 h-5 text-blue-600 mr-3 mt-0.5 flex-shrink-0" />
                <span>Do not switch tabs, minimize, or change windows</span>
              </li>
              <li className="flex items-start p-3 bg-[#f3f5fa] dark:bg-slate-700/50 rounded-xl shadow-[inset_4px_4px_8px_rgba(0,0,0,0.08),inset_-4px_-4px_8px_#ffffff] dark:shadow-[inset_4px_4px_8px_rgba(0,0,0,0.2),inset_-4px_-4px_8px_rgba(255,255,255,0.05)] border border-white/30 dark:border-slate-600/30">
                <Clock className="w-5 h-5 text-blue-600 mr-3 mt-0.5 flex-shrink-0" />
                <span>Answer all questions within the time limit</span>
              </li>
              <li className="flex items-start p-3 bg-[#f3f5fa] dark:bg-slate-700/50 rounded-xl shadow-[inset_4px_4px_8px_rgba(0,0,0,0.08),inset_-4px_-4px_8px_#ffffff] dark:shadow-[inset_4px_4px_8px_rgba(0,0,0,0.2),inset_-4px_-4px_8px_rgba(255,255,255,0.05)] border border-white/30 dark:border-slate-600/30">
                <AlertTriangle className="w-5 h-5 text-orange-500 mr-3 mt-0.5 flex-shrink-0" />
                <span>Violations will be recorded and may result in exam rejection after 5 violations</span>
              </li>
            </ul>
          </div>

          <div className="bg-[#f3f5fa] dark:bg-slate-700/50 rounded-2xl p-4 mb-6 shadow-[inset_4px_4px_8px_rgba(0,0,0,0.08),inset_-4px_-4px_8px_#ffffff] dark:shadow-[inset_4px_4px_8px_rgba(0,0,0,0.2),inset_-4px_-4px_8px_rgba(255,255,255,0.05)] border border-white/30 dark:border-slate-600/30">
            <div className="flex items-center space-x-3">
              <Target className="w-5 h-5 text-blue-600" />
              <div>
                <p className="font-medium text-slate-900 dark:text-white">Questions: {questions.length}</p>
                <p className="text-sm text-slate-600 dark:text-slate-400">Complete all questions to finish</p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <label className="flex items-center space-x-3">
              <input
                type="checkbox"
                checked={rulesChecked}
                onChange={(e) => setRulesChecked(e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 shadow-[inset_2px_2px_4px_rgba(0,0,0,0.1)]"
              />
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                I have read and accept the examination rules
              </span>
            </label>
            <button
              onClick={() => rulesChecked && setAcceptedRules(true)}
              disabled={!rulesChecked}
              className="px-6 py-3 bg-blue-600 text-white rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700 transition-all duration-300 shadow-[6px_6px_12px_rgba(0,0,0,0.15),-6px_-6px_12px_#ffffff] dark:shadow-[6px_6px_12px_rgba(0,0,0,0.4),-6px_-6px_12px_rgba(255,255,255,0.05)] hover:shadow-[8px_8px_16px_rgba(0,0,0,0.2),-8px_-8px_16px_#ffffff] transform hover:scale-[1.02]"
            >
              Continue
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (!started) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-6 bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-xl w-full bg-[#eff1f6] dark:bg-slate-800 rounded-2xl shadow-[8px_8px_16px_rgba(0,0,0,0.12),-8px_-8px_16px_#ffffff] dark:shadow-[8px_8px_16px_rgba(0,0,0,0.6),-8px_-8px_16px_rgba(255,255,255,0.05)] p-8 text-center"
        >
          <div className="w-20 h-20 bg-gradient-to-br from-green-500 to-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Play className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">Ready to Begin?</h2>
          <p className="text-slate-600 dark:text-slate-400 mb-8">
            When you click "Start Exam", we will enable full-screen mode and begin the timer.
          </p>

          {/* Student UID */}
          <div className="mb-8 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300 text-sm select-all">
            <strong>Your Student UID:</strong> <span style={{wordBreak:'break-all'}}>{user?.uid ?? ''}</span>
          </div>

          <div className="flex justify-center space-x-4">
            <button
              onClick={handleStart}
              className="px-8 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all duration-300 shadow-[6px_6px_12px_rgba(0,0,0,0.15),-6px_-6px_12px_#ffffff] dark:shadow-[6px_6px_12px_rgba(0,0,0,0.4),-6px_-6px_12px_rgba(255,255,255,0.05)] hover:shadow-[8px_8px_16px_rgba(0,0,0,0.2),-8px_-8px_16px_#ffffff] transform hover:scale-[1.02] flex items-center"
              disabled={false}
            >
              <Play className="w-5 h-5 mr-2" />
              Start Exam
            </button>
            <button
              onClick={() => setAcceptedRules(false)}
              className="px-8 py-3 bg-[#f3f5fa] dark:bg-slate-700/70 border border-slate-300/50 dark:border-slate-600/50 text-slate-700 dark:text-slate-300 rounded-xl hover:bg-[#e8ebf0] dark:hover:bg-slate-600/90 transition-all duration-300 shadow-[4px_4px_8px_rgba(0,0,0,0.1),-4px_-4px_8px_#ffffff] dark:shadow-[4px_4px_8px_rgba(0,0,0,0.3),-4px_-4px_8px_rgba(255,255,255,0.05)] hover:shadow-[6px_6px_12px_rgba(0,0,0,0.15),-6px_-6px_12px_#ffffff]"
            >
              Back
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      {/* Exam Header */}
      <div className="sticky top-0 z-50 bg-white/90 dark:bg-gray-800/90 backdrop-blur-md border-b border-white/20 dark:border-gray-700/50 shadow-[0_4px_6px_rgba(0,0,0,0.1)]">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-6">
              <div className="flex items-center space-x-2">
                <Clock className="w-5 h-5 text-blue-600" />
                <span className="font-mono text-lg font-semibold text-gray-900 dark:text-white">
                  {fmtTime(timerSec)}
                </span>
              </div>
              
              <div className="flex items-center space-x-2">
                <User className="w-5 h-5 text-green-600" />
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {answeredCount} / {questions.length} answered
                </span>
              </div>

              <div className="flex items-center space-x-2">
                <AlertTriangle className="w-5 h-5 text-orange-500" />
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Violations: <span className="font-semibold text-orange-600">{violations}</span>
                </span>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <button
                onClick={() => setSoundEnabled(!soundEnabled)}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-xl hover:bg-white/70 dark:hover:bg-gray-700/70 transition-all duration-300 shadow-[0_2px_4px_rgba(0,0,0,0.1)] hover:shadow-[0_4px_8px_rgba(0,0,0,0.15)]"
              >
                {soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
              </button>
              
              <div className={`flex items-center space-x-2 px-3 py-1 rounded-xl text-xs font-medium transition-all duration-300 ${
                showFullscreen ? 'bg-gradient-to-r from-green-100 to-emerald-100 dark:from-green-900/50 dark:to-emerald-900/50 text-green-800 dark:text-green-300 shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)]' : 'bg-gradient-to-r from-red-100 to-pink-100 dark:from-red-900/50 dark:to-pink-900/50 text-red-800 dark:text-red-300 shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)]'
              }`}>
                <Monitor className="w-4 h-4" />
                <span>{showFullscreen ? 'Fullscreen ON' : 'Fullscreen OFF'}</span>
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-4">
            <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
              <span>Progress</span>
              <span>{Math.round(progressPercentage)}%</span>
            </div>
            <div className="w-full bg-white/50 dark:bg-gray-700/50 rounded-full h-3 shadow-[inset_0_2px_4px_rgba(0,0,0,0.1)] border border-white/30 dark:border-gray-600/30">
              <div 
                className="bg-gradient-to-r from-blue-500 to-indigo-500 h-3 rounded-full transition-all duration-300 shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)]"
                style={{ width: `${progressPercentage}%` }}
              ></div>
            </div>
          </div>
        </div>

        {warningMsg && (
          <div className="bg-gradient-to-r from-yellow-50/90 to-orange-50/90 dark:from-yellow-900/20 dark:to-orange-900/20 border-b border-yellow-200/50 dark:border-yellow-800/50 backdrop-blur-sm">
            <div className="max-w-7xl mx-auto px-6 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <AlertTriangle className="w-5 h-5 text-yellow-600" />
                  <span className="text-yellow-800 dark:text-yellow-200">{warningMsg}</span>
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={async () => {
                      setWarningMsg(null);
                      await reEnterFullscreen();
                    }}
                    className="px-3 py-1 bg-gradient-to-r from-yellow-200 to-orange-200 dark:from-yellow-800 dark:to-orange-800 text-yellow-800 dark:text-yellow-200 rounded-xl text-sm hover:from-yellow-300 hover:to-orange-300 dark:hover:from-yellow-700 dark:hover:to-orange-700 transition-all duration-300 shadow-[0_2px_4px_rgba(0,0,0,0.1)] hover:shadow-[0_4px_8px_rgba(0,0,0,0.15)]"
                  >
                    Resume Fullscreen
                  </button>
                  <button
                    onClick={() => setWarningMsg(null)}
                    className="px-3 py-1 bg-white/70 dark:bg-gray-800/70 border border-yellow-300/50 dark:border-yellow-700/50 text-yellow-800 dark:text-yellow-200 rounded-xl text-sm hover:bg-white/90 dark:hover:bg-gray-700/90 transition-all duration-300 shadow-[0_2px_4px_rgba(0,0,0,0.1)] hover:shadow-[0_4px_8px_rgba(0,0,0,0.15)]"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Exam Content */}
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-[#eff1f6] dark:bg-slate-800 rounded-2xl shadow-[8px_8px_16px_rgba(0,0,0,0.12),-8px_-8px_16px_#ffffff] dark:shadow-[8px_8px_16px_rgba(0,0,0,0.6),-8px_-8px_16px_rgba(255,255,255,0.05)] overflow-hidden">
          {/* Question Header */}
          <div className="p-6 border-b border-slate-200 dark:border-slate-700 bg-[#f3f5fa] dark:bg-slate-700/50">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">
                  Question {currentQuestionIndex + 1} of {questions.length}
                </h2>
                <p className="text-slate-600 dark:text-slate-400">
                  {currentQuestion.difficulty && (
                    <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium mr-2 ${
                      'bg-blue-100 text-blue-800'
                    }`}>
                      {currentQuestion.difficulty}
                    </span>
                  )}
                  {currentQuestion.tags && currentQuestion.tags.length > 0 && (
                    currentQuestion.tags.map((tag: string, i: number) => (
                      <span key={i} className="inline-block px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded text-xs mr-1">
                        {tag}
                      </span>
                    ))
                  )}
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setCurrentQuestionIndex(Math.max(0, currentQuestionIndex - 1))}
                  disabled={currentQuestionIndex === 0}
                  className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setCurrentQuestionIndex(Math.min(questions.length - 1, currentQuestionIndex + 1))}
                  disabled={currentQuestionIndex === questions.length - 1}
                  className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>

          {/* Question Content */}
          <div className="p-8 bg-[#eff1f6] dark:bg-slate-800">
            <motion.div
              key={currentQuestionIndex}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3 }}
            >
              <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-6 leading-relaxed">
                {currentQuestion.title}
              </h3>

              {currentQuestion.description && (
                <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                  <p className="text-slate-700 dark:text-slate-300 text-sm">
                    {currentQuestion.description}
                  </p>
                </div>
              )}

              <div className="space-y-3">
                {currentQuestion.options?.map((option: string, index: number) => {
                  const isSelected = answers[currentQuestion.id] === option;
                  const optionLetter = String.fromCharCode(65 + index);
                  return (
                    <motion.button
                      key={index}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                      onClick={() => handleSelect(currentQuestion.id, option)}
                      disabled={submitted}
                      className={`w-full p-4 text-left rounded-2xl transition-all duration-300 ${
                        isSelected
                          ? "bg-blue-600 text-white shadow-[inset_4px_4px_8px_rgba(0,0,0,0.2),inset_-4px_-4px_8px_rgba(255,255,255,0.1)] transform scale-[0.98]"
                          : "bg-[#f3f5fa] dark:bg-slate-700/70 shadow-[4px_4px_8px_rgba(0,0,0,0.1),-4px_-4px_8px_#ffffff] dark:shadow-[4px_4px_8px_rgba(0,0,0,0.3),-4px_-4px_8px_rgba(255,255,255,0.05)] hover:shadow-[6px_6px_12px_rgba(0,0,0,0.15),-6px_-6px_12px_#ffffff] dark:hover:shadow-[6px_6px_12px_rgba(0,0,0,0.4),-6px_-6px_12px_rgba(255,255,255,0.05)] hover:bg-[#e8ebf0] dark:hover:bg-slate-600/90 border border-white/30 dark:border-slate-600/30"
                      }`}
                    >
                      <div className="flex items-start space-x-4">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                          isSelected
                            ? "bg-white/20 text-white shadow-[inset_2px_2px_4px_rgba(0,0,0,0.2)]"
                            : "bg-[#f3f5fa] dark:bg-slate-600 text-slate-700 dark:text-slate-300 shadow-[inset_2px_2px_4px_rgba(0,0,0,0.1),inset_-2px_-2px_4px_#ffffff] dark:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.3),inset_-2px_-2px_4px_rgba(255,255,255,0.05)]"
                        }`}>
                          {optionLetter}
                        </div>
                        <div className="flex-1">
                          <p className="text-slate-900 dark:text-white font-medium">
                            {option}
                          </p>
                        </div>
                        {isSelected && (
                          <CheckCircle className="w-5 h-5 text-blue-500" />
                        )}
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          </div>

          {/* Navigation Footer */}
          <div className="p-6 border-t border-slate-200 dark:border-slate-700 bg-[#f3f5fa] dark:bg-slate-700/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <span className="text-sm text-slate-600 dark:text-slate-400">
                  Question {currentQuestionIndex + 1} of {questions.length}
                </span>
                {answers[currentQuestion.id] && (
                  <span className="inline-flex items-center px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Answered
                  </span>
                )}
              </div>

              <div className="flex items-center space-x-3">
                {currentQuestionIndex > 0 && (
                  <button
                    onClick={() => setCurrentQuestionIndex(currentQuestionIndex - 1)}
                    className="px-4 py-2 bg-[#f3f5fa] dark:bg-slate-700/70 text-slate-700 dark:text-slate-300 rounded-xl hover:bg-[#e8ebf0] dark:hover:bg-slate-600/90 transition-all duration-300 shadow-[4px_4px_8px_rgba(0,0,0,0.1),-4px_-4px_8px_#ffffff] dark:shadow-[4px_4px_8px_rgba(0,0,0,0.3),-4px_-4px_8px_rgba(255,255,255,0.05)] hover:shadow-[6px_6px_12px_rgba(0,0,0,0.15),-6px_-6px_12px_#ffffff] border border-white/30 dark:border-slate-600/30"
                  >
                    Previous
                  </button>
                )}

                {currentQuestionIndex < questions.length - 1 ? (
                  <button
                    onClick={() => setCurrentQuestionIndex(currentQuestionIndex + 1)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all duration-300 shadow-[6px_6px_12px_rgba(0,0,0,0.15),-6px_-6px_12px_#ffffff] dark:shadow-[6px_6px_12px_rgba(0,0,0,0.4),-6px_-6px_12px_rgba(255,255,255,0.05)] hover:shadow-[8px_8px_16px_rgba(0,0,0,0.2),-8px_-8px_16px_#ffffff] transform hover:scale-[1.02]"
                  >
                    Next
                  </button>
                ) : (
                  <button
                    onClick={handleSubmit}
                    disabled={loading}
                    className="px-6 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 shadow-[6px_6px_12px_rgba(0,0,0,0.15),-6px_-6px_12px_#ffffff] dark:shadow-[6px_6px_12px_rgba(0,0,0,0.4),-6px_-6px_12px_rgba(255,255,255,0.05)] hover:shadow-[8px_8px_16px_rgba(0,0,0,0.2),-8px_-8px_16px_#ffffff] transform hover:scale-[1.02] flex items-center"
                  >
                    {loading ? (
                      <>
                        <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                        Submitting...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4 mr-2" />
                        Submit Exam
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Question Overview */}
        <div className="mt-6 bg-[#eff1f6] dark:bg-slate-800 rounded-2xl shadow-[8px_8px_16px_rgba(0,0,0,0.12),-8px_-8px_16px_#ffffff] dark:shadow-[8px_8px_16px_rgba(0,0,0,0.6),-8px_-8px_16px_rgba(255,255,255,0.05)] p-6">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Question Overview</h3>
          <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
            {questions.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentQuestionIndex(index)}
                className={`w-10 h-10 rounded-xl text-sm font-medium transition-all duration-300 ${
                  index === currentQuestionIndex
                    ? "bg-blue-600 text-white shadow-[inset_4px_4px_8px_rgba(0,0,0,0.2),inset_-4px_-4px_8px_rgba(255,255,255,0.1)] transform scale-95"
                    : answers[questions[index].id]
                    ? "bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 shadow-[4px_4px_8px_rgba(0,0,0,0.1),-4px_-4px_8px_#ffffff] dark:shadow-[4px_4px_8px_rgba(0,0,0,0.3),-4px_-4px_8px_rgba(255,255,255,0.05)] hover:shadow-[6px_6px_12px_rgba(0,0,0,0.15),-6px_-6px_12px_#ffffff] hover:bg-blue-200 dark:hover:bg-blue-800/70"
                    : "bg-[#f3f5fa] dark:bg-slate-700/70 text-slate-600 dark:text-slate-400 shadow-[4px_4px_8px_rgba(0,0,0,0.1),-4px_-4px_8px_#ffffff] dark:shadow-[4px_4px_8px_rgba(0,0,0,0.3),-4px_-4px_8px_rgba(255,255,255,0.05)] hover:shadow-[6px_6px_12px_rgba(0,0,0,0.15),-6px_-6px_12px_#ffffff] hover:bg-[#e8ebf0] dark:hover:bg-slate-600/90 border border-white/30 dark:border-slate-600/30"
                }`}
              >
                {index + 1}
              </button>
            ))}
          </div>
          <div className="mt-4 flex items-center space-x-6 text-sm">
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 bg-blue-600 rounded shadow-[inset_2px_2px_4px_rgba(0,0,0,0.2),inset_-2px_-2px_4px_rgba(255,255,255,0.1)]"></div>
              <span className="text-slate-600 dark:text-slate-400">Current</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 bg-blue-100 dark:bg-blue-900/50 border border-blue-300 dark:border-blue-700 rounded shadow-[2px_2px_4px_rgba(0,0,0,0.1),-2px_-2px_4px_#ffffff] dark:shadow-[2px_2px_4px_rgba(0,0,0,0.3),-2px_-2px_4px_rgba(255,255,255,0.05)]"></div>
              <span className="text-slate-600 dark:text-slate-400">Answered</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 bg-[#f3f5fa] dark:bg-slate-700/70 border border-white/30 dark:border-slate-600/30 rounded shadow-[2px_2px_4px_rgba(0,0,0,0.1),-2px_-2px_4px_#ffffff] dark:shadow-[2px_2px_4px_rgba(0,0,0,0.3),-2px_-2px_4px_rgba(255,255,255,0.05)]"></div>
              <span className="text-slate-600 dark:text-slate-400">Not Answered</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MCQRoundPage;