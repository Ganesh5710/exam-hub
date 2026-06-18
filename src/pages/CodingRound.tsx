import { useEffect, useMemo, useRef, useState } from "react";
import { getAuth } from "../lib/firebase";
import { db, getServerTime } from "../lib/firebase";
import { collection, getDocs, setDoc, doc, getDoc } from "../lib/firebase";
import { motion } from "framer-motion";
import Editor from "@monaco-editor/react";
import {
  Play,
  CheckCircle,
  XCircle,
  Clock,
  Zap,
  Code,
  Terminal,
  // Settings,
  Save,
  Eye,
  EyeOff,
  ChevronLeft,
  ChevronRight,
  Trophy,
  AlertTriangle,
  Shield,
  Monitor,
  // Maximize,
  Volume2,
  VolumeX,
} from "lucide-react";

type Question = {
  id: string;
  title: string;
  description?: string;
  problemStatement?: string;
  constraints?: string;
  examples?: { id?: number; input: string; output: string; explanation?: string }[];
  type: string;
  assignedTo?: string[];
  sampleInput?: string;
  sampleOutput?: string;
  testCases?: { id?: number; input: string; expectedOutput: string }[];
  timeLimit?: number;
  memoryLimit?: number;
  codeTemplate?: string;
  difficulty?: string;
  startAt?: any;
  endAt?: any;
};

type RunResult = {
  stdout: string;
  stderr: string;
  status: "Accepted" | "Compilation Error" | "Runtime Error" | "Processing" | "Failed" | "OK";
  timeSec?: number;
  memoryKB?: number;
};

const languages = [
  {
    id: "python",
    runtime: "pyodide",
    name: "Python 3.9",
    monaco: "python",
    template: `# Python (in-browser via Pyodide)
# Use input() to read lines; print() to write output.

x = input().strip()
if x:
    try:
        print(int(x) * 2)
    except Exception:
        print(x)
`,
  },
  {
    id: "javascript",
    runtime: "js",
    name: "JavaScript ES6",
    monaco: "javascript",
    template: `// JavaScript (runs in-browser)
// Use input() / readline() to read lines from provided stdin,
// and print() to output.

const s = input().trim();
if (s) {
  const n = Number(s);
  if (!Number.isNaN(n)) print(n * 2);
  else print(s);
}
`,
  },
] as const;

const BADGE_COLORS: Record<string, string> = {
  Accepted: "bg-green-100 text-green-800 border-green-300",
  OK: "bg-green-100 text-green-800 border-green-300",
  "Wrong Answer": "bg-red-100 text-red-800 border-red-300",
  "Time Limit Exceeded": "bg-yellow-100 text-yellow-800 border-yellow-300",
  "Compilation Error": "bg-orange-100 text-orange-800 border-orange-300",
  "Runtime Error": "bg-red-100 text-red-800 border-red-300",
  "Runtime Error (Other)": "bg-red-100 text-red-800 border-red-300",
  "In Queue": "bg-gray-100 text-gray-800 border-gray-300",
  Processing: "bg-gray-100 text-gray-800 border-gray-300",
  Failed: "bg-red-100 text-red-800 border-red-300",
};

declare global {
  interface Window {
    loadPyodide?: (opts: any) => Promise<any>;
    pyodide?: any;
  }
}

