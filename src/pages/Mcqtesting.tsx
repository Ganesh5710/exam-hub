import React, { useEffect, useRef, useState } from "react";
import { collection, onSnapshot, doc, getDoc, setDoc, addDoc, onSnapshot as onSnapshotFirestore } from "../lib/firebase";
import { db } from "../lib/firebase";
import { motion } from "framer-motion";
import {
  Users,
  Eye,
  EyeOff,
  Volume2,
  VolumeX,
  RefreshCw,
  User,
  Monitor,
  AlertTriangle,
  CheckCircle,
  XCircle,
} from "lucide-react";

interface Student {
  uid: string;
  email?: string;
  displayName?: string;
  round1Submitted?: boolean;
  round1Rejected?: boolean;
  examDuration?: number;
  violations?: number;
}

interface StudentStream {
  student: Student;
  stream: MediaStream | null;
  connected: boolean;
  peerConnection: RTCPeerConnection | null;
  offerUnsubscribe?: () => void;
}

const Mcqtesting: React.FC = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [studentStreams, setStudentStreams] = useState<Map<string, StudentStream>>(new Map());
  const [loading, setLoading] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [showModal, setShowModal] = useState(false);
  const videoRefs = useRef<Map<string, HTMLVideoElement | null>>(new Map());

  // Fetch all students from Firebase
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "users"), async (snapshot) => {
      const studentsList: Student[] = [];
      
      for (const docSnapshot of snapshot.docs) {
        const userData = docSnapshot.data();
        const student: Student = {
          uid: docSnapshot.id,
          email: userData.email,
          displayName: userData.displayName || userData.email?.split('@')[0] || 'Unknown',
        };

        try {
          const responseDoc = await getDoc(doc(db, "responses", docSnapshot.id));
          if (responseDoc.exists()) {
            const responseData = responseDoc.data();
            student.round1Submitted = responseData.round1Submitted;
            student.round1Rejected = responseData.round1Rejected;
            student.examDuration = responseData.round1?.examDuration;
            // Fixed: Check multiple possible violation fields
            student.violations = responseData.round1?.violations || 
                               responseData.violations || 
                               responseData.loginViolations || 
                               0;
          }
        } catch (error) {
          console.error("Error fetching response data:", error);
        }

        studentsList.push(student);
      }

      setStudents(studentsList);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Initialize and manage WebRTC streams
  useEffect(() => {
    if (!autoRefresh) return;

    const newStreams = new Map(studentStreams);

    // Initialize streams for new students
    students.forEach(student => {
      if (!newStreams.has(student.uid)) {
        initializeStudentStream(student, newStreams);
      }
    });

    // Clean up streams for students no longer in the list
    Array.from(newStreams.keys()).forEach(uid => {
      if (!students.find(s => s.uid === uid)) {
        const streamData = newStreams.get(uid);
        if (streamData) {
          cleanupStream(streamData);
        }
        newStreams.delete(uid);
        videoRefs.current.delete(uid);
      }
    });

    setStudentStreams(newStreams);
  }, [students, autoRefresh]);

  // Properly cleanup on component unmount only
  useEffect(() => {
    return () => {
      studentStreams.forEach(cleanupStream);
      videoRefs.current.clear();
    };
  }, []);

  // Monitor streams and reattempt connection if inactive
  useEffect(() => {
    const interval = setInterval(() => {
      if (!autoRefresh) return;
      const updatedStreams = new Map(studentStreams);
      students.forEach(student => {
        const streamData = updatedStreams.get(student.uid);
        if (streamData && streamData.stream && !streamData.stream.active && !streamData.student.round1Submitted && !streamData.student.round1Rejected) {
          console.log(`[Admin] Stream inactive for ${student.uid}, attempting reconnect`);
          refreshStudentStream(student.uid);
        }
      });
    }, 5000);

    return () => clearInterval(interval);
  }, [studentStreams, autoRefresh, students]);

  // Update video elements when streams change
  useEffect(() => {
    studentStreams.forEach((streamData, studentId) => {
      const videoElement = videoRefs.current.get(studentId);
      if (videoElement && streamData.stream && streamData.stream.active && videoElement.srcObject !== streamData.stream) {
        videoElement.srcObject = streamData.stream;
        videoElement.play().catch(error => {
          if (!(error && (error as any).name === 'AbortError')) {
            console.error(`[Admin] Error playing video for ${studentId}:`, error);
          }
        });
      }
    });
  }, [studentStreams]);

  const initializeStudentStream = async (student: Student, streamsMap: Map<string, StudentStream>) => {
    const studentId = student.uid;
    const callId = `examStream_${studentId}`;
    
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });

    const studentStream: StudentStream = {
      student,
      stream: null,
      connected: false,
      peerConnection: pc,
    };

    streamsMap.set(studentId, studentStream);

    pc.ontrack = (event) => {
      console.log(`[Admin] Received track from ${studentId}`, event);
      const stream = event.streams[0];
      if (stream) {
        setStudentStreams(prev => {
          const updated = new Map(prev);
          const existing = updated.get(studentId);
          if (existing) {
            existing.stream = stream;
            existing.connected = stream.active;
            updated.set(studentId, existing);
          }
          return updated;
        });

        const videoElement = videoRefs.current.get(studentId);
        if (videoElement) {
          videoElement.srcObject = stream;
          videoElement.play().catch(error => {
            if (!(error && (error as any).name === 'AbortError')) {
              console.error(`[Admin] Error playing video for ${studentId}:`, error);
            }
          });
        }
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`[Admin] ICE connection state for ${studentId}:`, pc.iceConnectionState);
      setStudentStreams(prev => {
        const updated = new Map(prev);
        const existing = updated.get(studentId);
        if (existing) {
          existing.connected = pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed";
          updated.set(studentId, existing);
        }
        return updated;
      });

      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
        try {
          // Attempt to recover the connection without full teardown
          (pc as any).restartIce?.();
        } catch (e) {
          // no-op
        }
        // If still not recovered shortly after, perform a targeted refresh
        setTimeout(() => {
          if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
            refreshStudentStream(studentId);
          }
        }, 2000);
      }
    };

    try {
      const callDoc = doc(db, "calls", callId);
      const answerCandidates = collection(callDoc, "answerCandidates");
      
      // Monitor for offer in real-time
      const offerUnsubscribe = onSnapshotFirestore(callDoc, async (snapshot) => {
        const data = snapshot.data();
        
        if (!data?.offer) {
          console.log(`[Admin] Waiting for offer from ${studentId}...`);
          return;
        }

        // If we already processed this offer, skip
        if (pc.remoteDescription) {
          console.log(`[Admin] Offer already processed for ${studentId}`);
          return;
        }

        console.log(`[Admin] Received offer from ${studentId}`, data.offer);

        try {
          const offerDescription = new RTCSessionDescription(data.offer);
          await pc.setRemoteDescription(offerDescription);

          const answerDescription = await pc.createAnswer();
          await pc.setLocalDescription(answerDescription);

          const answer = {
            type: answerDescription.type,
            sdp: answerDescription.sdp,
          };
          
          await setDoc(callDoc, { answer }, { merge: true });
          console.log(`[Admin] Sent answer to ${studentId}`);

        } catch (error) {
          console.error(`[Admin] Error processing offer from ${studentId}:`, error);
        }
      });

      // Listen for ICE candidates from student
      const offerCandidates = collection(callDoc, "offerCandidates");
      const candidateUnsubscribe = onSnapshotFirestore(offerCandidates, (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
          if (change.type === "added") {
            const candidate = new RTCIceCandidate(change.doc.data());
            try {
              await pc.addIceCandidate(candidate);
              console.log(`[Admin] Added ICE candidate from ${studentId}`);
            } catch (error) {
              console.error(`[Admin] Error adding ICE candidate from ${studentId}:`, error);
            }
          }
        });
      });

      // Send our ICE candidates
      pc.onicecandidate = async (event) => {
        if (event.candidate) {
          console.log(`[Admin] Sending ICE candidate to ${studentId}`);
          await addDoc(answerCandidates, event.candidate.toJSON());
        }
      };

      studentStream.offerUnsubscribe = () => {
        offerUnsubscribe();
        candidateUnsubscribe();
      };

      studentStream.peerConnection = pc;

    } catch (error) {
      console.error(`[Admin] Error setting up stream for ${studentId}:`, error);
      cleanupStream(studentStream);
      streamsMap.delete(studentId);
      setStudentStreams(new Map(streamsMap));
    }
  };

  const cleanupStream = (streamData: StudentStream) => {
    if (streamData.offerUnsubscribe) {
      streamData.offerUnsubscribe();
    }
    if (streamData.peerConnection) {
      streamData.peerConnection.close();
    }
    if (streamData.stream) {
      streamData.stream.getTracks().forEach(track => track.stop());
    }
  };

  const refreshStudentStream = (studentId: string) => {
    const streamData = studentStreams.get(studentId);
    if (streamData) {
      cleanupStream(streamData);
      
      const student = students.find(s => s.uid === studentId);
      if (student) {
        const newStreams = new Map(studentStreams);
        newStreams.delete(studentId);
        setStudentStreams(newStreams);
        
        setTimeout(() => {
          const updatedStreams = new Map(newStreams);
          initializeStudentStream(student, updatedStreams);
          setStudentStreams(updatedStreams);
        }, 1000);
      }
    }
  };

  const refreshAllStreams = () => {
    studentStreams.forEach(cleanupStream);
    const newStreams = new Map();
    setStudentStreams(newStreams);
    
    setTimeout(() => {
      students.forEach(student => {
        initializeStudentStream(student, newStreams);
      });
      setStudentStreams(newStreams);
    }, 2000);
  };

  const getStatusColor = (student: Student) => {
    if (student.round1Rejected) return "text-red-500";
    if (student.round1Submitted) return "text-green-500";
    return "text-blue-500";
  };

  const getStatusText = (student: Student) => {
    if (student.round1Rejected) return "Rejected";
    if (student.round1Submitted) return "Submitted";
    return "In Progress";
  };

  const getStatusIcon = (student: Student) => {
    if (student.round1Rejected) return <XCircle className="w-4 h-4" />;
    if (student.round1Submitted) return <CheckCircle className="w-4 h-4" />;
    return <RefreshCw className="w-4 h-4" />;
  };

  const openStudentModal = (student: Student) => {
    setSelectedStudent(student);
    setShowModal(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading students...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 dark:from-slate-900 dark:to-slate-800 p-6">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-blue-600 rounded-2xl shadow-lg">
              <Users className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                Live Exam Monitoring
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                Monitoring {students.length} student{students.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`p-3 rounded-2xl transition-all duration-300 ${
                soundEnabled 
                  ? "bg-green-100 text-green-600 dark:bg-green-900/50 dark:text-green-400" 
                  : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400"
              } shadow-lg hover:shadow-xl`}
            >
              {soundEnabled ? <Volume2 className="w-6 h-6" /> : <VolumeX className="w-6 h-6" />}
            </button>

            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`p-3 rounded-2xl transition-all duration-300 ${
                autoRefresh 
                  ? "bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400" 
                  : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400"
              } shadow-lg hover:shadow-xl`}
            >
              {autoRefresh ? <Eye className="w-6 h-6" /> : <EyeOff className="w-6 h-6" />}
            </button>

            <button
              onClick={refreshAllStreams}
              className="p-3 bg-orange-100 text-orange-600 dark:bg-orange-900/50 dark:text-orange-400 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300"
            >
              <RefreshCw className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-lg border border-blue-200 dark:border-blue-800">
            <div className="flex items-center space-x-3">
              <Users className="w-8 h-8 text-blue-600" />
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{students.length}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total Students</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-lg border border-green-200 dark:border-green-800">
            <div className="flex items-center space-x-3">
              <CheckCircle className="w-8 h-8 text-green-600" />
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {students.filter(s => s.round1Submitted && !s.round1Rejected).length}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">Submitted</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-lg border border-blue-200 dark:border-blue-800">
            <div className="flex items-center space-x-3">
              <RefreshCw className="w-8 h-8 text-blue-600" />
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {students.filter(s => !s.round1Submitted && !s.round1Rejected).length}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">In Progress</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-lg border border-red-200 dark:border-red-800">
            <div className="flex items-center space-x-3">
              <XCircle className="w-8 h-8 text-red-600" />
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {students.filter(s => s.round1Rejected).length}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">Rejected</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Student Grid */}
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {students.map((student) => {
            const streamData = studentStreams.get(student.uid);
            const isConnected = streamData?.connected || false;
            const stream = streamData?.stream;

            return (
              <motion.div
                key={student.uid}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden border border-gray-200 dark:border-slate-700"
              >
                {/* Student Video */}
                <div className="relative bg-black aspect-video">
                  {stream && stream.active ? (
                    <video
                      ref={video => {
                        videoRefs.current.set(student.uid, video);
                        if (video && stream && stream.active && video.srcObject !== stream) {
                          video.srcObject = stream;
                          video.play().catch(error => {
                            if (!(error && (error as any).name === 'AbortError')) {
                              console.error(`[Admin] Error playing video for ${student.uid}:`, error);
                            }
                          });
                        }
                      }}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gray-900">
                      <div className="text-center">
                        <Monitor className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                        <p className="text-gray-500 text-sm">
                          {isConnected ? "Connecting..." : "No stream"}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Connection Status */}
                  <div className={`absolute top-3 right-3 px-2 py-1 rounded-full text-xs font-medium ${
                    isConnected 
                      ? "bg-green-500 text-white" 
                      : "bg-red-500 text-white"
                  }`}>
                    {isConnected ? "LIVE" : "OFFLINE"}
                  </div>

                  {/* Violations Badge */}
                  {student.violations && student.violations > 0 && (
                    <div className="absolute top-3 left-3 px-2 py-1 bg-red-500 text-white rounded-full text-xs font-medium">
                      {student.violations} violation{student.violations !== 1 ? 's' : ''}
                    </div>
                  )}
                </div>

                {/* Student Info */}
                <div className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                        {student.displayName}
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                        {student.email}
                      </p>
                    </div>
                    <div className={`flex items-center space-x-1 ${getStatusColor(student)}`}>
                      {getStatusIcon(student)}
                      <span className="text-xs font-medium">{getStatusText(student)}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-400 mb-3">
                    <div className="flex items-center space-x-1">
                      <User className="w-3 h-3" />
                      <span className="truncate" title={student.uid}>
                        ID: {student.uid.substring(0, 8)}...
                      </span>
                    </div>
                    {student.examDuration && (
                      <div className="flex items-center space-x-1">
                        <RefreshCw className="w-3 h-3" />
                        <span>{Math.floor(student.examDuration / 60)}m</span>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex space-x-2">
                    <button
                      onClick={() => openStudentModal(student)}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 px-3 rounded-xl text-sm font-medium transition-colors duration-200"
                    >
                      View Details
                    </button>
                    
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {students.length === 0 && (
          <div className="text-center py-12">
            <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              No Students Found
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              Students will appear here when they start their exams.
            </p>
          </div>
        )}
      </div>

      {/* Student Detail Modal */}
      {showModal && selectedStudent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden"
          >
            <div className="p-6 border-b border-gray-200 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Student Details
                </h2>
                <button
                  onClick={() => setShowModal(false)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-xl transition-colors duration-200"
                >
                  <XCircle className="w-6 h-6 text-gray-500" />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-auto">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Video Feed */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Live Camera Feed
                  </h3>
                  <div className="bg-black rounded-2xl aspect-video overflow-hidden">
                    {(() => {
                      const streamData = studentStreams.get(selectedStudent.uid);
                      const stream = streamData?.stream;
                      
                      return stream && stream.active ? (
                        <video
                          ref={video => {
                            videoRefs.current.set(selectedStudent.uid, video);
                            if (video && stream && stream.active && video.srcObject !== stream) {
                              video.srcObject = stream;
                              video.play().catch(error => {
                                if (!(error && (error as any).name === 'AbortError')) {
                                  console.error(`[Admin] Error playing video for ${selectedStudent.uid}:`, error);
                                }
                              });
                            }
                          }}
                          autoPlay
                          playsInline
                          muted
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gray-900">
                          <div className="text-center">
                            <Monitor className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                            <p className="text-gray-500">No live stream available</p>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Student Information */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Student Information
                  </h3>
                  
                  <div className="space-y-4">
                    <div className="bg-gray-50 dark:bg-slate-700 rounded-2xl p-4">
                      <h4 className="font-medium text-gray-900 dark:text-white mb-2">Basic Info</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Name:</span>
                          <span className="text-gray-900 dark:text-white font-medium">
                            {selectedStudent.displayName}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Email:</span>
                          <span className="text-gray-900 dark:text-white">{selectedStudent.email}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Student ID:</span>
                          <span className="text-gray-900 dark:text-white font-mono text-xs">
                            {selectedStudent.uid}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-gray-50 dark:bg-slate-700 rounded-2xl p-4">
                      <h4 className="font-medium text-gray-900 dark:text-white mb-2">Exam Status</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Status:</span>
                          <span className={`font-medium ${getStatusColor(selectedStudent)}`}>
                            {getStatusText(selectedStudent)}
                          </span>
                        </div>
                        {selectedStudent.examDuration && (
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">Exam Duration:</span>
                            <span className="text-gray-900 dark:text-white">
                              {Math.floor(selectedStudent.examDuration / 60)}m {selectedStudent.examDuration % 60}s
                            </span>
                          </div>
                        )}
                        {selectedStudent.violations !== undefined && (
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">Violations:</span>
                            <span className={`font-medium ${
                              selectedStudent.violations > 0 ? "text-red-600" : "text-green-600"
                            }`}>
                              {selectedStudent.violations}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {selectedStudent.violations && selectedStudent.violations > 0 && (
                      <div className="bg-red-50 dark:bg-red-900/20 rounded-2xl p-4 border border-red-200 dark:border-red-800">
                        <div className="flex items-center space-x-2 mb-2">
                          <AlertTriangle className="w-5 h-5 text-red-600" />
                          <h4 className="font-medium text-red-800 dark:text-red-400">Violation Alert</h4>
                        </div>
                        <p className="text-sm text-red-700 dark:text-red-300">
                          This student has {selectedStudent.violations} violation{selectedStudent.violations !== 1 ? 's' : ''} recorded.
                          {selectedStudent.violations >= 5 && " Exam has been rejected due to excessive violations."}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default Mcqtesting;
// working