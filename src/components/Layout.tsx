import { useState, useEffect, useRef } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { useThemeStore } from "../store/themeStore";

import {
  LayoutDashboard,
  Users,
  CheckSquare,
  LogOut,
  Menu,
  X,
  MessageSquareTextIcon,
  Bell,
  Code,
  Trophy,
  Mic,
  ChevronLeft,
  ChevronRight,
  Camera,
  Monitor,
  AlertTriangle,
  Volume2,
  VolumeX,
  Sun,
  Moon,
  Shield,
  Ban,
  Lock,
} from "lucide-react";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import {
  onSnapshot,
  collection,
  query,
  where,
  orderBy,
  doc,
  setDoc,
  addDoc,
  onSnapshot as firestoreOnSnapshot,
  deleteDoc,
  getDocs,
  deleteField,
} from "../lib/firebase";
import { db } from "../lib/firebase";
import { getAuth } from "../lib/firebase";
import { toast as hotToast } from "react-hot-toast";

// Improved warning sound function
const playWarningSound = () => {
  try {
    // Create a more noticeable warning sound using Web Audio API
    const context = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(context.destination);
    
    oscillator.type = 'sawtooth';
    oscillator.frequency.setValueAtTime(800, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(300, context.currentTime + 0.5);
    
    gainNode.gain.setValueAtTime(0.3, context.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, context.currentTime + 0.5);
    
    oscillator.start(context.currentTime);
    oscillator.stop(context.currentTime + 0.5);
    
  } catch (error) {
    console.error('Error playing warning sound:', error);
    // Fallback to browser beep
    const beep = new Audio("data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU");
    beep.play().catch(() => {});
  }
};

const playAlertSound = () => {
  try {
    // More urgent sound for critical violations
    const context = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(context.destination);
    
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(1000, context.currentTime);
    oscillator.frequency.setValueAtTime(800, context.currentTime + 0.1);
    oscillator.frequency.setValueAtTime(1000, context.currentTime + 0.2);
    
    gainNode.gain.setValueAtTime(0.4, context.currentTime);
    gainNode.gain.setValueAtTime(0.4, context.currentTime + 0.1);
    gainNode.gain.setValueAtTime(0.4, context.currentTime + 0.2);
    gainNode.gain.exponentialRampToValueAtTime(0.01, context.currentTime + 0.3);
    
    oscillator.start(context.currentTime);
    oscillator.stop(context.currentTime + 0.3);
    
  } catch (error) {
    console.error('Error playing alert sound:', error);
  }
};

// Global camera manager to maintain streaming across components
class CameraStreamManager {
  private static instance: CameraStreamManager;
  private stream: MediaStream | null = null;
  private peerConnection: RTCPeerConnection | null = null;
  private isStreaming = false;
  private callUnsub: (() => void) | null = null;
  private answerUnsub: (() => void) | null = null;
  private violations = 0;
  private onViolationChange: ((violations: number) => void) | null = null;
  private onStatusChange: ((status: string) => void) | null = null;

  public static getInstance(): CameraStreamManager {
    if (!CameraStreamManager.instance) {
      CameraStreamManager.instance = new CameraStreamManager();
    }
    return CameraStreamManager.instance;
  }

  setCallbacks(onViolationChange: (violations: number) => void, onStatusChange: (status: string) => void) {
    this.onViolationChange = onViolationChange;
    this.onStatusChange = onStatusChange;
  }

  async startCamera(): Promise<boolean> {
    try {
      if (this.stream) {
        console.log('[CameraManager] Camera already active');
        return true;
      }

      this.onStatusChange?.('checking');
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 }
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100,
          channelCount: 1,
          // latency: 0.01
        },  // ← AUDIO ENABLED WITH OPTIMIZATIONS
      });
      
      this.stream = mediaStream;
      this.onStatusChange?.('success');
      console.log('[CameraManager] Camera and audio started successfully');
      console.log('[CameraManager] Audio tracks:', mediaStream.getAudioTracks().length);
      console.log('[CameraManager] Video tracks:', mediaStream.getVideoTracks().length);
      return true;
    } catch (err) {
      console.error('[CameraManager] Camera/audio access failed:', err);
      this.onStatusChange?.('failed');
      return false;
    }
  }

  async startWebRTCStreaming(user: any) {
    if (!this.stream || !user?.uid || this.isStreaming) return;
    
    try {
      const studentId = user.uid;
      const callId = `examStream_${studentId}`;
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      this.peerConnection = pc;

      // Add both video and audio tracks to WebRTC
      this.stream.getTracks().forEach((track) => {
        pc.addTrack(track, this.stream!);
      });

      const callDoc = doc(db, "calls", callId);
      const offerCandidates = collection(callDoc, "offerCandidates");
      const answerCandidates = collection(callDoc, "answerCandidates");

      // Clear any stale candidates from previous sessions to avoid ICE confusion
      try {
        const oldOfferCands = await getDocs(offerCandidates);
        await Promise.all(oldOfferCands.docs.map(d => deleteDoc(d.ref)));
        const oldAnswerCands = await getDocs(answerCandidates);
        await Promise.all(oldAnswerCands.docs.map(d => deleteDoc(d.ref)));
      } catch (e) {
        console.warn('[CameraManager] Unable to clear old ICE candidates:', e);
      }

      pc.onicecandidate = async (event) => {
        if (event.candidate) {
          await addDoc(offerCandidates, event.candidate.toJSON());
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log('[CameraManager] ICE state:', pc.iceConnectionState);
        if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
          try { (pc as any).restartIce?.(); } catch { console.warn("ICE restart failed"); }
          setTimeout(() => {
            if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
              this.reconnectWebRTC(user);
            }
          }, 2000);
        }
      };

      // Track event listeners for debugging
      pc.ontrack = (event) => {
        console.log('[CameraManager] Remote track added:', event.track.kind);
      };

      const offerDescription = await pc.createOffer();
      await pc.setLocalDescription(offerDescription);

      // Ensure previous answer is cleared to avoid student applying a stale answer
      try {
        await setDoc(callDoc, { answer: deleteField() }, { merge: true });
      } catch {
        console.warn("No stale answer field to clear");
      }

      await setDoc(callDoc, {
        offer: { type: offerDescription.type, sdp: offerDescription.sdp },
        studentId: studentId,
        startedAt: new Date(),
        location: "exam",
        studentEmail: user.email,
        isActive: true,
        hasAudio: this.stream.getAudioTracks().length > 0,  // Track audio availability
        hasVideo: this.stream.getVideoTracks().length > 0   // Track video availability
      });

      // Cleanup old listeners if any
      if (this.callUnsub) {
        this.callUnsub();
        this.callUnsub = null;
      }
      if (this.answerUnsub) {
        this.answerUnsub();
        this.answerUnsub = null;
      }

      const unsubCall = firestoreOnSnapshot(callDoc, async (snapshot) => {
        const data = snapshot.data();
        if (data?.answer && !pc.currentRemoteDescription) {
          const answerDesc = new RTCSessionDescription(data.answer);
          await pc.setRemoteDescription(answerDesc);
        }
      });

      const unsubAnswer = firestoreOnSnapshot(answerCandidates, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === "added") {
            const candidate = new RTCIceCandidate(change.doc.data());
            pc.addIceCandidate(candidate).catch((err) => {
              console.error('[CameraManager] Error adding ICE candidate from admin:', err);
            });
          }
        });
      });

      this.callUnsub = unsubCall;
      this.answerUnsub = unsubAnswer;
      this.isStreaming = true;

      console.log('[CameraManager] WebRTC streaming started with audio and video');

    } catch (error) {
      console.error('[CameraManager] WebRTC setup failed:', error);
    }
  }

  private async reconnectWebRTC(user: any) {
    // Close existing PC and listeners, but keep the camera stream
    try {
      if (this.peerConnection) {
        this.peerConnection.onicecandidate = null;
        this.peerConnection.oniceconnectionstatechange = null;
        this.peerConnection.close();
      }
    } catch {
      console.warn("Peer connection cleanup failed");
    }
    this.peerConnection = null;

    // Do not stop camera; just restart signaling/PC
    this.isStreaming = false;
    console.log('[CameraManager] Reconnecting WebRTC...');
    try {
      await this.startWebRTCStreaming(user);
    } catch (e) {
      console.error('[CameraManager] Reconnect failed:', e);
    }
  }

  getStream(): MediaStream | null {
    return this.stream;
  }

  stopCamera() {
    console.log('[CameraManager] Stopping camera and audio...');
    
    // Unsubscribe Firestore listeners
    if (this.callUnsub) {
      this.callUnsub();
      this.callUnsub = null;
    }
    if (this.answerUnsub) {
      this.answerUnsub();
      this.answerUnsub = null;
    }
    
    this.isStreaming = false;
    
    // Stop all media tracks (both video and audio)
    if (this.stream) {
      this.stream.getTracks().forEach((track) => {
        track.stop();
        console.log('[CameraManager] Stopped track:', track.kind, track.label);
      });
      this.stream = null;
    }
    
    // Close peer connection
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
      console.log('[CameraManager] Closed peer connection');
    }

    this.onStatusChange?.('stopped');
  }

  async cleanupFirestore(user: any) {
    if (!user?.uid) return;
    
    try {
      const callId = `examStream_${user.uid}`;
      const callDoc = doc(db, "calls", callId);
      await setDoc(callDoc, {
        isActive: false,
        endedAt: new Date()
      }, { merge: true });
      console.log('[CameraManager] Firestore cleaned up');
    } catch (error) {
      console.error('[CameraManager] Firestore cleanup error:', error);
    }
  }

  addViolation() {
    this.violations++;
    this.onViolationChange?.(this.violations);
    return this.violations;
  }

  getViolations() {
    return this.violations;
  }

  resetViolations() {
    this.violations = 0;
    this.onViolationChange?.(0);
  }

  isCameraActive(): boolean {
    return this.stream !== null && this.isStreaming;
  }

  // New method to check if audio is available
  hasAudio(): boolean {
    return this.stream ? this.stream.getAudioTracks().length > 0 : false;
  }

  // New method to check if video is available
  hasVideo(): boolean {
    return this.stream ? this.stream.getVideoTracks().length > 0 : false;
  }
}

