// import React, { useEffect, useState, useRef } from "react";
// import { collection, getDocs, addDoc, query, where } from "../lib/firebase";
// import { db, auth } from "../lib/firebase";
// import { onAuthStateChanged } from "../lib/firebase";

// interface CommunicationTest {
//   title: string;
//   description: string;
//   instructions: string;
//   questions: string[];
// }

// interface ResponseData {
//   question: string;
//   responseText: string;
//   score: number;
//   duration: number;
// }

// interface PopupMessage {
//   id: number;
//   message: string;
//   type: "error" | "warning" | "success" | "info";
// }

// const TakeCommunicationRound: React.FC = () => {
//   const [test, setTest] = useState<CommunicationTest | null>(null);
//   const [userId, setUserId] = useState<string | null>(null);
//   const [currentQ, setCurrentQ] = useState(0);
//   const [isRecording, setIsRecording] = useState(false);
//   const [recognition, setRecognition] = useState<any>(null);
//   const [attempted, setAttempted] = useState<string[]>([]);
//   const [responses, setResponses] = useState<ResponseData[]>([]);
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState<string | null>(null);
//   const [transcript, setTranscript] = useState("");
//   const [timeLeft, setTimeLeft] = useState<number | null>(null);
//   const [duration, setDuration] = useState<number>(0);
//   const [micPermission, setMicPermission] = useState<boolean | null>(null);
//   const [popupMessages, setPopupMessages] = useState<PopupMessage[]>([]);

//   const timerRef = useRef<NodeJS.Timeout | null>(null);
//   const durationRef = useRef<NodeJS.Timeout | null>(null);
//   const recognitionRef = useRef<any>(null);
//   const popupIdRef = useRef(0);

//   // Function to show popup messages
//   const showPopup = (message: string, type: PopupMessage["type"] = "info") => {
//     const id = popupIdRef.current++;
//     const newPopup: PopupMessage = { id, message, type };
//     setPopupMessages(prev => [...prev, newPopup]);
    
//     // Auto remove after 3 seconds
//     setTimeout(() => {
//       setPopupMessages(prev => prev.filter(popup => popup.id !== id));
//     }, 3000);
//   };

//   useEffect(() => {
//     const unsub = onAuthStateChanged(auth, (user) => {
//       if (user) setUserId(user.uid);
//       else setUserId(null);
//     });
//     return () => unsub();
//   }, []);

//   useEffect(() => {
//     const fetchTest = async () => {
//       setLoading(true);
//       try {
//         const qSnap = await getDocs(collection(db, "COMMUNICATIONTEST"));
//         if (!qSnap.empty) {
//           const docData = qSnap.docs[0].data() as CommunicationTest;
//           setTest(docData);
//         } else {
//           setError("No communication tests found in Firestore.");
//         }
//       } catch (err: any) {
//         console.error(err);
//         setError("Failed to fetch communication test.");
//       } finally {
//         setLoading(false);
//       }
//     };
//     fetchTest();
//   }, []);

//   useEffect(() => {
//     if (!userId) return;
//     const fetchAttempted = async () => {
//       const q = query(
//         collection(db, "communicationResponse"),
//         where("userId", "==", userId)
//       );
//       const snap = await getDocs(q);
//       const attemptedQuestions = snap.docs.map((doc) => doc.data().question);
//       setAttempted(attemptedQuestions);

//       const resData = snap.docs.map(
//         (doc) =>
//           ({
//             question: doc.data().question,
//             responseText: doc.data().responseText,
//             score: doc.data().score,
//             duration: doc.data().duration,
//           } as ResponseData)
//       );
//       setResponses(resData);
//     };
//     fetchAttempted();
//   }, [userId]);

//   // 🔧 REQUEST MICROPHONE PERMISSION FIRST
//   useEffect(() => {
//     const requestMicPermission = async () => {
//       try {
//         const stream = await navigator.mediaDevices.getUserMedia({
//           audio: true,
//         });
//         stream.getTracks().forEach((track) => track.stop()); // Stop immediately, just checking permission
//         setMicPermission(true);
//         showPopup("Microphone access granted", "success");
//       } catch (err) {
//         console.error("Microphone permission denied:", err);
//         setMicPermission(false);
//         showPopup(
//           "Microphone permission is required for this test. Please allow access and refresh the page.",
//           "error"
//         );
//       }
//     };
//     requestMicPermission();
//   }, []);

