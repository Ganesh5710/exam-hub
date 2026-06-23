import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Mic,
  MicOff,
  MonitorUp,
  Phone,
  PhoneOff,
  Send,
  Trash2,
  Users,
  Video,
  VideoOff,
} from "lucide-react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "../lib/firebase";
import { db } from "../lib/firebase";
import { useAuthStore } from "../store/authStore";
import { socket } from "../lib/socket";
type ThreadType = "private" | "broadcast";
type MessageType = "text" | "call_invite";

type ChatUser = {
  uid: string;
  email: string;
  name: string;
};

type ChatThread = {
  threadId: string;
  type: ThreadType;
  participants: string[];
  lastMessage?: string;
  timestamp?: any;
  title?: string;
};

type ChatMessage = {
  id: string;
  senderId: string;
  senderEmail?: string;
  text: string;
  type: MessageType;
  roomName?: string;
  timestamp?: any;
};

const HR_BROADCAST_THREAD_ID = "hr_broadcast";
const HR_EMAILS = new Set(["hr@enkonix.in", "ceo@enkonix.in"]);
const configuration: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun.services.mozilla.com" },
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ],
  iceCandidatePoolSize: 10,
};

const normalizeEmail = (email?: string | null) => (email || "").trim().toLowerCase();

const makePrivateThreadId = (hrUid: string, userUid: string) =>
  `private_${hrUid}_${userUid}`.replace(/[^a-zA-Z0-9_-]/g, "_");

const getMillis = (value: any) => {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return 0;
};