// Camera Authentication Component
const CameraAuthGate = ({ onSuccess, user }: { onSuccess: () => void; user: any }) => {
  const [status, setStatus] = useState<'checking' | 'success' | 'failed'>('checking');
  const [violations, setViolations] = useState(0);
  const [warningMsg, setWarningMsg] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showFullscreen, setShowFullscreen] = useState(false);
  const [mediaStatus, setMediaStatus] = useState<{video: boolean, audio: boolean}>({video: false, audio: false});
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraManager = CameraStreamManager.getInstance();

  // Enhanced camera cleanup function
  const stopCamera = () => {
    console.log('[CameraAuth] Stopping camera and audio...');
    cameraManager.stopCamera();
  };

  // Enhanced fullscreen function
  const reEnterFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        const element = document.documentElement as any;
        
        // Try different fullscreen methods for cross-browser compatibility
        if (element.requestFullscreen) {
          await element.requestFullscreen();
        } else if (element.webkitRequestFullscreen) {
          await element.webkitRequestFullscreen();
        } else if (element.msRequestFullscreen) {
          await element.msRequestFullscreen();
        } else if (element.mozRequestFullScreen) {
          await element.mozRequestFullScreen();
        }
        
        setShowFullscreen(true);
        console.log('[CameraAuth] Entered fullscreen mode');
      }
    } catch (error) {
      console.error('[CameraAuth] Failed to enter fullscreen:', error);
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

  // Track fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setShowFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, []);

  // Initialize camera on component mount
  useEffect(() => {
    const initCamera = async () => {
      // Set callbacks first
      cameraManager.setCallbacks(
        (newViolations) => setViolations(newViolations),
        (newStatus) => setStatus(newStatus as any)
      );

      const success = await cameraManager.startCamera();
      if (success) {
        // Update media status
        setMediaStatus({
          video: cameraManager.hasVideo(),
          audio: cameraManager.hasAudio()
        });
        
        // Start WebRTC streaming
        await cameraManager.startWebRTCStreaming(user);
        
        // Setup video element
        if (videoRef.current) {
          videoRef.current.srcObject = cameraManager.getStream();
          videoRef.current.play().catch(console.error);
        }
      }
    };

    initCamera();

    return () => {
      // Don't stop camera here - let it continue streaming
      console.log('[CameraAuth] Component unmounting, but camera continues...');
    };
  }, [user]);

  // Update video element when stream becomes available
  useEffect(() => {
    if (videoRef.current && cameraManager.getStream()) {
      videoRef.current.srcObject = cameraManager.getStream();
      videoRef.current.play().catch(console.error);
    }
  }, [status]);

  // Trigger fullscreen automatically when camera authentication is successful
  useEffect(() => {
    if (status === 'success') {
      console.log('[CameraAuth] Camera success - triggering fullscreen...');
      // Use setTimeout to ensure the component is fully rendered
      const timer = setTimeout(() => {
        reEnterFullscreen();
      }, 500);
      
      return () => clearTimeout(timer);
    }
  }, [status]);

  // Enhanced violation handling with better sounds
  const handleViolation = async () => {
    const newViolations = cameraManager.addViolation();
    
    if (newViolations < 5) {
      setWarningMsg(`Warning: Do not exit fullscreen or switch tabs. Violation ${newViolations} of 5.`);
      if (soundEnabled) {
        playWarningSound();
      }
      reEnterFullscreen();
      
      // Update violations in Firestore
      if (user?.uid) {
        setDoc(
          doc(db, "responses", user.uid),
          {
            loginViolations: newViolations,
            lastViolationAt: new Date(),
          },
          { merge: true }
        ).catch(console.error);
      }
      
    } else {
      setWarningMsg("Access revoked due to excessive violations (5 reached).");
      if (soundEnabled) {
        playAlertSound();
      }
      handleReject();
    }
  };

  const handleReject = async () => {
    if (!user) return;
    
    await setDoc(
      doc(db, "responses", user.uid),
      {
        loginRejected: true,
        rejectedAt: new Date(),
        violations: violations,
      },
      { merge: true }
    );

    await exitFullscreen();
    stopCamera();
    window.location.reload();
  };

  // Anti-cheat monitoring
  useEffect(() => {
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
      if ((e.ctrlKey || e.metaKey) && e.key === 'r') e.preventDefault();
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'R') e.preventDefault();
      if (e.key === 'F5') e.preventDefault();
    };

    if (status === 'success') {
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
  }, [status, soundEnabled]);

  const handleContinue = () => {
    onSuccess();
  };

  const handleRetry = async () => {
    setStatus('checking');
    const success = await cameraManager.startCamera();
    if (success) {
      setMediaStatus({
        video: cameraManager.hasVideo(),
        audio: cameraManager.hasAudio()
      });
      await cameraManager.startWebRTCStreaming(user);
    }
  };

  if (status === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-6">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-blue-100 flex items-center justify-center">
            <Camera className="w-10 h-10 text-blue-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Camera & Microphone Setup
          </h2>
          <p className="text-gray-600 mb-6">
            Setting up camera and microphone for secure monitoring...
          </p>
          <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto"></div>
        </div>
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-6">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-red-100 flex items-center justify-center">
            <AlertTriangle className="w-10 h-10 text-red-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Camera/Microphone Access Required
          </h2>
          <p className="text-gray-600 mb-6">
            Camera and microphone access are required to continue. Please enable permissions.
          </p>
          <button
            onClick={handleRetry}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Retry Camera & Microphone Access
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 transition-colors duration-500">
      {/* Security Header */}
      <div className="sticky top-0 z-50 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-white/20 dark:border-slate-700 shadow-[0_4px_6px_rgba(0,0,0,0.1)]">
        <div className="max-w-7xl mx-auto px-6 py-3">
          <div className="flex items-center justify-between">
            {/* Left Status */}
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Monitor className="w-4 h-4 text-green-600" />
                <span className="text-sm text-gray-700 dark:text-slate-200">
                  Camera: <span className="font-semibold text-green-600">Active</span>
                </span>
              </div>
  
              <div className="flex items-center space-x-2">
                <Mic className="w-4 h-4 text-green-600" />
                <span className="text-sm text-gray-700 dark:text-slate-200">
                  Microphone: <span className="font-semibold text-green-600">Active</span>
                </span>
              </div>
  
              <div className="flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 text-orange-500" />
                <span className="text-sm text-gray-700 dark:text-slate-200">
                  Violations:{" "}
                  <span className="font-semibold text-orange-500">{violations}</span>
                </span>
              </div>
            </div>
  
            {/* Right Controls */}
            <div className="flex items-center space-x-3">
              {/* Sound Toggle */}
              <button
                onClick={() => setSoundEnabled(!soundEnabled)}
                className="p-1.5 text-gray-400 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200 rounded-lg hover:bg-white/70 dark:hover:bg-slate-800 transition-all"
              >
                {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>
  
              {/* Fullscreen Button */}
              <button
                onClick={reEnterFullscreen}
                className="px-3 py-1.5 bg-blue-100 dark:bg-slate-700 text-blue-800 dark:text-slate-100 rounded-lg text-sm hover:bg-blue-200 dark:hover:bg-slate-600 transition-colors font-medium border border-blue-300 dark:border-slate-600 flex items-center space-x-2"
              >
                <Monitor className="w-4 h-4" />
                <span>Enter Fullscreen</span>
              </button>
  
              {/* Fullscreen Status */}
              <div
                className={`flex items-center space-x-1 px-2 py-1 rounded-lg text-xs font-medium transition-all ${
                  showFullscreen
                    ? "bg-green-100 text-green-800 dark:bg-green-800/40 dark:text-green-300"
                    : "bg-red-100 text-red-800 dark:bg-red-800/40 dark:text-red-300"
                }`}
              >
                <Monitor className="w-3 h-3" />
                <span>{showFullscreen ? "Fullscreen ON" : "Fullscreen OFF"}</span>
              </div>
            </div>
          </div>
        </div>
  
        {/* Warning Bar */}
        {warningMsg && (
          <div className="bg-gradient-to-r from-yellow-50/90 to-orange-50/90 dark:from-yellow-900/50 dark:to-orange-900/40 border-b border-yellow-200/50 dark:border-yellow-700/40 backdrop-blur-sm">
            <div className="max-w-7xl mx-auto px-6 py-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                  <span className="text-yellow-800 dark:text-yellow-300 text-sm">
                    {warningMsg}
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={reEnterFullscreen}
                    className="px-2 py-1 bg-yellow-200 dark:bg-yellow-700 text-yellow-800 dark:text-yellow-100 rounded text-xs hover:bg-yellow-300 dark:hover:bg-yellow-600 transition-colors"
                  >
                    Resume Fullscreen
                  </button>
                  <button
                    onClick={() => setWarningMsg(null)}
                    className="px-2 py-1 bg-white/80 dark:bg-slate-800 text-yellow-800 dark:text-yellow-100 rounded text-xs hover:bg-white dark:hover:bg-slate-700 transition-colors border border-yellow-300 dark:border-yellow-600"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
  
      {/* Main Content */}
      <div className="flex items-center justify-center min-h-[calc(100vh-80px)] p-6">
        <div className="max-w-4xl w-full bg-white dark:bg-slate-900 rounded-2xl shadow-xl overflow-hidden border border-slate-200 dark:border-slate-700 transition-colors duration-300">
          <div className="grid md:grid-cols-2">
            {/* Left Side - Camera */}
            <div className="bg-gray-50 dark:bg-slate-800 p-8 flex flex-col items-center justify-center">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-green-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Camera className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-slate-100 mb-2">
                  Camera & Microphone Active
                </h3>
                <p className="text-gray-600 dark:text-slate-400">
                  Your camera and audio are being monitored for exam security
                </p>
              </div>
  
              <div className="w-full max-w-xs">
                <div className="aspect-video bg-black rounded-lg overflow-hidden mb-4">
                  <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                </div>
                <div className="flex justify-between text-sm text-gray-500 dark:text-slate-400 mb-2">
                  <span>Video: {mediaStatus.video ? "✅ Active" : "❌ Inactive"}</span>
                  <span>Audio: {mediaStatus.audio ? "✅ Active" : "❌ Inactive"}</span>
                </div>
                <p className="text-sm text-gray-500 dark:text-slate-400 text-center">
                  Live preview - Your video and audio are being streamed to administrators
                </p>
              </div>
  
              <div className="mt-6 bg-blue-50 dark:bg-slate-700/50 rounded-lg p-4 text-left w-full max-w-xs border border-blue-200 dark:border-slate-600">
                <h4 className="font-semibold text-blue-900 dark:text-slate-100 mb-2">
                  Security Guidelines:
                </h4>
                <ul className="text-sm text-blue-800 dark:text-slate-300 space-y-1">
                  <li>• Keep your face visible</li>
                  <li>• Ensure good lighting</li>
                  <li>• Do not switch tabs/windows</li>
                  <li>• Remain in fullscreen mode</li>
                  <li>• Keep microphone unobstructed</li>
                </ul>
              </div>
            </div>
  
            {/* Right Side - Info */}
            <div className="p-8 bg-white dark:bg-slate-900">
              <div className="text-center mb-8">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-slate-100 mb-2">
                  Welcome to Exam Portal
                </h1>
                <p className="text-gray-600 dark:text-slate-400">
                  Camera and microphone authentication successful
                </p>
              </div>
  
              <div className="space-y-6">
                <div className="bg-green-50 dark:bg-green-900/40 border border-green-200 dark:border-green-700 rounded-lg p-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-green-100 dark:bg-green-800 rounded-full flex items-center justify-center">
                      <Monitor className="w-4 h-4 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <p className="font-medium text-green-800 dark:text-green-300">
                        Proctoring Active
                      </p>
                      <p className="text-sm text-green-600 dark:text-green-400">
                        Your session is being monitored with audio
                      </p>
                    </div>
                  </div>
                </div>
  
                <div className="bg-blue-50 dark:bg-blue-900/40 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
                  <h4 className="font-semibold text-blue-900 dark:text-blue-200 mb-3">
                    Important Instructions:
                  </h4>
                  <ul className="text-sm text-blue-800 dark:text-blue-300 space-y-2">
                    <li>• Do not minimize the browser or switch tabs during exams</li>
                    <li>• Keep your camera and microphone on throughout the session</li>
                    <li>• Ensure stable internet connection</li>
                    <li>• Violations may result in exam termination</li>
                  </ul>
                </div>
  
                <div className="bg-orange-50 dark:bg-orange-900/40 border border-orange-200 dark:border-orange-700 rounded-lg p-4">
                  <div className="flex items-center space-x-3">
                    <AlertTriangle className="w-2 h-2 text-orange-500 dark:text-orange-400" />
                    <div>
                      <p className="font-medium text-orange-800 dark:text-orange-300">
                        Current Violations: {violations}/2
                      </p>
                      <p className="text-sm text-orange-600 dark:text-orange-400">
                        2 violations will result in access revocation
                      </p>
                    </div>
                  </div>
                </div>
              </div>
  
              <button
                onClick={handleContinue}
                className="w-full mt-8 bg-blue-600 dark:bg-indigo-600 text-white py-3 px-6 rounded-lg hover:bg-blue-700 dark:hover:bg-indigo-500 transition-colors font-semibold shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
              >
                Continue to Dashboard
              </button>
  
              <p className="text-xs text-gray-500 dark:text-slate-500 text-center mt-4">
                By continuing, you agree to the audio and video monitoring terms and conditions
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
  
};

// Continuous Camera Monitoring Component (for all student pages)
const ContinuousCameraMonitor = ({ user }: { user: any }) => {
  const [violations, setViolations] = useState(0);
  const [warningMsg, setWarningMsg] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showFullscreen, setShowFullscreen] = useState(false);
  const [mediaStatus, setMediaStatus] = useState<{video: boolean, audio: boolean}>({video: false, audio: false});
  const cameraManager = CameraStreamManager.getInstance();

  // Enhanced fullscreen function
  const reEnterFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        const element = document.documentElement as any;
        
        // Try different fullscreen methods for cross-browser compatibility
        if (element.requestFullscreen) {
          await element.requestFullscreen();
        } else if (element.webkitRequestFullscreen) {
          await element.webkitRequestFullscreen();
        } else if (element.msRequestFullscreen) {
          await element.msRequestFullscreen();
        } else if (element.mozRequestFullScreen) {
          await element.mozRequestFullScreen();
        }
        
        setShowFullscreen(true);
        console.log('[ContinuousMonitor] Entered fullscreen mode');
      }
    } catch (error) {
      console.error('[ContinuousMonitor] Failed to enter fullscreen:', error);
    }
  };

  // Track fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setShowFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, []);

  // Ensure fullscreen is maintained when component mounts
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!document.fullscreenElement) {
        console.log('[ContinuousMonitor] Ensuring fullscreen mode...');
        reEnterFullscreen();
      }
    }, 1000);
    
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    // Set up callbacks for violations and status
    cameraManager.setCallbacks(
      (newViolations) => setViolations(newViolations),
      () => {} // Status changes not needed here
    );

    // Update media status
    setMediaStatus({
      video: cameraManager.hasVideo(),
      audio: cameraManager.hasAudio()
    });

    // Ensure camera is still active, restart if needed
    const ensureCameraActive = async () => {
      if (!cameraManager.isCameraActive() && user) {
        console.log('[ContinuousMonitor] Restarting camera and audio...');
        const success = await cameraManager.startCamera();
        if (success) {
          setMediaStatus({
            video: cameraManager.hasVideo(),
            audio: cameraManager.hasAudio()
          });
          await cameraManager.startWebRTCStreaming(user);
        }
      }
    };

    ensureCameraActive();

    // Anti-cheat monitoring that works across all pages
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
      if ((e.ctrlKey || e.metaKey) && e.key === 'r') e.preventDefault();
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'R') e.preventDefault();
      if (e.key === 'F5') e.preventDefault();
    };

    // Add event listeners
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
  }, [user, soundEnabled]);

  const handleViolation = async () => {
    const newViolations = cameraManager.addViolation();
    
    if (newViolations < 5) {
      setWarningMsg(`Warning: Security violation detected. Violation ${newViolations} of 5.`);
      if (soundEnabled) {
        playWarningSound();
      }
      reEnterFullscreen();
      
      // Update violations in Firestore
      if (user?.uid) {
        setDoc(
          doc(db, "responses", user.uid),
          {
            loginViolations: newViolations,
            lastViolationAt: new Date(),
          },
          { merge: true }
        ).catch(console.error);
      }
      
    } else {
      setWarningMsg("Access revoked due to excessive violations (2 reached).");
      if (soundEnabled) {
        playAlertSound();
      }
      handleReject();
    }
  };

  const handleReject = async () => {
    if (!user) return;
    
    await setDoc(
      doc(db, "responses", user.uid),
      {
        loginRejected: true,
        rejectedAt: new Date(),
        violations: violations,
      },
      { merge: true }
    );

    cameraManager.stopCamera();
    await cameraManager.cleanupFirestore(user);
    window.location.reload();
  };

  // Don't render anything visible, this component just manages the camera in background
  return (
    <>
      {/* Security Header Banner */}
      {warningMsg && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-yellow-50/95 to-orange-50/95 border-b border-yellow-200 backdrop-blur-sm shadow-lg">
          <div className="max-w-7xl mx-auto px-6 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <AlertTriangle className="w-5 h-5 text-yellow-600" />
                <span className="text-yellow-800 font-medium">{warningMsg}</span>
              </div>
              <div className="flex items-center space-x-3">
                <button
                  onClick={reEnterFullscreen}
                  className="px-3 py-1.5 bg-yellow-200 text-yellow-800 rounded-lg text-sm hover:bg-yellow-300 transition-colors font-medium"
                >
                  Resume Fullscreen
                </button>
                <button
                  onClick={() => setWarningMsg(null)}
                  className="px-3 py-1.5 bg-white/90 text-yellow-800 rounded-lg text-sm hover:bg-white transition-colors font-medium border border-yellow-300"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mini Camera Status Bar */}
      <div className="fixed bottom-4 right-4 z-40 bg-black/80 backdrop-blur-md rounded-2xl p-4 text-white shadow-2xl border border-white/20">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${cameraManager.isCameraActive() ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
            <span className="text-sm font-medium">Camera</span>
          </div>
          <div className="h-4 w-px bg-white/30"></div>
          <div className="flex items-center space-x-2">
            <Mic className="w-4 h-4 text-blue-400" />
            <span className="text-sm">{mediaStatus.audio ? 'On' : 'Off'}</span>
          </div>
          <div className="h-4 w-px bg-white/30"></div>
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-orange-400" />
            <span className="text-sm">{violations}/5</span>
          </div>
          <div className="h-4 w-px bg-white/30"></div>
          <div className="flex items-center space-x-2">
            <Monitor className="w-4 h-4 text-purple-400" />
            <span className="text-sm">{showFullscreen ? 'ON' : 'OFF'}</span>
          </div>
          <div className="h-4 w-px bg-white/30"></div>
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-1 hover:bg-white/20 rounded-lg transition-colors"
            title={soundEnabled ? "Mute sounds" : "Unmute sounds"}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </>
  );
};