//   // 🔧 IMPROVED SPEECH RECOGNITION SETUP
//   useEffect(() => {
//     if (
//       !("webkitSpeechRecognition" in window) &&
//       !("SpeechRecognition" in window)
//     ) {
//       setError(
//         "Speech recognition not supported in this browser. Please use Chrome."
//       );
//       showPopup("Speech recognition not supported. Please use Chrome.", "error");
//       return;
//     }

//     const SpeechRecognition =
//       (window as any).SpeechRecognition ||
//       (window as any).webkitSpeechRecognition;

//     const recog = new SpeechRecognition();
//     recog.lang = "en-US";
//     recog.continuous = true;
//     recog.interimResults = true;
//     recog.maxAlternatives = 1;

//     recog.onstart = () => {
//       console.log("Speech recognition started");
//       showPopup("Speech recognition started", "success");
//     };

//     recog.onresult = (event: any) => {
//       let fullTranscript = "";
//       for (let i = 0; i < event.results.length; i++) {
//         fullTranscript += event.results[i][0].transcript + " ";
//       }
//       setTranscript(fullTranscript.trim());
//       console.log("Transcript:", fullTranscript.trim());
//     };

//     recog.onerror = (event: any) => {
//       console.error("Speech recognition error:", event.error);
//       if (event.error === "not-allowed") {
//         showPopup(
//           "Microphone access was denied. Please allow microphone access in your browser settings.",
//           "error"
//         );
//         setMicPermission(false);
//       } else if (event.error === "no-speech") {
//         showPopup("No speech detected, continuing...", "warning");
//         console.log("No speech detected, continuing...");
//       } else {
//         showPopup(`Speech recognition error: ${event.error}`, "error");
//       }
//       if (isRecording) {
//         stopRecording();
//       }
//     };

//     // 🔧 HANDLE UNEXPECTED STOPS
//     recog.onend = () => {
//       console.log("Speech recognition ended");
//       // If still supposed to be recording, restart
//       if (isRecording && recognitionRef.current) {
//         try {
//           recognitionRef.current.start();
//           console.log("Restarting recognition...");
//           showPopup("Restarting speech recognition...", "info");
//         } catch (err) {
//           console.error("Failed to restart recognition:", err);
//           showPopup("Failed to restart recognition", "error");
//         }
//       }
//     };

//     setRecognition(recog);
//     recognitionRef.current = recog;

//     return () => {
//       if (recog) {
//         try {
//           recog.stop();
//         } catch (err) {
//           console.error("Cleanup error:", err);
//         }
//       }
//     };
//   }, [isRecording]);

//   const calculateScore = (question: string, response: string) => {
//     const qWords = question.toLowerCase().split(/\s+/);
//     const rWords = response.toLowerCase().split(/\s+/);
//     let matches = 0;
//     qWords.forEach((word) => {
//       if (rWords.includes(word)) matches++;
//     });
//     return Math.round((matches / qWords.length) * 100);
//   };

//   const startRecording = async () => {
//     if (!recognition) {
//       showPopup("Speech recognition is not initialized. Please refresh the page.", "error");
//       return;
//     }

//     if (micPermission === false) {
//       showPopup(
//         "Microphone permission is required. Please allow access in your browser settings.",
//         "error"
//       );
//       return;
//     }

//     setTranscript("");
//     setIsRecording(true);
//     setTimeLeft(15);
//     setDuration(0);

//     // 🔧 CLEAN START
//     try {
//       recognition.stop(); // Stop any previous session
//     } catch (err) {
//       console.log("No active recognition to stop");
//     }

//     // Small delay before starting
//     setTimeout(() => {
//       try {
//         recognition.start();
//         console.log("Recording started successfully");
//         showPopup("Recording started! Speak now...", "success");
//       } catch (err) {
//         console.error("Failed to start recording:", err);
//         showPopup("Failed to start recording. Please try again.", "error");
//         setIsRecording(false);
//         return;
//       }
//     }, 100);

//     timerRef.current = setInterval(() => {
//       setTimeLeft((prev) => {
//         if (prev && prev > 1) {
//           return prev - 1;
//         } else {
//           stopRecording();
//           return null;
//         }
//       });
//     }, 1000);

//     durationRef.current = setInterval(() => {
//       setDuration((prev) => prev + 1);
//     }, 1000);
//   };