function ChatPage() {
  const { user, userRole } = useAuthStore();
  const isHr = userRole === "hr";
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [privateThreads, setPrivateThreads] = useState<ChatThread[]>([]);
  const [search, setSearch] = useState("");
  const [activeThread, setActiveThread] = useState<ChatThread>({
    threadId: HR_BROADCAST_THREAD_ID,
    type: "broadcast",
    participants: [],
    title: "HR Broadcast",
  });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageText, setMessageText] = useState("");
  const [isCallActive, setIsCallActive] = useState(false);
  const [activeCallRoom, setActiveCallRoom] = useState<string | null>(null);
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);
  const [localVideoEnabled, setLocalVideoEnabled] = useState(false);
  const [remoteVideoEnabled, setRemoteVideoEnabled] = useState(false);
  const [streamVersion, setStreamVersion] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const pc = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const iceCandidatesQueue = useRef<RTCIceCandidateInit[]>([]);
  const callUnsubs = useRef<Array<() => void>>([]);
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const remoteDescriptionReady = useRef(false);
 
  const currentUser = useMemo(() => {
    if (!user?.uid) return null;
    return {
      uid: user.uid,
      email: normalizeEmail(user.email),
      name: user.email || "User",
    };
  }, [user?.uid, user?.email]);

  {/* FIXED BUG: Normalizing lowercase string spaces to permanently strip out multi-UID duplication records */}
  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    const uniqueUsers = new Map<string, ChatUser>();
    users.forEach((item) => {
      if (!item.uid || item.uid === currentUser?.uid) return;
      if (HR_EMAILS.has(normalizeEmail(item.email))) return;
      if (!`${item.name} ${item.uid} ${item.email}`.toLowerCase().includes(term)) return;
      
      const standardizedName = item.name.toLowerCase().replace(/\s+/g, " ").trim();
      const identityKey = normalizeEmail(item.email) || standardizedName;
      uniqueUsers.set(identityKey, item);
    });
    return Array.from(uniqueUsers.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [currentUser?.uid, search, users]);

  const visiblePrivateThreads = useMemo(() => {
    const uniqueThreads = new Map<string, ChatThread>();
    privateThreads
      .filter((thread) => thread.threadId)
      .filter((thread) => thread.type === "private")
      .filter((thread) => !!currentUser?.uid && thread.participants.includes(currentUser.uid))
      .filter((thread) => !thread.participants.every((participantId) => participantId === currentUser?.uid))
      .forEach((thread) => uniqueThreads.set(thread.threadId, thread));

    return Array.from(uniqueThreads.values()).sort((a, b) => getMillis(b.timestamp) - getMillis(a.timestamp));
  }, [currentUser?.uid, privateThreads]);

  const visibleMessages = useMemo(() => {
    const uniqueMessages = new Map<string, ChatMessage>();
    messages.forEach((message) => {
      if (message.id) uniqueMessages.set(message.id, message);
    });
    return Array.from(uniqueMessages.values());
  }, [messages]);



  useEffect(() => {
  if (!user?.uid) return;

  socket.emit("register", user.uid);

  console.log("Registered:", user.uid);
}, [user?.uid]);
  useEffect(() => {
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
  }, [streamVersion, isCallActive, localVideoEnabled]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStreamRef.current) {
      remoteVideoRef.current.srcObject = remoteStreamRef.current;
    }
  }, [streamVersion, isCallActive, remoteVideoEnabled]);

  useEffect(() => {
    return () => {
      void endCall(false);
    };
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    void setDoc(
      doc(db, "chatThreads", HR_BROADCAST_THREAD_ID),
      {
        threadId: HR_BROADCAST_THREAD_ID,
        type: "broadcast",
        participants: ["all"],
        lastMessage: "Broadcast channel ready",
        timestamp: serverTimestamp(),
      },
      { merge: true }
    );
  }, [currentUser]);

  useEffect(() => {
    if (!isHr) return;

    

    const loadUsers = async () => {
      const found = new Map<string, ChatUser>();
      const addUser = (raw: any, fallbackId: string) => {
        const email = normalizeEmail(raw.email);
        const uid = raw.uid || raw.userId || fallbackId;
        if (!uid || !email) return;
        found.set(uid, {
          uid,
          email,
          name: raw.fullName || raw.name || email,
        });
      };

      const [usersSnap, employeesSnap] = await Promise.all([
        getDocs(collection(db, "users")).catch(() => null),
        getDocs(collection(db, "employees")).catch(() => null),
      ]);

      usersSnap?.docs.forEach((item) => addUser(item.data(), item.id));
      employeesSnap?.docs.forEach((item) => addUser(item.data(), item.id));
      setUsers(Array.from(found.values()).sort((a, b) => a.name.localeCompare(b.name)));
    };

    void loadUsers();
  }, [isHr]);

  useEffect(() => {
    if (!currentUser) return;

    const q = query(
      collection(db, "chatThreads"),
      where("participants", "array-contains", currentUser.uid)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const uniqueThreads = new Map<string, ChatThread>();
      
      snapshot.docs.forEach((docItem) => {
        const threadData = docItem.data() as ChatThread;
        uniqueThreads.set(docItem.id, { threadId: docItem.id, ...threadData });
        
        if (threadData.lastMessage === "Video call invite" && !isCallActive && activeCallRoom === null) {
          const signalRef = doc(db, "chatThreads", docItem.id, "callData", "signal");
          void getDoc(signalRef).then((snap) => {
            if (snap.exists()) {
              const data = snap.data();
              if (data?.offer && !data?.answer && data?.createdBy !== currentUser.uid) {
                setActiveCallRoom(docItem.id);
                setActiveThread({
                  threadId: docItem.id,
                  type: "private",
                  participants: threadData.participants,
                  title: isHr ? (threadData.title || "Inbound Link") : "Private Chat with HR"
                });
              }
            }
          });
        }
      });

      if (!isHr) {
        setPrivateThreads(Array.from(uniqueThreads.values()).sort((a, b) => getMillis(b.timestamp) - getMillis(a.timestamp)));
      }
    });

    return () => unsub();
  }, [currentUser, isHr, isCallActive, activeCallRoom]);

  useEffect(() => {
    const q = query(
      collection(db, "chatThreads", activeThread.threadId, "messages"),
      orderBy("timestamp", "asc")
    );

    const unsub = onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as ChatMessage)));
    });

    return () => unsub();
  }, [activeThread.threadId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, activeThread.threadId]);

  const openBroadcast = async () => {
    await setDoc(
      doc(db, "chatThreads", HR_BROADCAST_THREAD_ID),
      {
        threadId: HR_BROADCAST_THREAD_ID,
        type: "broadcast",
        participants: ["all"],
        lastMessage: "Broadcast channel ready",
        timestamp: serverTimestamp(),
      },
      { merge: true }
    );

    setActiveThread({
      threadId: HR_BROADCAST_THREAD_ID,
      type: "broadcast",
      participants: ["all"],
      title: "HR Broadcast",
    });
  };

  const openHrPrivateThread = async (targetUser: ChatUser) => {
    if (!currentUser || !isHr) return;

    const threadId = makePrivateThreadId(currentUser.uid, targetUser.uid);
    const thread: ChatThread = {
      threadId,
      type: "private",
      participants: [currentUser.uid, targetUser.uid],
      title: targetUser.name,
    };

    await setDoc(
      doc(db, "chatThreads", threadId),
      {
        threadId,
        type: "private",
        participants: [currentUser.uid, targetUser.uid],
        participantEmails: [currentUser.email, targetUser.email],
        participantNames: {
          [currentUser.uid]: currentUser.email,
          [targetUser.uid]: targetUser.name,
        },
        lastMessage: "Private chat opened",
        timestamp: serverTimestamp(),
      },
      { merge: true }
    );

    setActiveThread(thread);
  };

  const openUserPrivateThread = (thread: ChatThread) => {
    if (!currentUser || !thread.participants.includes(currentUser.uid)) return;
    setActiveThread({ ...thread, title: "Private Chat with HR" });
  };

  const sendMessage = async (event: FormEvent) => {
    event.preventDefault();
    if (!currentUser || !messageText.trim()) return;
    if (!isHr && activeThread.type === "private" && !activeThread.participants.includes(currentUser.uid)) return;

    const text = messageText.trim();
    setMessageText("");

    await addDoc(collection(db, "chatThreads", activeThread.threadId, "messages"), {
      senderId: currentUser.uid,
      senderEmail: currentUser.email,
      text,
      type: "text",
      timestamp: serverTimestamp(),
    });

    await setDoc(
      doc(db, "chatThreads", activeThread.threadId),
      {
        threadId: activeThread.threadId,
        type: activeThread.type,
        participants: activeThread.type === "broadcast" ? ["all"] : activeThread.participants,
        lastMessage: text,
        timestamp: serverTimestamp(),
      },
      { merge: true }
    );
  };

  const deleteMessage = async (message: ChatMessage) => {
    if (!currentUser || message.senderId !== currentUser.uid || !message.id) return;
    await deleteDoc(doc(db, "chatThreads", activeThread.threadId, "messages", message.id));
  };

  const clearCallListeners = () => {
    callUnsubs.current.forEach((unsub) => unsub());
    callUnsubs.current = [];
  };

  const getInitials = (value?: string) => {
    return (value || "User")
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("");
  };

  const formatMessageDateAndHour = (timestamp: any) => {
    if (!timestamp) return "Sending...";
    const date = timestamp.toMillis ? new Date(timestamp.toMillis()) : new Date(timestamp);
    return date.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    });
  };

  const flushQueuedIceCandidates = async () => {
    if (!pc.current || !remoteDescriptionReady.current || !pc.current.currentRemoteDescription) return;
    const queued = [...iceCandidatesQueue.current];
    iceCandidatesQueue.current = [];

    for (const candidate of queued) {
      try {
        await pc.current.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.warn("ICE candidate skipped safely:", err);
      }
    }
  };

  const addRemoteCandidate = async (candidate: RTCIceCandidateInit) => {
    if (!pc.current) return;
    if (!remoteDescriptionReady.current || !pc.current.currentRemoteDescription) {
      iceCandidatesQueue.current.push(candidate);
      return;
    }
    try {
      await pc.current.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.warn("Skipped route candidate configuration:", err);
    }
  };

  const preparePeerConnection = async (threadId: string, role: "caller" | "callee") => {
    await endCall(false);
    setActiveCallRoom(threadId);
    setIsCallActive(true);
    iceCandidatesQueue.current = [];
    remoteDescriptionReady.current = false;

    const peer = new RTCPeerConnection(configuration);
    const localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    const remoteStream = new MediaStream();

    cameraTrackRef.current = localStream.getVideoTracks()[0] || null;
    localStream.getTracks().forEach((track) => peer.addTrack(track, localStream));
    
    peer.ontrack = (event) => {
      console.log("Remote Track:", event.track.kind);
      const inboundStream = event.streams?.[0] || remoteStream;
      if (!event.streams?.[0] && event.track && !inboundStream.getTracks().some((track) => track.id === event.track.id)) {
        inboundStream.addTrack(event.track);
      }

      remoteStreamRef.current = inboundStream;
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = inboundStream;
      }
      if (event.track.kind === "video") {
        setRemoteVideoEnabled(true);
      }
      setStreamVersion((version) => version + 1);
    };

    pc.current = peer;
    localStreamRef.current = localStream;
    remoteStreamRef.current = remoteStream;
    setMicEnabled(localStream.getAudioTracks()[0]?.enabled ?? true);
    setCameraEnabled(cameraTrackRef.current?.enabled ?? false);
    setLocalVideoEnabled(cameraTrackRef.current?.enabled ?? false);
    setRemoteVideoEnabled(false);
    setScreenSharing(false);
    setIsCallActive(true);
    setStreamVersion((version) => version + 1);

    const signalRef = doc(db, "chatThreads", threadId, "callData", "signal");
    const offerCandidatesRef = collection(
      db,
      "chatThreads",
      threadId,
      "callData",
      "signal",
      "offerCandidates"
    );
    const answerCandidatesRef = collection(
      db,
      "chatThreads",
      threadId,
      "callData",
      "signal",
      "answerCandidates"
    );

    peer.onicecandidate = async (event) => {
      if (!event.candidate) return;
      await addDoc(role === "caller" ? offerCandidatesRef : answerCandidatesRef, event.candidate.toJSON());
    };

    peer.oniceconnectionstatechange = () => {
      if (peer.iceConnectionState === "failed") {
        peer.restartIce?.();
      }
    };

    return { peer, signalRef, offerCandidatesRef, answerCandidatesRef };
  };