const CodingRoundPage = () => {
  const auth = getAuth();
  const uid = auth.currentUser?.uid || null;

  const [questions, setQuestions] = useState<Question[]>([]);
  const [idx, setIdx] = useState(0);
  const [langId, setLangId] = useState<(typeof languages)[number]["id"]>("python");
  const [codeMap, setCodeMap] = useState<Record<string, string>>({});
  const [stdin, setStdin] = useState<string>("");
  const [stdout, setStdout] = useState<string>("");
  const [stderr, setStderr] = useState<string>("");
  const [statusText, setStatusText] = useState<string>("");
  const [timeUsed, setTimeUsed] = useState<string>("");
  // Track memory if needed in future
  // const [memUsed, setMemUsed] = useState<string>("");

  const [loading, setLoading] = useState(false);
  const [autoRun, setAutoRun] = useState(true);
  const [runningNow, setRunningNow] = useState(false);
  // const debounceRef = useRef<number | null>(null);

  // Exam state
  const [acceptedRules, setAcceptedRules] = useState(false);
  const [started, setStarted] = useState(false);
  const [timerSec, setTimerSec] = useState(0);
  const [violations, setViolations] = useState(0);
  const [warningMsg, setWarningMsg] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Python runtime
  const [pyReady, setPyReady] = useState(false);
  const pyLoadingRef = useRef(false);

  // Test results
  const [perTestResults, setPerTestResults] = useState<
    { id?: number; input: string; expected: string; output: string; passed: boolean; stderr?: string }[]
  >([]);
  
  const [submittedQuestions, setSubmittedQuestions] = useState<Set<string>>(new Set());
  const [roundCompleted, setRoundCompleted] = useState(false);

  // UI state
  const [showFullscreen, setShowFullscreen] = useState(false);
  const [showTestCases, setShowTestCases] = useState(false);
  const [remainingSec, setRemainingSec] = useState<number | null>(null);
  const warnShownRef = useRef(false);

  useEffect(() => {
    const checkRoundCompletion = async () => {
      const user = auth.currentUser;
      if (!user) return;

      const roundDoc = await getDoc(doc(db, "roundCompletion", user.uid));
      if (roundDoc.exists() && roundDoc.data().completed) {
        setRoundCompleted(true);
      }
    };

    checkRoundCompletion();
  }, []);

  // Load questions
  useEffect(() => {
    const loadQuestions = async () => {
      if (!uid) return;

      const [snaps, now] = await Promise.all([getDocs(collection(db, "questions")), getServerTime()]);
      const list = snaps.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) }))
        .filter((q: any) => {
          if (q.type !== "code") return false;
          const assigned = Array.isArray(q.assignedTo) ? q.assignedTo : [];
          const inAssignees = assigned.includes(uid);
          const startOk = !q.startAt || (q.startAt?.toDate?.() || new Date(q.startAt)) <= now;
          const endOk = !q.endAt || (q.endAt?.toDate?.() || new Date(q.endAt)) >= now;
          return inAssignees && startOk && endOk;
        }) as Question[];

      setQuestions(list);

      // derive earliest end time across loaded coding questions
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

      const initialCode: Record<string, string> = {};
      for (const q of list) {
        for (const lang of languages) {
          const key = `${q.id}_${lang.id}`;
          initialCode[key] = (q as any).codeTemplate || lang.template;
        }
      }
      setCodeMap(initialCode);

      const submittedSnaps = await getDocs(collection(db, "responses", uid, "round2"));
      if (!submittedSnaps.empty) {
        const submitted = new Set(submittedSnaps.docs.map(doc => doc.id));
        setSubmittedQuestions(submitted);
        if (submitted.size === list.length) {
          setRoundCompleted(true);
        }
      }
    };

    loadQuestions();
  }, [uid]);

  const currentQuestion = questions[idx];
  const codeKey = useMemo(() => (currentQuestion ? `${currentQuestion.id}_${langId}` : ""), [currentQuestion, langId]);
  const code = codeKey ? codeMap[codeKey] ?? "" : "";
  const langMeta = useMemo(() => languages.find((l) => l.id === langId)!, [langId]);

  const setCode = (val: string) =>
    setCodeMap((prev) => ({
      ...prev,
      [codeKey]: val,
    }));

  const clearPanels = () => {
    setStdout("");
    setStderr("");
    setStatusText("");
    setTimeUsed("");
    setPerTestResults([]);
  };

  const renderBadge = (txt: string) => {
    const cls = BADGE_COLORS[txt] || "bg-gray-100 text-gray-800 border-gray-300";
    return (
      <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${cls}`}>
        {txt || "—"}
      </span>
    );
  };

  // Pyodide loader
  useEffect(() => {
    const ensurePyodide = async () => {
      if (pyReady || pyLoadingRef.current) return;
      pyLoadingRef.current = true;

      if (typeof window.loadPyodide !== "function") {
        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/pyodide/v0.26.0/full/pyodide.js";
        script.async = true;
        script.onload = async () => {
          try {
            const py = await window.loadPyodide!({
              indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.0/full/",
            });
            window.pyodide = py;
            setPyReady(true);
          } catch (e) {
            console.error("Pyodide load error:", e);
          }
        };
        script.onerror = () => console.error("Failed to load Pyodide script");
        document.head.appendChild(script);
      }
    };

    if (langId === "python") ensurePyodide();
  }, [langId, pyReady]);

  // Local runners
  const runLocal = async (source: string, languageId: typeof langId, inStdin: string): Promise<RunResult> => {
    const t0 = performance.now();

    if (languageId === "javascript") {
      const lines = inStdin.split("\n");
      let outBuff: string[] = [];
      let errBuff: string[] = [];

      const input = () => (lines.length ? lines.shift()! : "");
      const print = (...args: any[]) => {
        outBuff.push(args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" "));
      };

      try {
        const fn = new Function("input", "print", "console", `"use strict";\n${source}`);
        fn(input, print, { log: print, error: (...args: any[]) => errBuff.push(args.join(" ")) });
        const t1 = performance.now();
        return {
          stdout: outBuff.join("\n"),
          stderr: errBuff.join("\n"),
          status: "OK",
          timeSec: +(t1 - t0).toFixed(3) / 1000,
        };
      } catch (e: any) {
        const t1 = performance.now();
        return {
          stdout: "",
          stderr: `Runtime Error: ${e?.message || e}`,
          status: "Runtime Error",
          timeSec: +(t1 - t0).toFixed(3) / 1000,
        };
      }
    }

    if (languageId === "python") {
      if (!window.pyodide) {
        return { stdout: "", stderr: "Python runtime not ready", status: "Failed", timeSec: 0 };
      }

      try {
        const py = window.pyodide;
        py.globals.set("js_stdin", inStdin);

        const wrapper = `
import sys, io, builtins
_lines = js_stdin.split("\\n")
def _fake_input(prompt=None):
    return _lines.pop(0) if _lines else ""
_stdout = io.StringIO()
_stderr = io.StringIO()
_old_stdout, _old_stderr = sys.stdout, sys.stderr
_old_input = builtins.input
sys.stdout, sys.stderr = _stdout, _stderr
builtins.input = _fake_input
try:
    exec(compile(${JSON.stringify(source)}, "<user_code>", "exec"), {})
finally:
    sys.stdout.flush(); sys.stderr.flush()
    out = _stdout.getvalue()
    err = _stderr.getvalue()
    sys.stdout, sys.stderr = _old_stdout, _old_stderr
    builtins.input = _old_input
out, err
`;
        const result = await py.runPythonAsync(wrapper);
        const [out, err] = result as [string, string];
        const t1 = performance.now();
        return {
          stdout: out || "",
          stderr: err || "",
          status: err ? "Runtime Error" : "OK",
          timeSec: +(t1 - t0).toFixed(3) / 1000,
        };
      } catch (e: any) {
        const t1 = performance.now();
        return {
          stdout: "",
          stderr: `Runtime Error: ${e?.message || e}`,
          status: "Runtime Error",
          timeSec: +(t1 - t0).toFixed(3) / 1000,
        };
      }
    }

    return { stdout: "", stderr: "Unsupported language.", status: "Failed" };
  };

  const handleRun = async () => {
    if (!currentQuestion) {
      setStdout("");
      setStderr("No question loaded.");
      setStatusText("Failed");
      return;
    }
    
    setRunningNow(true);
    clearPanels();

    if (soundEnabled) {
      const audio = new Audio("data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSyKy+zYa1gf");
      audio.play().catch(() => {});
    }

    const collected: { id?: number; input: string; expected: string; output: string; passed: boolean; stderr?: string }[] = [];

    for (const tc of currentQuestion.testCases || []) {
      const r = await runLocal(code, langId, tc.input ?? "");
      const out = (r.stdout || "").trim();
      const expected = (tc?.expectedOutput || "").trim();
      const passed = r.status === "OK" && out === expected;

      collected.push({
        id: tc.id,
        input: tc.input,
        expected,
        output: out,
        passed,
        stderr: r.stderr || undefined,
      });
    }

    if (collected.length > 0) {
      setStdout(collected[0].output || "—");
      setStderr(collected[0].stderr || "");
      setTimeUsed(collected[0].stderr ? "—" : "0.001s");
    }

    setPerTestResults(collected);
    setStatusText(collected.every((r) => r.passed) ? "OK" : "Failed");
    setRunningNow(false);
  };

  // Auto-run when code/stdin/lang changes (and runtime is ready for Python)
  useEffect(() => {
    if (!autoRun || !currentQuestion) return;
    if (langId === "python" && !pyReady) return;
    const id = window.setTimeout(() => {
      handleRun();
    }, 600);
    return () => window.clearTimeout(id);
  }, [autoRun, currentQuestion?.id, code, stdin, langId, pyReady]);

  // Ensure a run happens immediately after Pyodide finishes loading
  useEffect(() => {
    if (!autoRun) return;
    if (!currentQuestion) return;
    if (langId !== "python") return;
    if (!pyReady) return;
    handleRun();
    // Only react to pyReady flip for this immediate run.
  }, [pyReady]);

  const submit = async () => {
    if (!currentQuestion || !uid || submittedQuestions.has(currentQuestion.id)) return;

    setLoading(true);
    let resultText: "Passed" | "Failed" = "Passed";

    const collected: {
      id?: number;
      input: string;
      expected: string;
      output: string;
      passed: boolean;
      stderr?: string;
    }[] = [];
    
    let passedCount = 0;
    const totalCount = currentQuestion.testCases?.length || 0;

    try {
      for (const tc of currentQuestion.testCases || []) {
        const r = await runLocal(code, langId, tc.input ?? "");
        const out = (r.stdout || "").trim();
        const expected = (tc?.expectedOutput || "").trim();
        const passed = r.status === "OK" && out === expected;
        if (passed) passedCount++;

        collected.push({
          id: tc.id,
          input: tc.input,
          expected,
          output: out,
          passed,
          stderr: r.stderr || undefined,
        });

        if (r.status !== "OK" || out !== expected) {
          resultText = "Failed";
        }
      }

      const percentage = totalCount > 0 ? Math.round((passedCount / totalCount) * 100) : 0;

      await setDoc(doc(db, "responses", uid, "round2", currentQuestion.id), {
        code,
        language: langId,
        result: resultText,
        percentage,
        passed: passedCount,
        total: totalCount,
        problemId: currentQuestion.id,
        submittedAt: new Date(),
        examViolations: violations,
        durationSec: timerSec,
      });

      setPerTestResults(collected);
      setSubmittedQuestions((prev) => new Set([...prev, currentQuestion.id]));

      if (soundEnabled) {
        const audio = new Audio(resultText === "Passed" ? "data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj" : "data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj");
        audio.play().catch(() => {});
      }

    } catch (e: any) {
      console.error("Submission failed:", e?.message || e);
    } finally {
      setLoading(false);
    }
  };

  // Global countdown based on end time: 1-minute warning and auto-submit current question if any
  useEffect(() => {
    if (roundCompleted) return;
    if (remainingSec == null) return;
    const id = window.setInterval(() => {
      setRemainingSec((s) => {
        if (s == null) return s;
        const next = s - 1;
        if (next === 60 && !warnShownRef.current) {
          warnShownRef.current = true;
          if (soundEnabled) {
            const audio = new Audio("data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj");
            audio.play().catch(() => {});
          }
        }
        if (next <= 0) {
          window.clearInterval(id);
          // Auto-submit current question if not yet submitted
          if (currentQuestion && !submittedQuestions.has(currentQuestion.id)) {
            submit();
          }
          return 0;
        }
        return next;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [remainingSec, roundCompleted, currentQuestion, submittedQuestions, soundEnabled]);

  // Anti-cheat system
  const requestFullscreen = async () => {
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

  // const exitFullscreen = async () => {
  //   try {
  //     if (document.fullscreenElement) {
  //       await document.exitFullscreen();
  //       setShowFullscreen(false);
  //     }
  //   } catch {
  //     // ignore
  //   }
  // };

  // Timer
  useEffect(() => {
    if (!started) return;
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      setTimerSec((s) => s + 1);
    }, 1000) as unknown as number;

    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [started]);

  // Anti-cheat monitoring
  useEffect(() => {
    if (!started) return;

    const bumpViolation = (reason: string) => {
      setViolations((v) => v + 1);
      setWarningMsg(reason);
      if (soundEnabled) {
        const audio = new Audio("data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj");
        audio.play().catch(() => {});
      }
    };

    const onVisibility = () => {
      if (document.hidden) bumpViolation("Tab switch detected");
    };
    const onBlur = () => bumpViolation("Window lost focus");
    const onFsChange = () => {
      if (!document.fullscreenElement) {
        bumpViolation("Exited full-screen mode");
        setShowFullscreen(false);
      } else {
        setShowFullscreen(true);
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    document.addEventListener("fullscreenchange", onFsChange);

    const preventContext = (e: MouseEvent) => e.preventDefault();
    document.addEventListener("contextmenu", preventContext);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("contextmenu", preventContext);
    };
  }, [started, soundEnabled]);

  const fmtTime = (s: number) => {
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  };

  // Gated screens
  if (!questions.length) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-6 bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-2xl w-full bg-[#eff1f6] dark:bg-slate-800 rounded-2xl shadow-[8px_8px_16px_rgba(0,0,0,0.12),-8px_-8px_16px_#ffffff] dark:shadow-[8px_8px_16px_rgba(0,0,0,0.6),-8px_-8px_16px_rgba(255,255,255,0.05)] p-8 text-center"
        >
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Code className="w-8 h-8 text-white" />
          </div>
          <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">No coding questions assigned</h3>
          <p className="text-gray-600 dark:text-gray-400">Please contact your administrator.</p>
        </motion.div>
      </div>
    );
  }

  if (!acceptedRules) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-2xl w-full bg-[#eff1f6] dark:bg-slate-800 rounded-2xl shadow-[8px_8px_16px_rgba(0,0,0,0.12),-8px_-8px_16px_#ffffff] dark:shadow-[8px_8px_16px_rgba(0,0,0,0.6),-8px_-8px_16px_rgba(255,255,255,0.05)] p-8"
        >
          <div className="text-center mb-8">
           
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Round 2 — Coding Test</h1>
            <p className="text-slate-600 dark:text-slate-400">Secure Programming Assessment</p>
            
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
              <li className="flex items-start">
                <Shield className="w-5 h-5 text-blue-600 mr-3 mt-0.5 flex-shrink-0" />
                <span>The test will run in full-screen mode for security</span>
              </li>
              <li className="flex items-start">
                <Monitor className="w-5 h-5 text-blue-600 mr-3 mt-0.5 flex-shrink-0" />
                <span>Do not switch tabs, minimize, or change windows</span>
              </li>
              <li className="flex items-start">
                <Clock className="w-5 h-5 text-blue-600 mr-3 mt-0.5 flex-shrink-0" />
                <span>Your timer starts when you click "Start Test"</span>
              </li>
              <li className="flex items-start">
                <AlertTriangle className="w-5 h-5 text-orange-500 mr-3 mt-0.5 flex-shrink-0" />
                <span>Violations will be recorded and may affect your evaluation</span>
              </li>
            </ul>
          </div>

          <div className="flex items-center justify-between">
            <label className="flex items-center space-x-3">
              <input
                type="checkbox"
                onChange={(e) => setAcceptedRules(e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                I have read and accept the examination rules
              </span>
            </label>
            <button
              onClick={() => setAcceptedRules(true)}
              disabled={!acceptedRules}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700 transition-all duration-200 transform hover:scale-[1.02] shadow-[6px_6px_12px_rgba(0,0,0,0.15),-6px_-6px_12px_#ffffff] dark:shadow-[6px_6px_12px_rgba(0,0,0,0.4),-6px_-6px_12px_rgba(255,255,255,0.05)] hover:shadow-[8px_8px_16px_rgba(0,0,0,0.2),-8px_-8px_16px_#ffffff]"
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
<div className="min-h-[70vh] flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-xl w-full bg-[#eff1f6] dark:bg-slate-800 rounded-2xl 
        shadow-[8px_8px_16px_rgba(0,0,0,0.12),-8px_-8px_16px_#ffffff] 
        dark:shadow-[8px_8px_16px_rgba(0,0,0,0.6),-8px_-8px_16px_rgba(255,255,255,0.05)] 
        p-8 text-center"
      >
       

        {/* Heading */}
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
          Ready to Begin?
        </h2>
        <p className="text-slate-600 dark:text-slate-400 mb-8">
          When you click Start Test, we will enable full-screen mode and begin the timer.
        </p>

        {/* Buttons */}
        <div className="flex justify-center space-x-4">
          <button
            onClick={async () => {
              await requestFullscreen();
              setStarted(true);
            }}
            className="px-8 py-3 border-2 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-xl 
            hover:bg-slate-50 dark:hover:bg-slate-700 transition-all duration-200 hover:scale-[1.02] 
            shadow-[4px_4px_8px_rgba(0,0,0,0.1),-4px_-4px_8px_#ffffff] 
            dark:shadow-[4px_4px_8px_rgba(0,0,0,0.3),-4px_-4px_8px_rgba(255,255,255,0.05)]"
          >
           
            Start Test
          </button>

          <button
            onClick={() => setAcceptedRules(false)}
            className="px-8 py-3 border-2 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-xl 
            hover:bg-slate-50 dark:hover:bg-slate-700 transition-all duration-200 hover:scale-[1.02] 
            shadow-[4px_4px_8px_rgba(0,0,0,0.1),-4px_-4px_8px_#ffffff] 
            dark:shadow-[4px_4px_8px_rgba(0,0,0,0.3),-4px_-4px_8px_rgba(255,255,255,0.05)]"
          >
              Back
          </button>
        </div>
      </motion.div>
    </div>
  );
};


  if (roundCompleted) {
    return (
      <div className="flex flex-col items-center justify-center min-h-96 text-center">
        <div className="w-20 h-20 bg-gradient-to-br from-green-500 to-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <Trophy className="w-10 h-10 text-white" />
        </div>
        <h2 className="text-3xl font-bold text-green-700 dark:text-green-400 mb-4">
          Congratulations!
        </h2>
        <p className="text-gray-600 dark:text-gray-400 text-lg">
          You have successfully completed the coding round.
        </p>
      </div>
    );
  }

  const ExamHeader = (
    <div className="sticky top-0 z-50 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm">
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
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Violations: <span className="font-semibold text-orange-600">{violations}</span>
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              {soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
            </button>
            
            <div className={`flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-medium ${
              showFullscreen ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
            }`}>
              <Monitor className="w-4 h-4" />
              <span>{showFullscreen ? 'Fullscreen ON' : 'Fullscreen OFF'}</span>
            </div>
          </div>
        </div>
      </div>

      {warningMsg && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-200 dark:border-yellow-800">
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
                    await requestFullscreen();
                  }}
                  className="px-3 py-1 bg-yellow-200 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-200 rounded text-sm hover:bg-yellow-300 dark:hover:bg-yellow-700"
                >
                  Resume Fullscreen
                </button>
                <button
                  onClick={() => setWarningMsg(null)}
                  className="px-3 py-1 bg-white dark:bg-gray-800 border border-yellow-300 dark:border-yellow-700 text-yellow-800 dark:text-yellow-200 rounded text-sm hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {ExamHeader}

      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Question Header */}
        <div className="bg-[#eff1f6] dark:bg-slate-800 rounded-2xl shadow-[8px_8px_16px_rgba(0,0,0,0.12),-8px_-8px_16px_#ffffff] dark:shadow-[8px_8px_16px_rgba(0,0,0,0.6),-8px_-8px_16px_rgba(255,255,255,0.05)] p-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center space-x-3 mb-4">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {currentQuestion.title}
                </h2>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                  currentQuestion.difficulty === 'Easy' ? 'bg-green-100 text-green-800' :
                  currentQuestion.difficulty === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  {currentQuestion.difficulty || 'Medium'}
                </span>
                {submittedQuestions.has(currentQuestion.id) && (
                  <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 flex items-center">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Submitted
                  </span>
                )}
              </div>
              
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                {currentQuestion.description || currentQuestion.problemStatement}
              </p>

              <div className="flex items-center space-x-4 text-sm text-gray-500 dark:text-gray-400">
                {currentQuestion.timeLimit && (
                  <span className="flex items-center">
                    <Clock className="w-4 h-4 mr-1" />
                    {currentQuestion.timeLimit}s
                  </span>
                )}
                {currentQuestion.memoryLimit && (
                  <span className="flex items-center">
                    <Zap className="w-4 h-4 mr-1" />
                    {currentQuestion.memoryLimit}MB
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => setIdx(Math.max(0, idx - 1))}
                disabled={idx === 0}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="text-sm text-slate-600 dark:text-slate-400 px-3 py-1 bg-slate-100 dark:bg-slate-700 rounded">
                {idx + 1} / {questions.length}
              </span>
              <button
                onClick={() => setIdx(Math.min(questions.length - 1, idx + 1))}
                disabled={idx === questions.length - 1}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Problem Details */}
          <div className="space-y-6">
            <div className="bg-[#eff1f6] dark:bg-slate-800 rounded-2xl shadow-[8px_8px_16px_rgba(0,0,0,0.12),-8px_-8px_16px_#ffffff] dark:shadow-[8px_8px_16px_rgba(0,0,0,0.6),-8px_-8px_16px_rgba(255,255,255,0.05)] p-6">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Problem Statement</h3>
              <div className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                {currentQuestion.problemStatement || currentQuestion.description || "—"}
              </div>
            </div>

            {currentQuestion.constraints && (
              <div className="bg-[#eff1f6] dark:bg-slate-800 rounded-2xl shadow-[8px_8px_16px_rgba(0,0,0,0.12),-8px_-8px_16px_#ffffff] dark:shadow-[8px_8px_16px_rgba(0,0,0,0.6),-8px_-8px_16px_rgba(255,255,255,0.05)] p-6">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Constraints</h3>
                <div className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                  {currentQuestion.constraints}
                </div>
              </div>
            )}

            {currentQuestion.examples && currentQuestion.examples.length > 0 && (
              <div className="bg-[#eff1f6] dark:bg-slate-800 rounded-2xl shadow-[8px_8px_16px_rgba(0,0,0,0.12),-8px_-8px_16px_#ffffff] dark:shadow-[8px_8px_16px_rgba(0,0,0,0.6),-8px_-8px_16px_rgba(255,255,255,0.05)] p-6">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Examples</h3>
                <div className="space-y-4">
                  {currentQuestion.examples.map((ex, i) => (
                    <div key={i} className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4">
                      <div className="grid grid-cols-1 gap-3">
                        <div>
                          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Input:</div>
                          <pre className="text-sm text-slate-900 dark:text-white">{ex.input}</pre>
                        </div>
                        <div>
                          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Output:</div>
                          <pre className="text-sm text-slate-900 dark:text-white">{ex.output}</pre>
                        </div>
                        {ex.explanation && (
                          <div>
                            <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Explanation:</div>
                            <div className="text-sm text-slate-700 dark:text-slate-300">{ex.explanation}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Code Editor */}
          <div className="bg-[#eff1f6] dark:bg-slate-800 rounded-2xl shadow-[8px_8px_16px_rgba(0,0,0,0.12),-8px_-8px_16px_#ffffff] dark:shadow-[8px_8px_16px_rgba(0,0,0,0.6),-8px_-8px_16px_rgba(255,255,255,0.05)] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center space-x-4">
                <select 
                  value={langId} 
                  onChange={(e) => setLangId(e.target.value as any)}
                  className="px-3 py-1 border border-slate-300 dark:border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-700 dark:text-white"
                >
                  {languages.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
                
                {langId === "python" && (
                  <span className={`text-xs px-2 py-1 rounded ${
                    pyReady ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {pyReady ? "Python Ready" : "Loading Python..."}
                  </span>
                )}
              </div>

              <div className="flex items-center space-x-2">
                <label className="flex items-center space-x-2 text-sm">
                  <input 
                    type="checkbox" 
                    checked={autoRun} 
                    onChange={(e) => setAutoRun(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-slate-600 dark:text-slate-400">Auto-run</span>
                </label>
              </div>
            </div>

            <Editor
              height="400px"
              defaultLanguage={langMeta.monaco}
              language={langMeta.monaco}
              value={code}
              onChange={(v) => v !== undefined && setCode(v)}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                automaticLayout: true,
                scrollBeyondLastLine: false,
                tabSize: 2,
                contextmenu: false,
                dragAndDrop: false,
              }}
              theme="vs-dark"
            />

            <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-[#f3f5fa] dark:bg-slate-700">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Custom Input
              </label>
              <textarea
                value={stdin}
                onChange={(e) => setStdin(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-800 dark:text-white"
                placeholder="Enter custom input (one value per line)"
              />
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <button
                  onClick={handleRun}
                  disabled={runningNow || (langId === "python" && !pyReady)}
                  className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {runningNow ? (
                    <>
                      <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                      Running...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 mr-2" />
                      Run Code
                    </>
                  )}
                </button>

                <button
                  onClick={submit}
                  disabled={loading || submittedQuestions.has(currentQuestion.id)}
                  className={`inline-flex items-center px-4 py-2 rounded-lg transition-colors ${
                    submittedQuestions.has(currentQuestion.id)
                      ? 'bg-gray-400 text-gray-700 cursor-not-allowed'
                      : 'bg-green-600 text-white hover:bg-green-700'
                  }`}
                >
                  {loading ? (
                    <>
                      <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                      Submitting...
                    </>
                  ) : submittedQuestions.has(currentQuestion.id) ? (
                    <>
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Submitted
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Submit
                    </>
                  )}
                </button>
              </div>

              <button
                onClick={() => setShowTestCases(!showTestCases)}
                className="inline-flex items-center px-3 py-2 text-sm text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                {showTestCases ? <EyeOff className="w-4 h-4 mr-1" /> : <Eye className="w-4 h-4 mr-1" />}
                Test Cases
              </button>
            </div>
          </div>

          {/* Output & Results */}
          <div className="space-y-6">
            <div className="bg-[#eff1f6] dark:bg-slate-800 rounded-2xl shadow-[8px_8px_16px_rgba(0,0,0,0.12),-8px_-8px_16px_#ffffff] dark:shadow-[8px_8px_16px_rgba(0,0,0,0.6),-8px_-8px_16px_rgba(255,255,255,0.05)] overflow-hidden">
              <div className="p-4 border-b border-transparent flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Output</h3>
                  {renderBadge(statusText || (runningNow ? "Processing" : "Ready"))}
                </div>
                {timeUsed && (
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {timeUsed}
                  </span>
                )}
              </div>

              <div className="p-4 space-y-4">
                <div>
                  <div className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Stdout:</div>
                  <pre className="bg-gray-900 text-green-400 rounded-lg p-3 text-sm h-24 overflow-auto font-mono">
                    {stdout || "—"}
                  </pre>
                </div>

                <div>
                  <div className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Stderr:</div>
                  <pre className="bg-gray-900 text-red-400 rounded-lg p-3 text-sm h-20 overflow-auto font-mono">
                    {stderr || "—"}
                  </pre>
                </div>
              </div>
            </div>

            {perTestResults.length > 0 && (
              <div className="bg-[#eff1f6] dark:bg-slate-800 rounded-2xl shadow-[8px_8px_16px_rgba(0,0,0,0.12),-8px_-8px_16px_#ffffff] dark:shadow-[8px_8px_16px_rgba(0,0,0,0.6),-8px_-8px_16px_rgba(255,255,255,0.05)]">
                <div className="p-4 border-b border-slate-200 dark:border-slate-700">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center">
                    <Terminal className="w-5 h-5 mr-2 text-blue-600" />
                    Test Results
                  </h3>
                </div>
                
                <div className="p-4 space-y-3 max-h-80 overflow-y-auto">
                  {perTestResults.map((result, i) => (
                    <div key={i} className={`p-3 rounded-lg border-2 ${
                      result.passed 
                        ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' 
                        : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                    }`}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          Test Case {result.id || i + 1}
                        </span>
                        {result.passed ? (
                          <CheckCircle className="w-4 h-4 text-green-600" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-600" />
                        )}
                      </div>
                      
                      <div className="text-xs space-y-1">
                        <div>
                          <span className="text-gray-500 dark:text-gray-400">Input: </span>
                          <span className="font-mono">{result.input}</span>
                        </div>
                        <div>
                          <span className="text-gray-500 dark:text-gray-400">Expected: </span>
                          <span className="font-mono">{result.expected}</span>
                        </div>
                        <div>
                          <span className="text-gray-500 dark:text-gray-400">Output: </span>
                          <span className="font-mono">{result.output}</span>
                        </div>
                        {result.stderr && (
                          <div>
                            <span className="text-red-500">Error: </span>
                            <span className="font-mono text-red-600">{result.stderr}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {showTestCases && currentQuestion.testCases && (
              <div className="bg-[#eff1f6] dark:bg-slate-800 rounded-2xl shadow-[8px_8px_16px_rgba(0,0,0,0.12),-8px_-8px_16px_#ffffff] dark:shadow-[8px_8px_16px_rgba(0,0,0,0.6),-8px_-8px_16px_rgba(255,255,255,0.05)]">
                <div className="p-4 border-b border-transparent">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Test Cases</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Hidden from candidates normally</p>
                </div>
                
                <div className="p-4 space-y-3 max-h-64 overflow-y-auto">
                  {currentQuestion.testCases.map((tc, i) => (
                    <div key={i} className="bg-[#f3f5fa] dark:bg-slate-700 rounded-lg p-3">
                      <div className="text-xs space-y-1">
                        <div>
                          <span className="text-slate-500 dark:text-slate-400">Input: </span>
                          <span className="font-mono">{tc.input}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 dark:text-slate-400">Expected: </span>
                          <span className="font-mono">{tc.expectedOutput}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CodingRoundPage;