//   const stopRecording = async () => {
//     if (!recognition || !isRecording) return;

//     setIsRecording(false);

//     try {
//       recognition.stop();
//       console.log("Recording stopped");
//       showPopup("Recording stopped", "info");
//     } catch (err) {
//       console.error("Error stopping recognition:", err);
//     }

//     if (timerRef.current) {
//       clearInterval(timerRef.current);
//       timerRef.current = null;
//     }

//     if (durationRef.current) {
//       clearInterval(durationRef.current);
//       durationRef.current = null;
//     }

//     const totalDuration = duration;
//     const finalTranscript = transcript.trim();

//     setDuration(0);
//     setTimeLeft(null);

//     if (!test || !userId) return;

//     const question = test.questions[currentQ];

//     if (!finalTranscript) {
//       showPopup(
//         "No response detected. Please speak clearly into your microphone and try again.",
//         "warning"
//       );
//       return;
//     }

//     const score = calculateScore(question, finalTranscript);

//     try {
//       await addDoc(collection(db, "communicationResponse"), {
//         userId,
//         testTitle: test.title,
//         question,
//         responseText: finalTranscript,
//         score,
//         duration: totalDuration,
//         createdAt: new Date(),
//       });

//       setAttempted((prev) => [...prev, question]);
//       setResponses((prev) => [
//         ...prev,
//         {
//           question,
//           responseText: finalTranscript,
//           score,
//           duration: totalDuration,
//         },
//       ]);

//       console.log(
//         `✅ Response saved! Score: ${score}% | Duration: ${totalDuration}s`
//       );
//       // showPopup(`Response saved! Score: ${score}%`, "success");
//     } catch (e) {
//       console.error(e);
//       showPopup("Failed to save response.", "error");
//     }
//   };

//   const nextQuestion = () => {
//     if (currentQ < (test?.questions.length || 0) - 1) {
//       setCurrentQ((prev) => prev + 1);
//       setTranscript("");
//       setDuration(0);
//       setTimeLeft(null);
//       if (isRecording) stopRecording();
//     } else {
//       console.log("🎉 You have completed all questions!");
//       showPopup("🎉 You have completed all questions!", "success");
//     }
//   };

//   if (loading) {
//     return (
//       <div className="h-screen flex items-center justify-center bg-gray-50">
//         <p className="text-gray-600 text-lg font-medium">
//           Loading Communication Test...
//         </p>
//       </div>
//     );
//   }

//   if (error || !test) {
//     return (
//       <div className="h-screen flex items-center justify-center bg-gray-50">
//         <p className="text-red-600 text-lg font-medium">
//           {error || "Test not found."}
//         </p>
//       </div>
//     );
//   }

//   const currentQuestion = test.questions[currentQ];
//   const isAttempted = attempted.includes(currentQuestion);
//   const savedResponse = responses.find((r) => r.question === currentQuestion);

//   return (
//     <div className="min-h-screen bg-gray-100 p-6 flex flex-col gap-6">
//       {/* Popup Messages Container */}
//       <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
//         {popupMessages.map((popup) => (
//           <div
//             key={popup.id}
//             className={`p-4 rounded-lg shadow-lg border-l-4 ${
//               popup.type === "error"
//                 ? "bg-red-50 border-red-500 text-red-700"
//                 : popup.type === "warning"
//                 ? "bg-yellow-50 border-yellow-500 text-yellow-700"
//                 : popup.type === "success"
//                 ? "bg-green-50 border-green-500 text-green-700"
//                 : "bg-blue-50 border-blue-500 text-blue-700"
//             } transition-all duration-300 ease-in-out`}
//           >
//             <div className="flex items-start">
//               <span className="mr-2">
//                 {popup.type === "error" && "❌"}
//                 {popup.type === "warning" && "⚠️"}
//                 {popup.type === "success" && "✅"}
//                 {popup.type === "info" && "ℹ️"}
//               </span>
//               <p className="text-sm font-medium">{popup.message}</p>
//             </div>
//           </div>
//         ))}
//       </div>

//       <div className="text-center">
//         <h1 className="text-3xl font-bold">{test.title}</h1>
//         <p className="text-gray-600">{test.description}</p>
//         <p className="italic text-gray-500">{test.instructions}</p>