// Updated Access Blocked Component with Modern UI
const AccessBlockedPage = ({ onSignOut }: { onSignOut: () => void }) => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-gray-50 to-zinc-50 p-6">
      <div className="max-w-2xl w-full">
        {/* Main Card */}
        <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden">
          {/* Header Section with Gradient */}
          <div className="bg-gradient-to-r from-red-500 to-rose-600 p-8 text-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm">
                  <Shield className="w-8 h-8" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold">Access Restricted</h1>
                  <p className="text-red-100 opacity-90">Security policy violation detected</p>
                </div>
              </div>
              <div className="bg-white/20 backdrop-blur-sm px-4 py-2 rounded-full border border-white/30">
                <span className="font-semibold text-sm">EXAM SECURITY</span>
              </div>
            </div>
          </div>

          {/* Content Section */}
          <div className="p-8">
            {/* Alert Icon */}
            <div className="flex justify-center mb-6">
              <div className="relative">
                <div className="w-24 h-24 bg-red-100 rounded-3xl flex items-center justify-center">
                  <Ban className="w-12 h-12 text-red-600" />
                </div>
                <div className="absolute -top-2 -right-2 w-8 h-8 bg-red-500 rounded-full flex items-center justify-center">
                  <Lock className="w-4 h-4 text-white" />
                </div>
              </div>
            </div>

            {/* Message */}
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                Exam Access Revoked
              </h2>
              <div className="space-y-3 text-gray-600">
                <p className="text-lg">
                  Your exam access has been suspended due to security policy violations.
                </p>
                <p className="text-sm">
                  Multiple malpractice attempts or security breaches were detected during your session.
                  If you believe this is an error, please contact the administrator immediately.
                </p>
              </div>
            </div>

            {/* Violation Details */}
            <div className="bg-gray-50 rounded-2xl p-6 mb-8 border border-gray-200">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-500 mr-2" />
                Security Violations Detected
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                <div className="bg-white rounded-xl p-4 border border-gray-200">
                  <div className="text-2xl font-bold text-red-600">5+</div>
                  <div className="text-sm text-gray-600">Policy Violations</div>
                </div>
                <div className="bg-white rounded-xl p-4 border border-gray-200">
                  <div className="text-2xl font-bold text-orange-600">Auto</div>
                  <div className="text-sm text-gray-600">System Action</div>
                </div>
                <div className="bg-white rounded-xl p-4 border border-gray-200">
                  <div className="text-2xl font-bold text-gray-600">0</div>
                  <div className="text-sm text-gray-600">Remaining Attempts</div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-4">
              <button
                onClick={onSignOut}
                className="w-full bg-gradient-to-r from-red-600 to-rose-700 text-white py-4 px-6 rounded-2xl font-semibold hover:from-red-700 hover:to-rose-800 transition-all duration-300 transform hover:scale-[1.02] shadow-lg hover:shadow-xl flex items-center justify-center space-x-3"
              >
                <LogOut className="w-5 h-5" />
                <span>Return to Login</span>
              </button>
              
              <div className="text-center">
                <p className="text-sm text-gray-500">
                  Contact administrator at{" "}
                  <span className="text-blue-600 font-medium">admin@examportal.com</span>
                </p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="bg-gray-50 border-t border-gray-200 px-8 py-4">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <div className="flex items-center space-x-2">
                <Shield className="w-3 h-3" />
                <span>Secure Exam Portal v2.0</span>
              </div>
              <span>© 2024 Exam Security System</span>
            </div>
          </div>
        </div>

        {/* Additional Info Card */}
        <div className="mt-6 bg-white rounded-2xl p-6 border border-gray-200 shadow-lg">
          <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
            <AlertTriangle className="w-4 h-4 text-orange-500 mr-2" />
            What happens next?
          </h3>
          <ul className="text-sm text-gray-600 space-y-2">
            <li className="flex items-start space-x-2">
              <span className="text-red-500 mt-0.5">•</span>
              <span>Your session has been terminated and recorded</span>
            </li>
            <li className="flex items-start space-x-2">
              <span className="text-red-500 mt-0.5">•</span>
              <span>Administrators have been notified of this incident</span>
            </li>
            <li className="flex items-start space-x-2">
              <span className="text-red-500 mt-0.5">•</span>
              <span>Further access requires administrator approval</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