// start call()
  const startCall = async () => {
  console.log("START CALL CLICKED");

  if (!currentUser) return;

  if (activeThread.threadId === "hr_broadcast") {
    alert("Video/Audio calls are only allowed in private chats.");
    return;
  }

  const threadId = activeThread.threadId;

  console.log("Thread:", activeThread);

  const { peer, signalRef, answerCandidatesRef } =
    await preparePeerConnection(threadId, "caller");

  const offer = await peer.createOffer();

  await peer.setLocalDescription(offer);

  await setDoc(
    signalRef,
    {
      offer: {
        type: offer.type,
        sdp: offer.sdp,
      },
      answer: null,
      roomName: threadId,
      createdBy: currentUser.uid,
      timestamp: serverTimestamp(),
    },
    { merge: true }
  );

  callUnsubs.current.push(
    onSnapshot(signalRef, async (snapshot) => {
      const answer = snapshot.data()?.answer;

      if (answer && !peer.currentRemoteDescription) {
        await peer.setRemoteDescription(
          new RTCSessionDescription(answer)
        );

        remoteDescriptionReady.current = true;

        await flushQueuedIceCandidates();
      }
    }),

    onSnapshot(answerCandidatesRef, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
          addRemoteCandidate(
            change.doc.data()
          ).catch(console.error);
        }
      });
    })
  );

  await addDoc(
    collection(
      db,
      "chatThreads",
      threadId,
      "messages"
    ),
    {
      senderId: currentUser.uid,
      senderEmail: currentUser.email,
      text: "Video call invite",
      type: "call_invite",
      roomName: threadId,
      timestamp: serverTimestamp(),
    }
  );

  await setDoc(
    doc(db, "chatThreads", threadId),
    {
      threadId,
      type: activeThread.type,
      participants:
        activeThread.type === "broadcast"
          ? ["all"]
          : activeThread.participants,
      lastMessage: "Video call invite",
      timestamp: serverTimestamp(),
    },
    { merge: true }
  );
};