//         {/* 🔧 MIC STATUS INDICATOR */}
//         {micPermission !== null && (
//           <div
//             className={`mt-2 text-sm ${
//               micPermission ? "text-green-600" : "text-red-600"
//             }`}
//           >
//             {micPermission
//               ? "🎤 Microphone access granted"
//               : "❌ Microphone access denied"}
//           </div>
//         )}
//       </div>

//       <div className="flex justify-between bg-white shadow-lg rounded-xl p-6">
//         <div className="w-1/2 pr-6">
//           <h2 className="text-xl font-semibold mb-4">
//             Question {currentQ + 1} of {test.questions.length}
//           </h2>
//           <p className="text-lg">{currentQuestion}</p>

//           {isAttempted && (
//             <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
//               <p className="text-green-700 font-medium">
//                 ✅ You have already attempted this question.
//               </p>
//               {savedResponse && (
//                 <div className="mt-2 text-gray-800">
//                   <p className="font-semibold">Your Response:</p>
//                   <p className="italic">{savedResponse.responseText}</p>
//                   <p className="text-sm text-gray-500">
//                     Score: {savedResponse.score}% | Duration:{" "}
//                     {savedResponse.duration}s
//                   </p>
//                 </div>
//               )}
//             </div>
//           )}

//           🔧 LIVE TRANSCRIPT PREVIEW
//           {isRecording && transcript && (
//             <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
//               <p className="text-blue-700 font-medium text-sm">
//                 Live Transcript:
//               </p>
//               <p className="text-gray-800 text-sm italic">{transcript}</p>
//             </div>
//           )}
//         </div>

//         <div className="w-1/2 pl-6 flex flex-col items-center justify-center gap-4">
//           {!isAttempted ? (
//             <>
//               {!isRecording ? (
//                 <button
//                   onClick={startRecording}
//                   disabled={micPermission === false}
//                   className={`px-6 py-3 rounded-lg font-bold ${
//                     micPermission === false
//                       ? "bg-gray-300 text-gray-600 cursor-not-allowed"
//                       : "bg-blue-600 hover:bg-blue-700 text-white"
//                   }`}
//                 >
//                   🎤 Start Recording
//                 </button>
//               ) : (
//                 <>
//                   <button
//                     onClick={stopRecording}
//                     className="px-6 py-3 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold"
//                   >
//                     ⏹ Stop Recording
//                   </button>
//                   <div className="text-lg font-semibold text-gray-700 flex flex-col items-center">
//                     <span>⏱ Time Left: {timeLeft ?? 0}s</span>
//                     <span className="text-sm text-gray-500">
//                       Duration: {duration}s
//                     </span>
//                   </div>
//                 </>
//               )}
//             </>
//           ) : (
//             <button
//               disabled
//               className="px-6 py-3 rounded-lg bg-gray-300 text-gray-700 font-bold cursor-not-allowed"
//             >
//               Attempted
//             </button>
//           )}

//           <button
//             onClick={nextQuestion}
//             className="px-6 py-3 rounded-lg bg-green-600 hover:bg-green-700 text-white font-bold"
//           >
//             Next Question →
//           </button>
//         </div>
//       </div>
//     </div>
//   );
// };

// export default TakeCommunicationRound;

import React, { useEffect, useState, useRef } from "react";
import { collection, getDocs, addDoc, query, where } from "../lib/firebase";
import { db, auth } from "../lib/firebase";
import { onAuthStateChanged } from "../lib/firebase";
import { useNavigate } from "react-router-dom";

interface CommunicationTest {
  title: string;
  description: string;
  instructions: string;
  questions: string[];
}

interface ResponseData {
  question: string;
  responseText: string;
  score: number;
  duration: number;
}

interface PopupMessage {
  id: number;
  message: string;
  type: "error" | "warning" | "success" | "info";
}