function Layout() {
  const { signOut, user, userRole } = useAuthStore();
  const location = useLocation();
  const { theme, setTheme } = useThemeStore();

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<string[]>([]);
  const [cameraAuthenticated, setCameraAuthenticated] = useState(false);
  const [blockState, setBlockState] = useState<{ blocked: boolean; reason?: string }>({ blocked: false });
  const [codingCompleted, setCodingCompleted] = useState(false);
  const [commCompleted, setCommCompleted] = useState(false);

  // Check if user is student and needs camera authentication
  const isStudent = userRole === 'user';
  const shouldShowCameraAuth = isStudent && !cameraAuthenticated;
  const shouldShowContinuousMonitor = isStudent && cameraAuthenticated;

  const isActive = (path: string) => location.pathname === path;

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);
  const toggleCollapse = () => setIsCollapsed(!isCollapsed);
  const closeSidebar = () => setIsSidebarOpen(false);
  const toggleNotifications = () => setShowNotifications(!showNotifications);
  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');

  const handleCameraSuccess = () => {
    setCameraAuthenticated(true);
  };

  // Enhanced signOut with camera cleanup
  const handleSignOut = async () => {
    console.log('[Layout] Signing out, cleaning up camera and audio...');
    
    // Force stop camera if it's active
    if (isStudent && cameraAuthenticated) {
      const cameraManager = CameraStreamManager.getInstance();
      cameraManager.stopCamera();
      await cameraManager.cleanupFirestore(user);
      
      // Additional cleanup
      const videos = document.querySelectorAll('video');
      videos.forEach(video => {
        if (video.srcObject instanceof MediaStream) {
          video.srcObject.getTracks().forEach(track => {
            track.stop();
            console.log('[Layout] Stopped track:', track.kind);
          });
          video.srcObject = null;
        }
      });
    }
    
    // Wait a bit for cleanup then sign out
    setTimeout(() => {
      signOut();
    }, 500);
  };

  // Auto-collapse sidebar when on coding round
  useEffect(() => {
    if (location.pathname === '/CodingRound') {
      setIsCollapsed(true);
      setIsSidebarOpen(false);
    }
  }, [location.pathname]);

  useEffect(() => {
    if (!user?.uid) return;
    const q = query(
      collection(db, "notifications"),
      where("receiverId", "==", user.uid),
      orderBy("timestamp", "desc")
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const newNotes: string[] = [];
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
          const data = change.doc.data();
          newNotes.push(`${data.senderName || "Unknown"}: ${data.message}`);
          const sound = new Audio(
            "https://www.myinstants.com/media/sounds/bleep.mp3"
          );
          sound.play().catch(() => {});
        }
      });
      setNotifications((prev) => [...newNotes, ...prev]);
    });
    return () => unsub();
  }, [user?.uid]);

  // Listen for rejection flags only (do NOT block just for MCQ submission)
  useEffect(() => {
    if (!user?.uid || userRole !== 'user') return;
    const ref = doc(db, "responses", user.uid);
    const unsub = onSnapshot(ref, (snap) => {
      const data: any = snap.data() || {};
      const rejected = !!data.round1Rejected || !!data.loginRejected;
      if (rejected) setBlockState({ blocked: true, reason: 'rejected' });
      else setBlockState({ blocked: false });
    });
    return () => unsub();
  }, [user?.uid, userRole]);

  // Listen for coding round completion (roundCompletion/{uid}.completed === true)
  useEffect(() => {
    if (!user?.uid || userRole !== 'user') return;
    const ref = doc(db, "roundCompletion", user.uid);
    const unsub = onSnapshot(ref, (snap) => {
      const data: any = snap.data() || {};
      setCodingCompleted(!!data.completed);
    });
    return () => unsub();
  }, [user?.uid, userRole]);

  // Listen for communication round completion (communicationCompletion/{uid}.completed === true)
  useEffect(() => {
    if (!user?.uid || userRole !== 'user') return;
    const ref = doc(db, "communicationCompletion", user.uid);
    const unsub = onSnapshot(ref, (snap) => {
      const data: any = snap.data() || {};
      setCommCompleted(!!data.completed);
    });
    return () => unsub();
  }, [user?.uid, userRole]);

  // Auto sign-out if ALL rounds are completed: MCQ submitted + coding completed + comm completed
  useEffect(() => {
    if (!user?.uid || userRole !== 'user') return;
    const respRef = doc(db, "responses", user.uid);
    const unsub = onSnapshot(respRef, (snap) => {
      const data: any = snap.data() || {};
      const mcqSubmitted = !!data.round1Submitted;
      const rejected = !!data.round1Rejected || !!data.loginRejected;
      if (!rejected && mcqSubmitted && codingCompleted && commCompleted) {
        // Sign out to return to login page
        handleSignOut();
      }
    });
    return () => unsub();
  }, [user?.uid, userRole, codingCompleted, commCompleted]);

  // If student is blocked, show the new Access Blocked page
  if (userRole === 'user' && blockState.blocked) {
    return <AccessBlockedPage onSignOut={handleSignOut} />;
  }

  // Show camera authentication for students
  if (shouldShowCameraAuth) {
    return <CameraAuthGate onSuccess={handleCameraSuccess} user={user} />;
  }

  // Define all navigation items
  const allNavigationItems = [
    {
      path: "/dashboard",
      icon: LayoutDashboard,
      label: "Dashboard",
      roles: ['hr']
    },
    {
      path: "/ViewScores",
      icon: Trophy,
      label: "View Scores",
      roles: ['hr']
    },
    {
      path: "/questions",
      icon: CheckSquare,
      label: "Question Bank",
      roles: ['hr']
    },
    {
      path: "/MCQRound",
      icon: CheckSquare,
      label: "MCQ Round",
      roles: ['hr', 'user']
    },
    {
      path: "/users",
      icon: Users,
      label: "Users",
      roles: ['hr']
    },
    {
      path: "/AdminMonitor",
      icon: Users,
      label: "Admin Monitor",
      roles: ['hr']
    },
    {
      path: "/ListeningRound",
      icon: Mic,
      label: "Listening Round",
      roles: ['hr', 'user']
    },
    {
      path: "/CommunicationRound",
      icon: MessageSquareTextIcon,
      label: "Communication Round",
      roles: ['hr']
    },
    // {
    //   path: "/AddingMCQs",
    //   icon: MessageSquareTextIcon,
    //   label: "AddingMCQs",
    //   roles: ['hr']
    // },
    // {
    //   path: "/AddingCodingQuestions",
    //   icon: MessageSquareTextIcon,
    //   label: "AddingCodingQs",
    //   roles: ['hr']
    // },

    {
      path: "/Takecomm",
      icon: Mic,
      label: "Take Communication",
      roles: ['hr', 'user']
    },
    
    {
      path: "/CodingRound",
      icon: Code,
      label: "Coding Round",
      roles: ['hr', 'user']
    },
    {
      path: "/chat",
      icon: MessageSquareTextIcon,
      label: "Chat",
      roles: ['hr', 'user']
    },
  ];

  // Filter navigation items based on user role
  const navigationItems = allNavigationItems.filter(item => 
    item.roles.includes(userRole)
  );

  return (
    <div className="flex min-h-screen bg-app text-app">
      {/* Continuous Camera Monitor for Students */}
      {shouldShowContinuousMonitor && <ContinuousCameraMonitor user={user} />}

      {/* Mobile menu button */}
      <button
        onClick={toggleSidebar}
        className="fixed top-4 left-4 z-50 p-3 rounded-xl bg-surface shadow-lg md:hidden transition-all duration-300 hover:scale-105 border border-app"
      >
        {isSidebarOpen ? (
          <X className="h-5 w-5 text-slate-600 dark:text-slate-300" />
        ) : (
          <Menu className="h-5 w-5 text-slate-600 dark:text-slate-300" />
        )}
      </button>

      {/* Sidebar */}
      <aside
  className={`${
    isSidebarOpen ? "translate-x-0" : "-translate-x-full"
  } md:translate-x-0 fixed md:static inset-y-0 left-0 z-40
  transition-all duration-500 ease-in-out
  ${isCollapsed ? "w-20" : "w-80"}
  m-4 md:m-6 rounded-3xl overflow-hidden
  border border-slate-200 dark:border-slate-700
  bg-white/80 dark:bg-slate-900/80 backdrop-blur-md
  shadow-xl flex flex-col`}
>
        {/* Header */}
        <div className="h-24 flex items-center justify-between px-6 border-b border-app bg-surface">
          {!isCollapsed && (
            <div className="flex items-center gap-3">
              <div>
                <h1 className="text-base font-semibold">Exam</h1>
                <p className="text-xs opacity-70"> Portal</p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            {!isCollapsed && (
              <>
                <button 
                  onClick={toggleNotifications} 
                  className="relative p-2 rounded-lg hover:bg-muted transition-colors"
                >
                  <Bell className="w-5 w-5" />
                  {notifications.length > 0 && (
                    <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center animate-pulse">
                      {notifications.length > 9 ? '9+' : notifications.length}
                    </span>
                  )}
                </button>

                <button
                  onClick={toggleTheme}
                  className="p-2 rounded-lg hover:bg-muted transition-colors"
                  title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
                >
                  {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </button>
              </>
            )}

            <button
              onClick={toggleCollapse}
              className="hidden md:block p-2 rounded-lg hover:bg-muted transition-colors"
            >
              {isCollapsed ? (
                <ChevronRight className="h-4 w-4 text-slate-500" />
              ) : (
                <ChevronLeft className="h-4 w-4 text-slate-500" />
              )}
            </button>
          </div>
        </div>

        {/* Notifications */}
        {showNotifications && !isCollapsed && (
          <div className="bg-muted border-b border-app max-h-48 overflow-y-auto animate-slideDown">
            <div className="p-4">
              <h3 className="text-sm font-semibold mb-3">Notifications</h3>
              {notifications.length === 0 ? (
                <p className="text-sm opacity-70">No new notifications</p>
              ) : (
                <div className="space-y-2">
                  {notifications.slice(0, 5).map((note, i) => (
                    <div key={i} className="p-3 bg-surface rounded-xl text-sm border border-app shadow-sm hover:shadow-md transition-shadow">
                      {note}
                    </div>
                  ))}
                  {notifications.length > 5 && (
                    <p className="text-xs opacity-70 text-center pt-2">
                      +{notifications.length - 5} more notifications
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-auto px-3 py-5">
          <div className="space-y-1">
          {navigationItems.map(({ path, icon: Icon, label }) => (
            <Link
              key={path}
              to={path}
              onClick={closeSidebar}
              className={`group relative flex items-center ${isCollapsed ? "justify-center" : "justify-start"} px-3 py-3 rounded-2xl transition-all duration-300 ease-in-out ${
                isActive(path)
                  ? "text-slate-900 dark:text-white"
                  : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
              }`}
              title={isCollapsed ? label : ""}
            >
              {/* Active pill background */}
              <span className={`absolute inset-0 scale-95 rounded-2xl transition-all duration-300 ${
                isActive(path)
                  ? "bg-slate-100 dark:bg-slate-700 shadow-inner"
                  : "opacity-0 group-hover:opacity-100 group-hover:bg-slate-100 dark:group-hover:bg-slate-700"
              }`} />

              <div className={`relative z-10 flex items-center ${isCollapsed ? "" : "gap-3"}`}>
                <div className={`flex h-9 w-9 items-center justify-center rounded-xl transition-colors ${
                  isActive(path) ? "bg-slate-200 dark:bg-slate-600" : "bg-transparent"
                }`}>
                  <Icon className="h-5 w-5" />
                </div>
                {!isCollapsed && (
                  <span className={`font-medium transition-colors ${isActive(path) ? "" : ""}`}>{label}</span>
                )}
              </div>
            </Link>
          ))}
          </div>
        </nav>

        {/* User footer */}
        <div className="border-t border-app p-5 bg-muted">
          {!isCollapsed ? (
            <>
              <div className="flex items-center mb-3">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center font-semibold text-sm">
                  {user?.email?.charAt(0).toUpperCase()}
                </div>
                <div className="ml-3 flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{user?.email}</p>
                  <p className="text-xs opacity-70 truncate">
                    {isStudent && cameraAuthenticated ? "Camera & Mic Active" : "Signed in"}
                  </p>
                </div>
              </div>
              <button
  onClick={handleSignOut}
  className="w-full flex items-center justify-center px-4 py-2 text-sm 
             font-semibold rounded-lg transition-all duration-300 
             bg-blue-600 text-white hover:bg-blue-700 
             dark:bg-blue-500 dark:hover:bg-blue-400 
             hover:scale-[1.02] shadow-sm hover:shadow-md"
>
  <LogOut className="h-4 w-4 mr-2" />
  Sign out
</button>

            </>
          ) : (
            <div className="space-y-3">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center font-semibold text-sm mx-auto">
                {user?.email?.charAt(0).toUpperCase()}
              </div>
              <button
                onClick={handleSignOut}
                className="w-full p-2 rounded-lg transition-all duration-300 flex items-center justify-center hover:bg-muted"
                title="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Overlay for mobile */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-30 md:hidden backdrop-blur-sm"
          onClick={closeSidebar}
        />
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-auto p-6 max-w-full">
        <div className="max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export default Layout;