// join call 

 const joinCall = async (roomName: string) => {
  console.log("Joining Room:", roomName);

  setActiveCallRoom(roomName);
  setIsCallActive(true);

  const { peer, signalRef, offerCandidatesRef } =
    await preparePeerConnection(
      roomName,
      "callee"
    );

  const signalSnap = await getDoc(signalRef);

  const offer = signalSnap.data()?.offer;

  if (!offer) {
    console.error("Offer not found");
    return;
  }

  await peer.setRemoteDescription(
    new RTCSessionDescription(offer)
  );

  remoteDescriptionReady.current = true;

  await flushQueuedIceCandidates();

  const answer = await peer.createAnswer();

  await peer.setLocalDescription(answer);

  await setDoc(
    signalRef,
    {
      answer: {
        type: answer.type,
        sdp: answer.sdp,
      },
      answeredAt: serverTimestamp(),
    },
    { merge: true }
  );

  callUnsubs.current.push(
    onSnapshot(offerCandidatesRef, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
          addRemoteCandidate(
            change.doc.data()
          ).catch(console.error);
        }
      });
    })
  );
};

  const toggleMicrophone = () => {
    const audioTrack = localStreamRef.current?.getAudioTracks()[0];
    if (!audioTrack) return;
    audioTrack.enabled = !audioTrack.enabled;
    setMicEnabled(audioTrack.enabled);
  };

  const toggleCamera = () => {
    const videoTrack = localStreamRef.current?.getVideoTracks()[0];
    if (!videoTrack) return;
    videoTrack.enabled = !videoTrack.enabled;
    setCameraEnabled(videoTrack.enabled);
    setLocalVideoEnabled(videoTrack.enabled);
  };

  const replaceOutboundVideoTrack = async (track: MediaStreamTrack | null) => {
    const sender = pc.current?.getSenders().find((item) => item.track?.kind === "video");
    if (sender) await sender.replaceTrack(track);
  };

  const startScreenShare = async () => {
    if (!pc.current || !localStreamRef.current) return;
    const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    const screenTrack = displayStream.getVideoTracks()[0];
    const cameraTrack = cameraTrackRef.current;
    if (!screenTrack) return;

    screenTrackRef.current = screenTrack;
    await replaceOutboundVideoTrack(screenTrack);
    localStreamRef.current = new MediaStream([screenTrack, ...localStreamRef.current.getAudioTracks()]);
    setScreenSharing(true);
    setCameraEnabled(true);
    setLocalVideoEnabled(true);
    setStreamVersion((version) => version + 1);

    screenTrack.onended = async () => {
      await replaceOutboundVideoTrack(cameraTrack);
      screenTrackRef.current = null;
      setScreenSharing(false);
      if (cameraTrack && localStreamRef.current) {
        localStreamRef.current = new MediaStream([cameraTrack, ...localStreamRef.current.getAudioTracks()]);
        setCameraEnabled(cameraTrack.enabled);
        setLocalVideoEnabled(cameraTrack.enabled);
        setStreamVersion((version) => version + 1);
      }
    };
  };

  const endCall = async (clearSignal = true) => {
    clearCallListeners();
    pc.current?.close();
    pc.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    remoteStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenTrackRef.current?.stop();
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    cameraTrackRef.current = null;
    screenTrackRef.current = null;
    iceCandidatesQueue.current = [];
    remoteDescriptionReady.current = false;
    setMicEnabled(true);
    setCameraEnabled(true);
    setLocalVideoEnabled(false);
    setRemoteVideoEnabled(false);
    setScreenSharing(false);
    setIsCallActive(false);
    setActiveCallRoom(null);
    setStreamVersion((version) => version + 1);

    if (!clearSignal) return;

    const signalRef = doc(db, "chatThreads", activeThread.threadId, "callData", "signal");
    const offerCandidatesRef = collection(
      db,
      "chatThreads",
      activeThread.threadId,
      "callData",
      "signal",
      "offerCandidates"
    );
    const answerCandidatesRef = collection(
      db,
      "chatThreads",
      activeThread.threadId,
      "callData",
      "signal",
      "answerCandidates"
    );
    const [offerCandidates, answerCandidates] = await Promise.all([
      getDocs(offerCandidatesRef).catch(() => null),
      getDocs(answerCandidatesRef).catch(() => null),
    ]);

    await Promise.all([
      ...(offerCandidates?.docs.map((item) => deleteDoc(item.ref)) || []),
      ...(answerCandidates?.docs.map((item) => deleteDoc(item.ref)) || []),
      deleteDoc(signalRef).catch(() => undefined),
    ]);
  };

  {/* UPGRADED CALL HANDLING MODULE: Intercepts active ringing state on incoming invitations so callee can lift or drop calls */}
  if (activeCallRoom && !isCallActive) {
    return (
      <div className="h-[calc(100vh-48px)] w-full bg-[#1e1f22] rounded-xl flex flex-col items-center justify-center text-white p-6 space-y-6 shadow-2xl relative overflow-hidden">
        <div className="relative flex items-center justify-center">
          <div className="w-20 h-20 rounded-full bg-[#464775] flex items-center justify-center text-2xl font-bold border-2 border-white/10 animate-bounce">
            {getInitials(activeThread.title)}
          </div>
          <div className="absolute w-24 h-24 border-2 border-blue-500 rounded-full animate-ping pointer-events-none" />
        </div>
        <div className="text-center space-y-1">
          <h3 className="text-md font-bold tracking-wide text-slate-200">{activeThread.title}</h3>
          <p className="text-xs text-blue-400 font-bold uppercase tracking-widest animate-pulse">Incoming Call...</p>
        </div>
        <div className="flex items-center gap-4 pt-2">
          <button 
            type="button"
            onClick={() => void joinCall(activeCallRoom)}
            className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg shadow-lg shadow-emerald-900/30 flex items-center gap-2 transition-all"
          >
            Accept Call
          </button>
          <button 
            type="button"
            onClick={() => void endCall(true)}
            className="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-lg shadow-lg shadow-red-900/30 flex items-center gap-2 transition-all"
          >
            Decline
          </button>
        </div>
      </div>
    );
  }

  if (isCallActive || activeCallRoom) {
    return (
      <div className="relative h-[calc(100vh-48px)] overflow-hidden rounded-lg bg-[#1f1f1f]">
        <div className="flex h-full items-center justify-center p-6 pb-28">
          <div className="relative flex aspect-video w-full max-w-6xl items-center justify-center overflow-hidden rounded-lg bg-neutral-900 shadow-2xl">
            {/* FIXED BUG: Keeping element explicitly mounted in DOM to guarantee WebRTC streams bind to refs immediately */}
            <video 
              ref={remoteVideoRef} 
              autoPlay 
              playsInline 
              className={`h-full w-full object-cover ${remoteVideoEnabled ? "block" : "hidden"}`} 
            />
            {!remoteVideoEnabled && (
              <div className="flex h-32 w-32 items-center justify-center rounded-full bg-blue-700 text-4xl font-bold text-white">
                {getInitials(activeThread.title || activeCallRoom || "Remote User")}
              </div>
            )}
            <div className="absolute left-4 top-4 rounded bg-black/60 px-3 py-1 text-xs font-medium text-white">
              Remote
            </div>
          </div>
        </div>

        <div className="absolute bottom-6 right-6 z-10 w-52 scale-x-[-1] overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900 shadow-xl">
          <div className="aspect-video relative">
            {/* FIXED BUG: Keeping element explicitly mounted in DOM to guarantee WebRTC streams bind to refs immediately */}
            <video 
              ref={localVideoRef} 
              autoPlay 
              playsInline 
              muted 
              className={`h-full w-full object-cover ${localVideoEnabled ? "block" : "hidden"}`} 
            />
            {!localVideoEnabled && (
              <div className="flex h-full w-full scale-x-[-1] items-center justify-center bg-neutral-800 absolute inset-0">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-700 text-lg font-bold text-white">
                  {getInitials(currentUser?.name)}
                </div>
              </div>
            )}
          </div>
          <div className="absolute left-2 top-2 scale-x-[-1] rounded bg-black/60 px-2 py-0.5 text-xs text-white">
            You
          </div>
        </div>

        <div className="absolute bottom-8 left-1/2 z-20 flex -translate-x-1/2 items-center gap-5 rounded-full border border-neutral-800 bg-neutral-900/90 px-7 py-4 shadow-2xl backdrop-blur-md">
          <button
            type="button"
            onClick={toggleMicrophone}
            className={`flex h-11 w-11 items-center justify-center rounded-full border text-white ${
              micEnabled ? "border-neutral-700 bg-neutral-800 hover:bg-neutral-700" : "border-red-500 bg-red-600 hover:bg-red-700"
            }`}
            title={micEnabled ? "Mute microphone" : "Unmute microphone"}
          >
            {micEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
          </button>
          <button
            type="button"
            onClick={toggleCamera}
            className={`flex h-11 w-11 items-center justify-center rounded-full border text-white ${
              cameraEnabled ? "border-neutral-700 bg-neutral-800 hover:bg-neutral-700" : "border-red-500 bg-red-600 hover:bg-red-700"
            }`}
            title={cameraEnabled ? "Turn camera off" : "Turn camera on"}
          >
            {cameraEnabled ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
          </button>
          <button
            type="button"
            onClick={startScreenShare}
            className={`flex h-11 w-11 items-center justify-center rounded-full border text-white ${
              screenSharing ? "border-blue-500 bg-blue-600" : "border-neutral-700 bg-neutral-800 hover:bg-neutral-700"
            }`}
            title="Share screen"
          >
            <MonitorUp className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => void endCall()}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-red-600 text-white shadow-lg hover:bg-red-700"
            title="End call"
          >
            <PhoneOff className="h-5 w-5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-48px)] overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <div className="grid h-full grid-cols-1 md:grid-cols-[320px_1fr]">
        <aside className="min-h-0 overflow-y-auto border-r border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950">
          <div className="border-b border-slate-200 p-4 dark:border-slate-700">
            <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Chat</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {isHr ? "Broadcasts and private user threads" : "HR broadcast and your HR thread"}
            </p>
          </div>

          <div className="space-y-2 p-3">
            <button
              type="button"
              onClick={() => void openBroadcast()}
              className={`w-full rounded-md px-3 py-2 text-left text-sm ${
                activeThread.threadId === HR_BROADCAST_THREAD_ID
                  ? "bg-blue-600 text-white"
                  : "bg-white text-slate-800 hover:bg-blue-50 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              <div className="font-medium">HR Broadcast</div>
              <div className="text-xs opacity-75">Visible to every standard user</div>
            </button>

            {isHr ? (
              <>
                <button
                  type="button"
                  onClick={() => void openBroadcast()}
                  className="flex w-full items-center justify-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  <Users className="h-4 w-4" />
                  Broadcast to All Users
                </button>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by name or ID..."
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
                {filteredUsers.map((item) => (
                  <button
                    key={item.uid}
                    type="button"
                    onClick={() => void openHrPrivateThread(item)}
                    className="w-full rounded-md bg-white px-3 py-2 text-left text-sm text-slate-800 hover:bg-blue-50 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
                  >
                    <div className="truncate font-medium">{item.name}</div>
                    <div className="truncate text-xs text-slate-500">{item.uid}</div>
                  </button>
                ))}
              </>
            ) : (
              <>
                <div className="pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Private HR chat
                </div>
                {visiblePrivateThreads.length === 0 ? (
                  <div className="rounded-md bg-white p-3 text-sm text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                    HR has not opened a private chat with you yet.
                  </div>
                ) : (
                  visiblePrivateThreads.map((thread) => (
                    <button
                      key={thread.threadId}
                      type="button"
                      onClick={() => openUserPrivateThread(thread)}
                      className={`w-full rounded-md px-3 py-2 text-left text-sm ${
                        activeThread.threadId === thread.threadId
                          ? "bg-blue-600 text-white"
                          : "bg-white text-slate-800 hover:bg-blue-50 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
                      }`}
                    >
                      <div className="font-medium">Private Chat with HR</div>
                      <div className="truncate text-xs opacity-75">{thread.lastMessage || "Open conversation"}</div>
                    </button>
                  ))
                )}
              </>
            )}
          </div>
        </aside>

        <main className="flex min-h-0 flex-col">
          <header className="flex items-center justify-between gap-3 border-b border-slate-200 p-4 dark:border-slate-700">
            <div>
              <h2 className="font-semibold text-slate-900 dark:text-white">{activeThread.title}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {activeThread.type === "broadcast" ? "Broadcast thread" : "Private 1-on-1 thread"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void startCall()}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-slate-100 text-slate-700 hover:bg-blue-100 hover:text-blue-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-blue-900"
                title="Start video call"
              >
                <Video className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => void startCall()}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-slate-100 text-slate-700 hover:bg-green-100 hover:text-green-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-green-900"
                title="Start audio call"
              >
                <Phone className="h-4 w-4" />
              </button>
            </div>
          </header>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4 dark:bg-slate-950">
            {messages.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">
                No messages yet.
              </div>
            ) : (
              visibleMessages.map((message) => {
                const mine = message.senderId === currentUser?.uid;
                const callRoomName = message.roomName;
                return (
                  <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`group relative max-w-[75%] rounded-lg px-4 py-2 text-sm ${
                        mine ? "bg-blue-600 text-white" : "bg-white text-slate-900 dark:bg-slate-800 dark:text-white"
                      }`}
                    >
                      {mine && (
                        <button
                          type="button"
                          onClick={() => void deleteMessage(message)}
                          className="absolute -left-8 top-1/2 hidden h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600 group-hover:flex dark:hover:bg-red-950/40"
                          title="Delete message"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {!mine && <div className="mb-1 text-xs opacity-70">{message.senderEmail || "HR"}</div>}
                      <div className="whitespace-pre-wrap break-words">{message.text}</div>
                      
                      <span className={`text-[9px] block text-right mt-1 opacity-60 ${mine ? "text-blue-100" : "text-slate-400"}`}>
                        {formatMessageDateAndHour(message.timestamp)}
                      </span>

                      {message.type === "call_invite" && (
                        <button
                          type="button"
                          onClick={() => {
                            if (callRoomName) void joinCall(callRoomName);
                          }}
                          disabled={!callRoomName}
                          className={`mt-3 rounded-md px-3 py-1.5 text-xs font-semibold ${
                            mine ? "bg-white text-blue-700" : "bg-blue-600 text-white hover:bg-blue-700"
                          } disabled:cursor-not-allowed disabled:opacity-60`}
                        >
                          Join Meeting
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={sendMessage} className="flex gap-2 border-t border-slate-200 p-4 dark:border-slate-700">
            <input
              value={messageText}
              onChange={(event) => setMessageText(event.target.value)}
              placeholder="Type a message..."
              className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
            <button
              type="submit"
              disabled={!messageText.trim()}
              className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-blue-600 text-white disabled:bg-slate-400"
              title="Send message"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </main>
      </div>
    </div>
  );
}

export default ChatPage;