const TakeCommunicationRound: React.FC = () => {
  const navigate = useNavigate();
  const [test, setTest] = useState<CommunicationTest | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [currentQ, setCurrentQ] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recognition, setRecognition] = useState<any>(null);
  const [attempted, setAttempted] = useState<string[]>([]);
  const [responses, setResponses] = useState<ResponseData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const [micPermission, setMicPermission] = useState<boolean | null>(null);
  const [popupMessages, setPopupMessages] = useState<PopupMessage[]>([]);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const durationRef = useRef<NodeJS.Timeout | null>(null);
  const recognitionRef = useRef<any>(null);
  const popupIdRef = useRef(0);

  // Function to show popup messages
  const showPopup = (message: string, type: PopupMessage["type"] = "info") => {
    const id = popupIdRef.current++;
    const newPopup: PopupMessage = { id, message, type };
    setPopupMessages(prev => [...prev, newPopup]);
    
    // Auto remove after 3 seconds
    setTimeout(() => {
      setPopupMessages(prev => prev.filter(popup => popup.id !== id));
    }, 3000);
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) setUserId(user.uid);
      else setUserId(null);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const fetchTest = async () => {
      setLoading(true);
      try {
        const qSnap = await getDocs(collection(db, "COMMUNICATIONTEST"));
        if (!qSnap.empty) {
          const docData = qSnap.docs[0].data() as CommunicationTest;
          setTest(docData);
        } else {
          setError("No communication tests found in Firestore.");
        }
      } catch (err: any) {
        console.error(err);
        setError("Failed to fetch communication test.");
      } finally {
        setLoading(false);
      }
    };
    fetchTest();
  }, []);

  useEffect(() => {
    if (!userId) return;
    const fetchAttempted = async () => {
      const q = query(
        collection(db, "communicationResponse"),
        where("userId", "==", userId)
      );
      const snap = await getDocs(q);
      const attemptedQuestions = snap.docs.map((doc) => doc.data().question);
      setAttempted(attemptedQuestions);

      const resData = snap.docs.map(
        (doc) =>
          ({
            question: doc.data().question,
            responseText: doc.data().responseText,
            score: doc.data().score,
            duration: doc.data().duration,
          } as ResponseData)
      );
      setResponses(resData);
    };
    fetchAttempted();
  }, [userId]);

  // 🔧 REQUEST MICROPHONE PERMISSION FIRST
  useEffect(() => {
    const requestMicPermission = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        stream.getTracks().forEach((track) => track.stop()); // Stop immediately, just checking permission
        setMicPermission(true);
        showPopup("Microphone access granted", "success");
      } catch (err) {
        console.error("Microphone permission denied:", err);
        setMicPermission(false);
        showPopup(
          "Microphone permission is required for this test. Please allow access and refresh the page.",
          "error"
        );
      }
    };
    requestMicPermission();
  }, []);

  // 🔧 IMPROVED SPEECH RECOGNITION SETUP
  useEffect(() => {
    if (
      !("webkitSpeechRecognition" in window) &&
      !("SpeechRecognition" in window)
    ) {
      setError(
        "Speech recognition not supported in this browser. Please use Chrome."
      );
      showPopup("Speech recognition not supported. Please use Chrome.", "error");
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    const recog = new SpeechRecognition();
    recog.lang = "en-US";
    recog.continuous = true;
    recog.interimResults = true;
    recog.maxAlternatives = 1;

    recog.onstart = () => {
      console.log("Speech recognition started");
      showPopup("Speech recognition started", "success");
    };

    recog.onresult = (event: any) => {
      let fullTranscript = "";
      for (let i = 0; i < event.results.length; i++) {
        fullTranscript += event.results[i][0].transcript + " ";
      }
      setTranscript(fullTranscript.trim());
      console.log("Transcript:", fullTranscript.trim());
    };

    recog.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      if (event.error === "not-allowed") {
        showPopup(
          "Microphone access was denied. Please allow microphone access in your browser settings.",
          "error"
        );
        setMicPermission(false);
      } else if (event.error === "no-speech") {
        showPopup("No speech detected, continuing...", "warning");
        console.log("No speech detected, continuing...");
      } else {
        showPopup(`Speech recognition error: ${event.error}`, "error");
      }
      if (isRecording) {
        stopRecording();
      }
    };

    // 🔧 HANDLE UNEXPECTED STOPS
    recog.onend = () => {
      console.log("Speech recognition ended");
      // If still supposed to be recording, restart
      if (isRecording && recognitionRef.current) {
        try {
          recognitionRef.current.start();
          console.log("Restarting recognition...");
          showPopup("Restarting speech recognition...", "info");
        } catch (err) {
          console.error("Failed to restart recognition:", err);
          showPopup("Failed to restart recognition", "error");
        }
      }
    };

    setRecognition(recog);
    recognitionRef.current = recog;

    return () => {
      if (recog) {
        try {
          recog.stop();
        } catch (err) {
          console.error("Cleanup error:", err);
        }
      }
    };
  }, [isRecording]);

  const calculateScore = (question: string, response: string) => {
    const qWords = question.toLowerCase().split(/\s+/);
    const rWords = response.toLowerCase().split(/\s+/);
    let matches = 0;
    qWords.forEach((word) => {
      if (rWords.includes(word)) matches++;
    });
    return Math.round((matches / qWords.length) * 100);
  };

  const startRecording = async () => {
    if (!recognition) {
      showPopup("Speech recognition is not initialized. Please refresh the page.", "error");
      return;
    }

    if (micPermission === false) {
      showPopup(
        "Microphone permission is required. Please allow access in your browser settings.",
        "error"
      );
      return;
    }

    setTranscript("");
    setIsRecording(true);
    setTimeLeft(15);
    setDuration(0);

    // 🔧 CLEAN START
    try {
      recognition.stop(); // Stop any previous session
    } catch (err) {
      console.log("No active recognition to stop");
    }

    // Small delay before starting
    setTimeout(() => {
      try {
        recognition.start();
        console.log("Recording started successfully");
        showPopup("Recording started! Speak now...", "success");
      } catch (err) {
        console.error("Failed to start recording:", err);
        showPopup("Failed to start recording. Please try again.", "error");
        setIsRecording(false);
        return;
      }
    }, 100);

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev && prev > 1) {
          return prev - 1;
        } else {
          stopRecording();
          return null;
        }
      });
    }, 1000);

    durationRef.current = setInterval(() => {
      setDuration((prev) => prev + 1);
    }, 1000);
  };

  const stopRecording = async () => {
    if (!recognition || !isRecording) return;

    setIsRecording(false);

    try {
      recognition.stop();
      console.log("Recording stopped");
      showPopup("Recording stopped", "info");
    } catch (err) {
      console.error("Error stopping recognition:", err);
    }

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (durationRef.current) {
      clearInterval(durationRef.current);
      durationRef.current = null;
    }

    const totalDuration = duration;
    const finalTranscript = transcript.trim();

    setDuration(0);
    setTimeLeft(null);

    if (!test || !userId) return;

    const question = test.questions[currentQ];

    if (!finalTranscript) {
      showPopup(
        "No response detected. Please speak clearly into your microphone and try again.",
        "warning"
      );
      return;
    }

    const score = calculateScore(question, finalTranscript);

    try {
      await addDoc(collection(db, "communicationResponse"), {
        userId,
        testTitle: test.title,
        question,
        responseText: finalTranscript,
        score,
        duration: totalDuration,
        createdAt: new Date(),
      });

      setAttempted((prev) => [...prev, question]);
      setResponses((prev) => [
        ...prev,
        {
          question,
          responseText: finalTranscript,
          score,
          duration: totalDuration,
        },
      ]);

      console.log(
        `✅ Response saved! Score: ${score}% | Duration: ${totalDuration}s`
      );
    } catch (e) {
      console.error(e);
      showPopup("Failed to save response.", "error");
    }
  };

  const nextQuestion = () => {
    if (currentQ < (test?.questions.length || 0) - 1) {
      setCurrentQ((prev) => prev + 1);
      setTranscript("");
      setDuration(0);
      setTimeLeft(null);
      if (isRecording) stopRecording();
    }
  };

  const handleSubmitTest = () => {
    showPopup("Test submitted successfully!", "success");
    setTimeout(() => {
      navigate("/dashboard");
    }, 1500);
  };

  const isLastQuestion = currentQ === (test?.questions.length || 0) - 1;
  const allQuestionsAttempted = attempted.length === test?.questions.length;

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-600 text-lg font-medium">
          Loading Communication Test...
        </p>
      </div>
    );
  }

  if (error || !test) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <p className="text-red-600 text-lg font-medium">
          {error || "Test not found."}
        </p>
      </div>
    );
  }

  const currentQuestion = test.questions[currentQ];
  const isAttempted = attempted.includes(currentQuestion);

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-slate-900 text-gray-900 dark:text-gray-100 p-6 flex flex-col gap-6 transition-colors duration-500">
      {/* Popup Messages Container */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
        {popupMessages.map((popup) => (
          <div
            key={popup.id}
            className={`p-4 rounded-lg shadow-lg border-l-4 ${
              popup.type === "error"
                ? "bg-red-100 dark:bg-red-900/30 border-red-600 text-red-800 dark:text-red-300"
                : popup.type === "warning"
                ? "bg-yellow-100 dark:bg-yellow-900/30 border-yellow-600 text-yellow-800 dark:text-yellow-300"
                : popup.type === "success"
                ? "bg-green-100 dark:bg-green-900/30 border-green-600 text-green-800 dark:text-green-300"
                : "bg-blue-100 dark:bg-blue-900/30 border-blue-600 text-blue-800 dark:text-blue-300"
            } transition-all duration-300 ease-in-out`}
          >
            <div className="flex items-start">
              <span className="mr-2">
                {popup.type === "error" && "❌"}
                {popup.type === "warning" && "⚠️"}
                {popup.type === "success" && "✅"}
                {popup.type === "info" && "ℹ️"}
              </span>
              <p className="text-sm font-medium">{popup.message}</p>
            </div>
          </div>
        ))}
      </div>
  
      <div className="text-center">
        <h1 className="text-3xl font-bold text-blue-700 dark:text-blue-400">{test.title}</h1>
        <p className="text-gray-700 dark:text-gray-300">{test.description}</p>
        <p className="italic text-gray-500 dark:text-gray-400">{test.instructions}</p>
  
        {/* Mic Status */}
        {micPermission !== null && (
          <div
            className={`mt-2 text-sm font-semibold ${
              micPermission ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
            }`}
          >
            {micPermission ? "🎤 Microphone access granted" : "❌ Microphone access denied"}
          </div>
        )}
      </div>
  
      <div className="flex justify-between bg-white/90 dark:bg-slate-800/90 shadow-xl border border-slate-200 dark:border-slate-700 rounded-2xl p-6 max-w-5xl mx-auto w-full transition-all duration-300">
        {/* Left Section */}
        <div className="w-1/2 pr-6">
          <h2 className="text-xl font-semibold mb-4 text-blue-700 dark:text-blue-400">
            Question {currentQ + 1} of {test.questions.length}
          </h2>
          <p className="text-lg text-gray-800 dark:text-gray-200">{currentQuestion}</p>
  
          {isAttempted && (
            <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/30 border border-green-300 dark:border-green-700 rounded-lg">
              <p className="text-green-700 dark:text-green-300 font-medium">
                ✅ You have already attempted this question.
              </p>
            </div>
          )}
        </div>
  
        {/* Right Section */}
        <div className="w-1/2 pl-6 flex flex-col items-center justify-center gap-4">
          {!isAttempted ? (
            <>
              {!isRecording ? (
                <button
                  onClick={startRecording}
                  disabled={micPermission === false}
                  className={`px-6 py-3 rounded-xl font-bold shadow-md transition-all ${
                    micPermission === false
                      ? "bg-gray-400 text-gray-200 cursor-not-allowed"
                      : "bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white"
                  }`}
                >
                  🎤 Start Recording
                </button>
              ) : (
                <>
                  <button
                    onClick={stopRecording}
                    className="px-6 py-3 rounded-xl bg-red-600 hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600 text-white font-bold shadow-md"
                  >
                    ⏹ Stop Recording
                  </button>
                  <div className="text-lg font-semibold text-gray-800 dark:text-gray-100 flex flex-col items-center">
                    <span>⏱ Time Left: {timeLeft ?? 0}s</span>
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      Duration: {duration}s
                    </span>
                  </div>
                </>
              )}
            </>
          ) : (
            <button
              disabled
              className="px-6 py-3 rounded-xl bg-gray-400 text-gray-200 font-bold cursor-not-allowed"
            >
              Attempted
            </button>
          )}
  
          {!isLastQuestion ? (
            <button
              onClick={nextQuestion}
              className="px-6 py-3 rounded-xl bg-green-600 hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600 text-white font-bold shadow-md"
            >
              Next Question →
            </button>
          ) : (
            <button
              onClick={handleSubmitTest}
              className="px-6 py-3 rounded-xl bg-purple-600 hover:bg-purple-700 dark:bg-purple-500 dark:hover:bg-purple-600 text-white font-bold shadow-md"
            >
              Submit Test
            </button>
          )}
        </div>
      </div>
    </div>
  );
  
};

export default TakeCommunicationRound;