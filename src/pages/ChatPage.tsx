import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Camera,
  CameraOff,
  Check,
  Circle,
  MonitorUp,
  MoreVertical,
  Phone,
  PhoneCall,
  PhoneOff,
  Radio,
  Search,
  Send,
  Trash2,
  Users,
  Volume2,
  Wifi,
  WifiOff,
  Mic,
  MicOff,
} from "lucide-react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "../lib/firebase";
import { db } from "../lib/firebase";
import { socket } from "../lib/socket";
import { useAuthStore } from "../store/authStore";

type ThreadType = "private" | "broadcast";
type MessageType = "text" | "call_event";
type MediaMode = "audio" | "video";

enum CallState {
  Idle = "idle",
  Calling = "calling",
  Ringing = "ringing",
  Connecting = "connecting",
  Connected = "connected",
  Reconnecting = "reconnecting",
  Rejected = "rejected",
  Missed = "missed",
  Ended = "ended",
}

interface ChatUser {
  uid: string;
  email: string;
  name: string;
  role?: string;
  online?: boolean;
  lastSeen?: number;
}

interface ChatThread {
  threadId: string;
  type: ThreadType;
  participants: string[];
  participantNames?: Record<string, string>;
  participantEmails?: Record<string, string>;
  title?: string;
  lastMessage?: string;
  lastMessageAt?: any;
  timestamp?: any;
  unreadBy?: Record<string, number>;
  typing?: Record<string, number>;
}

interface ChatMessage {
  id: string;
  senderId: string;
  senderEmail?: string;
  text: string;
  type: MessageType;
  callId?: string;
  timestamp?: any;
  deleted?: boolean;
}

interface IncomingCall {
  callId: string;
  threadId: string;
  callerUid: string;
  callerName: string;
  callerEmail?: string;
  participantUids: string[];
  mode: MediaMode;
}

interface CallParticipant {
  uid: string;
  name: string;
  stream?: MediaStream;
  micEnabled: boolean;
  cameraEnabled: boolean;
  screenSharing: boolean;
  speaking: boolean;
  connectionState: RTCPeerConnectionState | "new";
  videoQuality: "HD" | "SD" | "Audio";
}

interface PeerBundle {
  peer: RTCPeerConnection;
  remoteStream: MediaStream;
  queuedIce: RTCIceCandidateInit[];
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
}

const HR_BROADCAST_THREAD_ID = "hr_broadcast";
const HR_EMAILS = new Set(["hr@enkonix.in", "ceo@enkonix.in"]);
const MISSED_CALL_MS = 30_000;
const TYPING_TTL_MS = 4_000;

const rtcConfiguration: RTCConfiguration = {
  iceServers: [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
    {
      urls: ["turn:openrelay.metered.ca:80", "turn:openrelay.metered.ca:443"],
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ],
  iceCandidatePoolSize: 10,
};

const normalizeEmail = (email?: string | null) => (email || "").trim().toLowerCase();
const now = () => Date.now();
const getMillis = (value: any) => {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  return 0;
};

const getPrivateThreadId = (uidA: string, uidB: string) =>
  `private_${[uidA, uidB].sort().join("_")}`.replace(/[^a-zA-Z0-9_-]/g, "_");

const getInitials = (value?: string) =>
  (value || "User")
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

const formatTime = (timestamp: any) => {
  const millis = getMillis(timestamp);
  if (!millis) return "Sending";
  return new Date(millis).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const playTone = (audioRef: React.MutableRefObject<AudioContext | null>, stopRef: React.MutableRefObject<(() => void) | null>) => {
  stopRef.current?.();
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  const gain = context.createGain();
  gain.gain.value = 0.04;
  gain.connect(context.destination);
  let stopped = false;

  const tick = () => {
    if (stopped) return;
    const osc = context.createOscillator();
    osc.type = "sine";
    osc.frequency.value = 450;
    osc.connect(gain);
    osc.start();
    osc.stop(context.currentTime + 0.35);
    window.setTimeout(tick, 1100);
  };

  audioRef.current = context;
  tick();
  stopRef.current = () => {
    stopped = true;
    void context.close().catch(() => undefined);
    audioRef.current = null;
    stopRef.current = null;
  };
};

function ChatPage() {
  const { user, userRole } = useAuthStore();
  const isHr = userRole === "hr";
  const currentUser = useMemo(
    () =>
      user?.uid
        ? {
            uid: user.uid,
            email: normalizeEmail(user.email),
            name: user.displayName || user.email || "User",
          }
        : null,
    [user?.displayName, user?.email, user?.uid]
  );

  const [users, setUsers] = useState<ChatUser[]>([]);
  const [presence, setPresence] = useState<Record<string, boolean>>({});
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThread, setActiveThread] = useState<ChatThread>({
    threadId: HR_BROADCAST_THREAD_ID,
    type: "broadcast",
    participants: ["all"],
    title: "HR Broadcast",
  });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageText, setMessageText] = useState("");
  const [search, setSearch] = useState("");
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [callState, setCallState] = useState<CallState>(CallState.Idle);
  const [callId, setCallId] = useState<string | null>(null);
  const [callThreadId, setCallThreadId] = useState<string | null>(null);
  const [callParticipants, setCallParticipants] = useState<Record<string, CallParticipant>>({});
  const [mediaMode, setMediaMode] = useState<MediaMode>("video");
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState("");
  const [streamVersion, setStreamVersion] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const peersRef = useRef<Record<string, PeerBundle>>({});
  const callIdRef = useRef<string | null>(null);
  const callThreadIdRef = useRef<string | null>(null);
  const missedTimerRef = useRef<number | null>(null);
  const typingTimerRef = useRef<number | null>(null);
  const toneContextRef = useRef<AudioContext | null>(null);
  const stopToneRef = useRef<(() => void) | null>(null);
  const messagesUnsubRef = useRef<(() => void) | null>(null);
  const registeredUidRef = useRef<string | null>(null);
  const remoteVideoRefs = useRef<Record<string, HTMLVideoElement | null>>({});

  const privateThreads = useMemo(
    () =>
      threads
        .filter((thread) => thread.type === "private" && currentUser?.uid && thread.participants.includes(currentUser.uid))
        .sort((a, b) => getMillis(b.lastMessageAt || b.timestamp) - getMillis(a.lastMessageAt || a.timestamp)),
    [currentUser?.uid, threads]
  );

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    const unique = new Map<string, ChatUser>();
    users.forEach((item) => {
      if (!currentUser || item.uid === currentUser.uid || HR_EMAILS.has(normalizeEmail(item.email))) return;
      if (!`${item.name} ${item.email} ${item.uid}`.toLowerCase().includes(term)) return;
      unique.set(item.uid, { ...item, online: presence[item.uid] });
    });
    return Array.from(unique.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [currentUser, presence, search, users]);

  const activeTypingNames = useMemo(() => {
    if (!activeThread.typing || !currentUser) return [];
    return Object.entries(activeThread.typing)
      .filter(([uid, timestamp]) => uid !== currentUser.uid && now() - Number(timestamp) < TYPING_TTL_MS)
      .map(([uid]) => activeThread.participantNames?.[uid] || users.find((item) => item.uid === uid)?.name || "Someone");
  }, [activeThread, currentUser, users]);

  const canCall = activeThread.type === "private" && callState === CallState.Idle;

  const upsertParticipant = useCallback((uid: string, patch: Partial<CallParticipant>) => {
    setCallParticipants((prev) => ({
      ...prev,
      [uid]: {
        uid,
        name: patch.name || prev[uid]?.name || "Participant",
        micEnabled: patch.micEnabled ?? prev[uid]?.micEnabled ?? true,
        cameraEnabled: patch.cameraEnabled ?? prev[uid]?.cameraEnabled ?? false,
        screenSharing: patch.screenSharing ?? prev[uid]?.screenSharing ?? false,
        speaking: patch.speaking ?? prev[uid]?.speaking ?? false,
        connectionState: patch.connectionState ?? prev[uid]?.connectionState ?? "new",
        videoQuality: patch.videoQuality ?? prev[uid]?.videoQuality ?? "Audio",
        stream: patch.stream ?? prev[uid]?.stream,
      },
    }));
  }, []);

  const stopTone = useCallback(() => stopToneRef.current?.(), []);

  const writeCallData = useCallback(async (threadId: string, id: string, data: Record<string, unknown>) => {
    await setDoc(
      doc(db, "chatThreads", threadId, "callData", id),
      {
        callId: id,
        threadId,
        updatedAt: serverTimestamp(),
        ...data,
      },
      { merge: true }
    ).catch(() => undefined);
  }, []);

  const addCallMessage = useCallback(
    async (threadId: string, text: string, id?: string) => {
      if (!currentUser) return;
      await addDoc(collection(db, "chatThreads", threadId, "messages"), {
        senderId: currentUser.uid,
        senderEmail: currentUser.email,
        text,
        type: "call_event",
        callId: id || callIdRef.current,
        timestamp: serverTimestamp(),
      });
      await setDoc(
        doc(db, "chatThreads", threadId),
        {
          lastMessage: text,
          lastMessageAt: serverTimestamp(),
          unreadBy: {},
        },
        { merge: true }
      );
    },
    [currentUser]
  );

  const cleanupCall = useCallback(
    async (nextState: CallState = CallState.Ended, notify = true) => {
      const activeCallId = callIdRef.current;
      const activeThreadId = callThreadIdRef.current;
      if (missedTimerRef.current) window.clearTimeout(missedTimerRef.current);
      missedTimerRef.current = null;
      stopTone();

      Object.values(peersRef.current).forEach(({ peer }) => peer.close());
      peersRef.current = {};
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      screenTrackRef.current?.stop();
      localStreamRef.current = null;
      cameraTrackRef.current = null;
      screenTrackRef.current = null;
      remoteVideoRefs.current = {};
      setCallParticipants({});
      setMicEnabled(true);
      setCameraEnabled(true);
      setScreenSharing(false);
      setIncomingCall(null);
      setCallState(nextState);
      setStreamVersion((value) => value + 1);

      if (activeCallId && notify) {
        socket.emit("call-ended", { callId: activeCallId, threadId: activeThreadId, fromUid: currentUser?.uid });
      }
      if (activeCallId && activeThreadId) {
        await writeCallData(activeThreadId, activeCallId, {
          status: nextState,
          endedBy: currentUser?.uid,
          endedAt: serverTimestamp(),
        });
      }

      callIdRef.current = null;
      callThreadIdRef.current = null;
      setCallId(null);
      setCallThreadId(null);
      window.setTimeout(() => setCallState(CallState.Idle), nextState === CallState.Ended ? 800 : 2200);
    },
    [currentUser?.uid, stopTone, writeCallData]
  );

  const ensureLocalMedia = useCallback(
    async (mode: MediaMode) => {
      if (localStreamRef.current) return localStreamRef.current;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: selectedAudioDeviceId ? { deviceId: { exact: selectedAudioDeviceId } } : true,
        video: mode === "video",
      });
      localStreamRef.current = stream;
      cameraTrackRef.current = stream.getVideoTracks()[0] || null;
      setMicEnabled(stream.getAudioTracks()[0]?.enabled ?? true);
      setCameraEnabled(stream.getVideoTracks()[0]?.enabled ?? false);
      setStreamVersion((value) => value + 1);
      return stream;
    },
    [selectedAudioDeviceId]
  );

  const flushIceQueue = async (bundle: PeerBundle) => {
    if (!bundle.peer.remoteDescription) return;
    const queued = [...bundle.queuedIce];
    bundle.queuedIce = [];
    for (const candidate of queued) {
      await bundle.peer.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => undefined);
    }
  };

  const createPeer = useCallback(
    async (targetUid: string, polite: boolean, mode: MediaMode) => {
      if (!currentUser) throw new Error("Missing current user");
      const stream = await ensureLocalMedia(mode);
      const peer = new RTCPeerConnection(rtcConfiguration);
      const remoteStream = new MediaStream();
      const bundle: PeerBundle = { peer, remoteStream, queuedIce: [], polite, makingOffer: false, ignoreOffer: false };
      peersRef.current[targetUid] = bundle;

      stream.getTracks().forEach((track) => peer.addTrack(track, stream));

      peer.ontrack = (event) => {
        event.streams[0]?.getTracks().forEach((track) => {
          if (!remoteStream.getTracks().some((item) => item.id === track.id)) remoteStream.addTrack(track);
        });
        upsertParticipant(targetUid, {
          stream: remoteStream,
          cameraEnabled: remoteStream.getVideoTracks().some((track) => track.enabled),
          videoQuality: remoteStream.getVideoTracks().length ? "HD" : "Audio",
        });
        setStreamVersion((value) => value + 1);
      };

      peer.onicecandidate = (event) => {
        if (!event.candidate || !callIdRef.current) return;
        socket.emit("webrtc-ice-candidate", {
          callId: callIdRef.current,
          targetUid,
          fromUid: currentUser.uid,
          candidate: event.candidate.toJSON(),
        });
      };

      peer.onnegotiationneeded = async () => {
        try {
          bundle.makingOffer = true;
          await peer.setLocalDescription();
          socket.emit("webrtc-offer", {
            callId: callIdRef.current,
            targetUid,
            fromUid: currentUser.uid,
            description: peer.localDescription,
          });
        } finally {
          bundle.makingOffer = false;
        }
      };

      peer.onconnectionstatechange = () => {
        upsertParticipant(targetUid, { connectionState: peer.connectionState });
        if (peer.connectionState === "connected") setCallState(CallState.Connected);
        if (peer.connectionState === "disconnected") setCallState(CallState.Reconnecting);
        if (peer.connectionState === "failed") void peer.restartIce();
      };

      return bundle;
    },
    [currentUser, ensureLocalMedia, upsertParticipant]
  );

  const handleRemoteDescription = useCallback(
    async (fromUid: string, description: RTCSessionDescriptionInit, mode: MediaMode) => {
      const bundle = peersRef.current[fromUid] || (await createPeer(fromUid, true, mode));
      const offerCollision = description.type === "offer" && (bundle.makingOffer || bundle.peer.signalingState !== "stable");
      bundle.ignoreOffer = !bundle.polite && offerCollision;
      if (bundle.ignoreOffer) return;
      await bundle.peer.setRemoteDescription(new RTCSessionDescription(description));
      await flushIceQueue(bundle);
      if (description.type === "offer") {
        await bundle.peer.setLocalDescription();
        socket.emit("webrtc-answer", {
          callId: callIdRef.current,
          targetUid: fromUid,
          fromUid: currentUser?.uid,
          description: bundle.peer.localDescription,
        });
      }
    },
    [createPeer, currentUser?.uid]
  );

  const updateMediaStatus = useCallback(() => {
    if (!currentUser || !callIdRef.current) return;
    socket.emit("media-status", {
      callId: callIdRef.current,
      fromUid: currentUser.uid,
      micEnabled,
      cameraEnabled,
      screenSharing,
    });
  }, [cameraEnabled, currentUser, micEnabled, screenSharing]);

  useEffect(() => updateMediaStatus(), [updateMediaStatus]);

  useEffect(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
  }, [streamVersion, callState]);

  useEffect(() => {
    const firstRemote = Object.values(callParticipants).find((item) => item.stream)?.stream || null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = firstRemote;
    Object.values(callParticipants).forEach((participant) => {
      const element = remoteVideoRefs.current[participant.uid];
      if (element && participant.stream) element.srcObject = participant.stream;
    });
  }, [callParticipants, streamVersion]);

  useEffect(() => {
    if (!currentUser) return;
    if (registeredUidRef.current !== currentUser.uid) {
      if (!socket.connected) socket.connect();
      socket.emit("register-user", {
        uid: currentUser.uid,
        name: currentUser.name,
        email: currentUser.email,
      });
      registeredUidRef.current = currentUser.uid;
    }

    const onPresence = (payload: { uid: string; online: boolean }) => {
      setPresence((prev) => ({ ...prev, [payload.uid]: payload.online }));
    };
    const onPresenceSnapshot = (payload: Record<string, boolean>) => setPresence(payload || {});

    socket.on("presence-update", onPresence);
    socket.on("presence-snapshot", onPresenceSnapshot);
    return () => {
      socket.off("presence-update", onPresence);
      socket.off("presence-snapshot", onPresenceSnapshot);
    };
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    void setDoc(
      doc(db, "chatThreads", HR_BROADCAST_THREAD_ID),
      {
        threadId: HR_BROADCAST_THREAD_ID,
        type: "broadcast",
        participants: ["all"],
        title: "HR Broadcast",
        lastMessageAt: serverTimestamp(),
      },
      { merge: true }
    );

    const q = query(collection(db, "chatThreads"), where("participants", "array-contains", currentUser.uid));
    const unsub = onSnapshot(q, (snapshot) => {
      setThreads(snapshot.docs.map((item) => ({ threadId: item.id, ...item.data() } as ChatThread)));
    });
    return () => unsub();
  }, [currentUser]);

  useEffect(() => {
    messagesUnsubRef.current?.();
    const q = query(collection(db, "chatThreads", activeThread.threadId, "messages"), orderBy("timestamp", "asc"));
    messagesUnsubRef.current = onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as ChatMessage)));
    });
    if (currentUser && activeThread.threadId !== HR_BROADCAST_THREAD_ID) {
      void setDoc(doc(db, "chatThreads", activeThread.threadId), { [`unreadBy.${currentUser.uid}`]: 0 }, { merge: true });
    }
    return () => {
      messagesUnsubRef.current?.();
      messagesUnsubRef.current = null;
    };
  }, [activeThread.threadId, currentUser]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, activeThread.threadId]);

  useEffect(() => {
    const loadUsers = async () => {
      const found = new Map<string, ChatUser>();
      const addUser = (raw: any, fallbackId: string) => {
        const uid = raw.uid || raw.userId || fallbackId;
        const email = normalizeEmail(raw.email);
        if (!uid || !email) return;
        found.set(uid, {
          uid,
          email,
          name: raw.fullName || raw.name || email,
          role: raw.role,
          online: presence[uid],
        });
      };
      const [usersSnap, employeesSnap] = await Promise.all([
        getDocs(collection(db, "users")).catch(() => null),
        getDocs(collection(db, "employees")).catch(() => null),
      ]);
      usersSnap?.docs.forEach((item) => addUser(item.data(), item.id));
      employeesSnap?.docs.forEach((item) => addUser(item.data(), item.id));
      setUsers(Array.from(found.values()));
    };
    void loadUsers();
  }, [presence]);

  useEffect(() => {
    navigator.mediaDevices?.enumerateDevices?.().then((devices) => {
      setAudioDevices(devices.filter((device) => device.kind === "audioinput"));
    }).catch(() => undefined);
  }, [streamVersion]);

  useEffect(() => {
    if (!currentUser) return;

    const onIncomingCall = (payload: IncomingCall) => {
      if (payload.callerUid === currentUser.uid || callState !== CallState.Idle) return;
      setIncomingCall(payload);
      setMediaMode(payload.mode);
      setCallId(payload.callId);
      setCallThreadId(payload.threadId);
      callIdRef.current = payload.callId;
      callThreadIdRef.current = payload.threadId;
      setCallState(CallState.Ringing);
      playTone(toneContextRef, stopToneRef);
      missedTimerRef.current = window.setTimeout(() => {
        socket.emit("call-missed", { callId: payload.callId, callerUid: payload.callerUid, targetUid: currentUser.uid, threadId: payload.threadId });
        void addCallMessage(payload.threadId, "Missed call", payload.callId);
        void cleanupCall(CallState.Missed, false);
      }, MISSED_CALL_MS);
    };

    const onAccepted = async (payload: { callId: string; acceptedBy: string; acceptedByName: string; participantUids: string[]; mode: MediaMode }) => {
      if (payload.callId !== callIdRef.current) return;
      stopTone();
      setCallState(CallState.Connecting);
      upsertParticipant(payload.acceptedBy, { name: payload.acceptedByName, connectionState: "new" });
      await createPeer(payload.acceptedBy, false, payload.mode);
    };

    const onRejected = (payload: { callId: string; rejectedByName?: string }) => {
      if (payload.callId !== callIdRef.current) return;
      void addCallMessage(callThreadIdRef.current || activeThread.threadId, `${payload.rejectedByName || "Participant"} rejected the call`, payload.callId);
      void cleanupCall(CallState.Rejected, false);
    };

    const onMissed = (payload: { callId: string }) => {
      if (payload.callId !== callIdRef.current) return;
      void addCallMessage(callThreadIdRef.current || activeThread.threadId, "Missed call", payload.callId);
      void cleanupCall(CallState.Missed, false);
    };

    const onParticipantJoined = async (payload: { callId: string; uid: string; name: string; mode: MediaMode }) => {
      if (payload.callId !== callIdRef.current || payload.uid === currentUser.uid) return;
      upsertParticipant(payload.uid, { name: payload.name });
      await createPeer(payload.uid, currentUser.uid > payload.uid, payload.mode);
    };

    const onParticipantLeft = (payload: { callId: string; uid: string }) => {
      if (payload.callId !== callIdRef.current) return;
      peersRef.current[payload.uid]?.peer.close();
      delete peersRef.current[payload.uid];
      setCallParticipants((prev) => {
        const next = { ...prev };
        delete next[payload.uid];
        return next;
      });
    };

    const onOffer = (payload: { callId: string; fromUid: string; description: RTCSessionDescriptionInit; mode?: MediaMode }) => {
      if (payload.callId !== callIdRef.current) return;
      void handleRemoteDescription(payload.fromUid, payload.description, payload.mode || mediaMode);
    };

    const onAnswer = (payload: { callId: string; fromUid: string; description: RTCSessionDescriptionInit }) => {
      if (payload.callId !== callIdRef.current) return;
      void handleRemoteDescription(payload.fromUid, payload.description, mediaMode);
    };

    const onIce = (payload: { callId: string; fromUid: string; candidate: RTCIceCandidateInit }) => {
      if (payload.callId !== callIdRef.current) return;
      const bundle = peersRef.current[payload.fromUid];
      if (!bundle || !bundle.peer.remoteDescription) {
        if (bundle) bundle.queuedIce.push(payload.candidate);
        return;
      }
      void bundle.peer.addIceCandidate(new RTCIceCandidate(payload.candidate)).catch(() => undefined);
    };

    const onMediaStatus = (payload: { callId: string; fromUid: string; micEnabled: boolean; cameraEnabled: boolean; screenSharing: boolean }) => {
      if (payload.callId !== callIdRef.current) return;
      upsertParticipant(payload.fromUid, payload);
    };

    const onCallEnded = (payload: { callId: string }) => {
      if (payload.callId !== callIdRef.current) return;
      void cleanupCall(CallState.Ended, false);
    };

    socket.on("incoming-call", onIncomingCall);
    socket.on("call-accepted", onAccepted);
    socket.on("call-rejected", onRejected);
    socket.on("call-missed", onMissed);
    socket.on("participant-joined", onParticipantJoined);
    socket.on("participant-left", onParticipantLeft);
    socket.on("webrtc-offer", onOffer);
    socket.on("webrtc-answer", onAnswer);
    socket.on("webrtc-ice-candidate", onIce);
    socket.on("media-status", onMediaStatus);
    socket.on("call-ended", onCallEnded);

    return () => {
      socket.off("incoming-call", onIncomingCall);
      socket.off("call-accepted", onAccepted);
      socket.off("call-rejected", onRejected);
      socket.off("call-missed", onMissed);
      socket.off("participant-joined", onParticipantJoined);
      socket.off("participant-left", onParticipantLeft);
      socket.off("webrtc-offer", onOffer);
      socket.off("webrtc-answer", onAnswer);
      socket.off("webrtc-ice-candidate", onIce);
      socket.off("media-status", onMediaStatus);
      socket.off("call-ended", onCallEnded);
    };
  }, [activeThread.threadId, addCallMessage, callState, cleanupCall, createPeer, currentUser, handleRemoteDescription, mediaMode, stopTone, upsertParticipant]);

  useEffect(() => {
    return () => {
      void cleanupCall(CallState.Ended, true);
      messagesUnsubRef.current?.();
      if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
    };
  }, [cleanupCall]);

  const openBroadcast = () => {
    setActiveThread({
      threadId: HR_BROADCAST_THREAD_ID,
      type: "broadcast",
      participants: ["all"],
      title: "HR Broadcast",
    });
  };

  const openPrivateThread = async (targetUser: ChatUser) => {
    if (!currentUser) return;
    const threadId = getPrivateThreadId(currentUser.uid, targetUser.uid);
    const thread: ChatThread = {
      threadId,
      type: "private",
      participants: [currentUser.uid, targetUser.uid],
      participantNames: { [currentUser.uid]: currentUser.name, [targetUser.uid]: targetUser.name },
      participantEmails: { [currentUser.uid]: currentUser.email, [targetUser.uid]: targetUser.email },
      title: targetUser.name,
    };
    await setDoc(
      doc(db, "chatThreads", threadId),
      {
        ...thread,
        lastMessage: "Private chat opened",
        lastMessageAt: serverTimestamp(),
        timestamp: serverTimestamp(),
      },
      { merge: true }
    );
    setActiveThread(thread);
  };

  const openExistingThread = (thread: ChatThread) => {
    if (!currentUser || !thread.participants.includes(currentUser.uid)) return;
    const otherUid = thread.participants.find((uid) => uid !== currentUser.uid);
    const otherName = otherUid ? thread.participantNames?.[otherUid] || users.find((item) => item.uid === otherUid)?.name : "Private chat";
    setActiveThread({ ...thread, title: isHr ? otherName : "Private Chat with HR" });
  };

  const handleTyping = (value: string) => {
    setMessageText(value);
    if (!currentUser || activeThread.type !== "private") return;
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
    void setDoc(doc(db, "chatThreads", activeThread.threadId), { [`typing.${currentUser.uid}`]: now() }, { merge: true });
    typingTimerRef.current = window.setTimeout(() => {
      void setDoc(doc(db, "chatThreads", activeThread.threadId), { [`typing.${currentUser.uid}`]: 0 }, { merge: true });
    }, TYPING_TTL_MS);
  };

  const sendMessage = async (event: FormEvent) => {
    event.preventDefault();
    if (!currentUser || !messageText.trim()) return;
    const text = messageText.trim();
    setMessageText("");
    const unreadBy = activeThread.participants
      .filter((uid) => uid !== currentUser.uid && uid !== "all")
      .reduce<Record<string, number>>((acc, uid) => ({ ...acc, [uid]: (activeThread.unreadBy?.[uid] || 0) + 1 }), {});

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
        participants: activeThread.participants,
        lastMessage: text,
        lastMessageAt: serverTimestamp(),
        unreadBy,
        [`typing.${currentUser.uid}`]: 0,
      },
      { merge: true }
    );
  };

  const deleteMessage = async (message: ChatMessage) => {
    if (!currentUser || message.senderId !== currentUser.uid) return;
    await updateDoc(doc(db, "chatThreads", activeThread.threadId, "messages", message.id), {
      deleted: true,
      text: "This message was deleted",
    }).catch(() => deleteDoc(doc(db, "chatThreads", activeThread.threadId, "messages", message.id)));
  };

  const startCall = async (mode: MediaMode) => {
    if (!currentUser || activeThread.type !== "private") return;
    const targetUids = activeThread.participants.filter((uid) => uid !== currentUser.uid);
    if (!targetUids.length) return;
    const id = `call_${currentUser.uid}_${Date.now()}`;
    setCallId(id);
    setCallThreadId(activeThread.threadId);
    setMediaMode(mode);
    setCallState(CallState.Calling);
    callIdRef.current = id;
    callThreadIdRef.current = activeThread.threadId;
    playTone(toneContextRef, stopToneRef);
    await ensureLocalMedia(mode);
    await writeCallData(activeThread.threadId, id, {
      status: CallState.Calling,
      callerUid: currentUser.uid,
      participantUids: activeThread.participants,
      mode,
      createdAt: serverTimestamp(),
    });
    await addCallMessage(activeThread.threadId, `${mode === "video" ? "Video" : "Audio"} call started`, id);
    socket.emit("call-user", {
      callId: id,
      threadId: activeThread.threadId,
      callerUid: currentUser.uid,
      callerName: currentUser.name,
      callerEmail: currentUser.email,
      participantUids: activeThread.participants,
      targetUids,
      mode,
    });
    missedTimerRef.current = window.setTimeout(() => {
      socket.emit("cancel-call", { callId: id, threadId: activeThread.threadId, targetUids, callerUid: currentUser.uid });
      void addCallMessage(activeThread.threadId, "Missed call", id);
      void cleanupCall(CallState.Missed, false);
    }, MISSED_CALL_MS);
  };

  const acceptCall = async () => {
    if (!incomingCall || !currentUser) return;
    if (missedTimerRef.current) window.clearTimeout(missedTimerRef.current);
    missedTimerRef.current = null;
    stopTone();
    setCallState(CallState.Connecting);
    await ensureLocalMedia(incomingCall.mode);
    await writeCallData(incomingCall.threadId, incomingCall.callId, {
      status: CallState.Connecting,
      acceptedBy: currentUser.uid,
      acceptedAt: serverTimestamp(),
    });
    socket.emit("answer-call", {
      callId: incomingCall.callId,
      threadId: incomingCall.threadId,
      callerUid: incomingCall.callerUid,
      acceptedBy: currentUser.uid,
      acceptedByName: currentUser.name,
      participantUids: incomingCall.participantUids,
      mode: incomingCall.mode,
    });
    setIncomingCall(null);
  };

  const rejectCall = async () => {
    if (!incomingCall || !currentUser) return;
    socket.emit("reject-call", {
      callId: incomingCall.callId,
      callerUid: incomingCall.callerUid,
      rejectedBy: currentUser.uid,
      rejectedByName: currentUser.name,
      threadId: incomingCall.threadId,
    });
    await addCallMessage(incomingCall.threadId, "Call rejected", incomingCall.callId);
    await cleanupCall(CallState.Rejected, false);
  };

  const toggleMic = () => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMicEnabled(track.enabled);
  };

  const toggleCamera = async () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setCameraEnabled(track.enabled);
      setStreamVersion((value) => value + 1);
      return;
    }
    const cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    const cameraTrack = cameraStream.getVideoTracks()[0];
    if (!cameraTrack) return;
    cameraTrackRef.current = cameraTrack;
    stream.addTrack(cameraTrack);
    await Promise.all(Object.values(peersRef.current).map(({ peer }) => peer.addTrack(cameraTrack, stream)));
    setCameraEnabled(true);
    setStreamVersion((value) => value + 1);
  };

  const replaceOutboundVideo = async (track: MediaStreamTrack | null) => {
    await Promise.all(
      Object.values(peersRef.current).map(async ({ peer }) => {
        const sender = peer.getSenders().find((item) => item.track?.kind === "video");
        if (sender) await sender.replaceTrack(track);
      })
    );
  };

  const startScreenShare = async () => {
    if (!localStreamRef.current || screenSharing) return;
    const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    const screenTrack = displayStream.getVideoTracks()[0];
    if (!screenTrack) return;
    screenTrackRef.current = screenTrack;
    await replaceOutboundVideo(screenTrack);
    setScreenSharing(true);
    setCameraEnabled(true);
    setStreamVersion((value) => value + 1);
    screenTrack.onended = async () => {
      await replaceOutboundVideo(cameraTrackRef.current);
      screenTrackRef.current = null;
      setScreenSharing(false);
      setCameraEnabled(cameraTrackRef.current?.enabled ?? false);
      setStreamVersion((value) => value + 1);
    };
  };

  const switchAudioDevice = async (deviceId: string) => {
    setSelectedAudioDeviceId(deviceId);
    if (!localStreamRef.current) return;
    const newStream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId } }, video: false });
    const newTrack = newStream.getAudioTracks()[0];
    if (!newTrack) return;
    localStreamRef.current.getAudioTracks().forEach((track) => {
      track.stop();
      localStreamRef.current?.removeTrack(track);
    });
    localStreamRef.current.addTrack(newTrack);
    await Promise.all(
      Object.values(peersRef.current).map(async ({ peer }) => {
        const sender = peer.getSenders().find((item) => item.track?.kind === "audio");
        if (sender) await sender.replaceTrack(newTrack);
      })
    );
    setMicEnabled(true);
  };

  const participantCards = Object.values(callParticipants);

  return (
    <div className="h-[calc(100vh-48px)] overflow-hidden rounded-lg border border-slate-200 bg-[#f5f5f5] text-slate-900 shadow-sm dark:border-slate-800 dark:bg-[#1f1f1f] dark:text-white">
      <div className="grid h-full grid-cols-1 md:grid-cols-[76px_300px_minmax(0,1fr)]">
        <nav className="hidden border-r border-slate-200 bg-[#ebebeb] p-3 dark:border-neutral-800 dark:bg-[#181818] md:flex md:flex-col md:items-center md:gap-4">
          <button className="flex h-11 w-11 items-center justify-center rounded-md bg-[#6264a7] text-white" title="Chat">
            <Users className="h-5 w-5" />
          </button>
          <button className="flex h-11 w-11 items-center justify-center rounded-md text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-neutral-800" title="Activity">
            <Activity className="h-5 w-5" />
          </button>
          <button className="flex h-11 w-11 items-center justify-center rounded-md text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-neutral-800" title="Calls">
            <PhoneCall className="h-5 w-5" />
          </button>
        </nav>

        <aside className="min-h-0 overflow-y-auto border-r border-slate-200 bg-white dark:border-neutral-800 dark:bg-[#242424]">
          <div className="border-b border-slate-200 p-4 dark:border-neutral-800">
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-semibold">Chat</h1>
              <MoreVertical className="h-5 w-5 text-slate-500" />
            </div>
            <label className="mt-3 flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-[#1f1f1f]">
              <Search className="h-4 w-4 text-slate-500" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search" className="min-w-0 flex-1 bg-transparent outline-none" />
            </label>
          </div>

          <div className="p-3">
            <button
              type="button"
              onClick={openBroadcast}
              className={`mb-2 w-full rounded-md px-3 py-3 text-left text-sm ${activeThread.threadId === HR_BROADCAST_THREAD_ID ? "bg-[#e8e8ff] text-[#464775] dark:bg-[#34345c] dark:text-white" : "hover:bg-slate-100 dark:hover:bg-neutral-800"}`}
            >
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded bg-[#464775] text-sm font-semibold text-white">
                  <Radio className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold">HR Broadcast</span>
                  <span className="block truncate text-xs opacity-70">Announcements for everyone</span>
                </span>
              </div>
            </button>

            <div className="mb-2 mt-4 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Private chats</div>
            {isHr ? (
              filteredUsers.map((item) => (
                <button key={item.uid} type="button" onClick={() => void openPrivateThread(item)} className="w-full rounded-md px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-neutral-800">
                  <div className="flex items-center gap-3">
                    <span className="relative flex h-9 w-9 items-center justify-center rounded bg-[#0b6a6f] text-sm font-semibold text-white">
                      {getInitials(item.name)}
                      <Circle className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ${item.online ? "fill-emerald-500 text-emerald-500" : "fill-slate-400 text-slate-400"}`} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{item.name}</span>
                      <span className="block truncate text-xs text-slate-500">{item.online ? "Available" : item.email}</span>
                    </span>
                  </div>
                </button>
              ))
            ) : privateThreads.length ? (
              privateThreads.map((thread) => {
                const unread = currentUser ? thread.unreadBy?.[currentUser.uid] || 0 : 0;
                return (
                  <button key={thread.threadId} type="button" onClick={() => openExistingThread(thread)} className={`w-full rounded-md px-3 py-2 text-left ${activeThread.threadId === thread.threadId ? "bg-[#e8e8ff] dark:bg-[#34345c]" : "hover:bg-slate-100 dark:hover:bg-neutral-800"}`}>
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded bg-[#8764b8] text-sm font-semibold text-white">HR</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">Private Chat with HR</span>
                        <span className="block truncate text-xs text-slate-500">{thread.lastMessage || "Open conversation"}</span>
                      </span>
                      {unread > 0 && <span className="rounded-full bg-[#6264a7] px-2 py-0.5 text-xs font-semibold text-white">{unread}</span>}
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-500 dark:bg-neutral-800">HR has not opened a private chat yet.</div>
            )}
          </div>
        </aside>

        <main className="flex min-h-0 flex-col bg-white dark:bg-[#1f1f1f]">
          <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3 dark:border-neutral-800">
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold">{activeThread.title || "Conversation"}</h2>
              <p className="flex items-center gap-2 text-xs text-slate-500">
                {activeThread.type === "broadcast" ? "Broadcast channel" : "Private chat"}
                {activeThread.type === "private" && <span className="inline-flex items-center gap-1">{presence[activeThread.participants.find((uid) => uid !== currentUser?.uid) || ""] ? <Wifi className="h-3 w-3 text-emerald-500" /> : <WifiOff className="h-3 w-3" />} presence</span>}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" disabled={!canCall} onClick={() => void startCall("audio")} className="flex h-9 w-9 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-200 dark:hover:bg-neutral-800" title="Start audio call">
                <Phone className="h-4 w-4" />
              </button>
              <button type="button" disabled={!canCall} onClick={() => void startCall("video")} className="flex h-9 w-9 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-200 dark:hover:bg-neutral-800" title="Start video call">
                <Camera className="h-4 w-4" />
              </button>
            </div>
          </header>

          <section className="min-h-0 flex-1 overflow-y-auto bg-[#fafafa] p-5 dark:bg-[#191919]">
            {messages.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">No messages yet.</div>
            ) : (
              messages.map((message) => {
                const mine = message.senderId === currentUser?.uid;
                return (
                  <div key={message.id} className={`mb-3 flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div className={`group max-w-[78%] rounded-md px-3 py-2 text-sm shadow-sm ${mine ? "bg-[#6264a7] text-white" : "bg-white text-slate-900 dark:bg-[#2b2b2b] dark:text-white"}`}>
                      {!mine && <div className="mb-1 text-xs font-medium opacity-70">{message.senderEmail || "User"}</div>}
                      <div className={`whitespace-pre-wrap break-words ${message.deleted ? "italic opacity-70" : ""}`}>{message.text}</div>
                      <div className={`mt-1 flex items-center justify-end gap-2 text-[10px] ${mine ? "text-white/70" : "text-slate-500"}`}>
                        <span>{formatTime(message.timestamp)}</span>
                        {mine && !message.deleted && (
                          <button type="button" onClick={() => void deleteMessage(message)} className="hidden rounded p-0.5 hover:bg-black/10 group-hover:inline-flex" title="Delete message">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </section>

          {activeTypingNames.length > 0 && <div className="px-5 py-1 text-xs text-slate-500">{activeTypingNames.join(", ")} typing...</div>}

          <form onSubmit={sendMessage} className="border-t border-slate-200 bg-white p-4 dark:border-neutral-800 dark:bg-[#1f1f1f]">
            <div className="flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-[#242424]">
              <input value={messageText} onChange={(event) => handleTyping(event.target.value)} placeholder={activeThread.type === "broadcast" && !isHr ? "HR broadcast is read-only" : "Type a new message"} disabled={activeThread.type === "broadcast" && !isHr} className="min-w-0 flex-1 bg-transparent text-sm outline-none disabled:cursor-not-allowed" />
              <button type="submit" disabled={!messageText.trim() || (activeThread.type === "broadcast" && !isHr)} className="flex h-9 w-9 items-center justify-center rounded-md bg-[#6264a7] text-white disabled:bg-slate-400" title="Send">
                <Send className="h-4 w-4" />
              </button>
            </div>
          </form>
        </main>
      </div>

      {(callState !== CallState.Idle || incomingCall) && (
        <div className="fixed inset-0 z-40 bg-[#1f1f1f]/95 text-white">
          <audio ref={remoteAudioRef} autoPlay playsInline />
          {incomingCall && callState === CallState.Ringing ? (
            <div className="flex h-full flex-col items-center justify-center gap-6">
              <div className="relative">
                <div className="flex h-24 w-24 items-center justify-center rounded bg-[#6264a7] text-3xl font-semibold">{getInitials(incomingCall.callerName)}</div>
                <div className="absolute inset-0 animate-ping rounded border border-[#8b8cc7]" />
              </div>
              <div className="text-center">
                <h3 className="text-2xl font-semibold">{incomingCall.callerName}</h3>
                <p className="mt-1 text-sm text-slate-300">Incoming {incomingCall.mode} call</p>
              </div>
              <div className="flex items-center gap-5">
                <button type="button" onClick={() => void rejectCall()} className="flex h-14 w-14 items-center justify-center rounded-full bg-red-600 hover:bg-red-700" title="Reject">
                  <PhoneOff className="h-6 w-6" />
                </button>
                <button type="button" onClick={() => void acceptCall()} className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 hover:bg-emerald-700" title="Accept">
                  <Check className="h-6 w-6" />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
                <div>
                  <h3 className="font-semibold">{activeThread.title || "Call"}</h3>
                  <p className="text-xs uppercase tracking-wide text-slate-400">{callState}</p>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-300">
                  <span className="inline-flex items-center gap-1"><Volume2 className="h-3.5 w-3.5" /> Speaker detection</span>
                  <select value={selectedAudioDeviceId} onChange={(event) => void switchAudioDevice(event.target.value)} className="rounded border border-white/10 bg-[#2b2b2b] px-2 py-1 outline-none">
                    <option value="">Default microphone</option>
                    {audioDevices.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label || "Microphone"}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid min-h-0 flex-1 gap-3 p-4" style={{ gridTemplateColumns: `repeat(${Math.min(Math.max(participantCards.length + 1, 1), 3)}, minmax(0, 1fr))` }}>
                <div className="relative overflow-hidden rounded-md bg-[#2b2b2b]">
                  <video ref={localVideoRef} autoPlay muted playsInline className={`h-full min-h-[220px] w-full object-cover ${cameraEnabled || screenSharing ? "block" : "hidden"}`} />
                  {!cameraEnabled && !screenSharing && <div className="flex h-full min-h-[220px] items-center justify-center"><div className="flex h-20 w-20 items-center justify-center rounded bg-[#0b6a6f] text-2xl font-semibold">{getInitials(currentUser?.name)}</div></div>}
                  <div className="absolute bottom-3 left-3 rounded bg-black/60 px-2 py-1 text-xs">You {micEnabled ? "" : "(muted)"}</div>
                </div>

                {participantCards.map((participant) => (
                  <div key={participant.uid} className={`relative overflow-hidden rounded-md bg-[#2b2b2b] ring-2 ${participant.speaking ? "ring-emerald-500" : "ring-transparent"}`}>
                    <video ref={(node) => { remoteVideoRefs.current[participant.uid] = node; }} autoPlay playsInline className={`h-full min-h-[220px] w-full object-cover ${participant.cameraEnabled ? "block" : "hidden"}`} />
                    {!participant.cameraEnabled && <div className="flex h-full min-h-[220px] items-center justify-center"><div className="flex h-20 w-20 items-center justify-center rounded bg-[#8764b8] text-2xl font-semibold">{getInitials(participant.name)}</div></div>}
                    <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded bg-black/60 px-2 py-1 text-xs">
                      <span>{participant.name}</span>
                      {!participant.micEnabled && <MicOff className="h-3 w-3" />}
                      <span>{participant.videoQuality}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-center gap-4 border-t border-white/10 p-4">
                <button type="button" onClick={toggleMic} className={`flex h-11 w-11 items-center justify-center rounded-full ${micEnabled ? "bg-[#3b3b3b]" : "bg-red-600"}`} title={micEnabled ? "Mute" : "Unmute"}>{micEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}</button>
                <button type="button" onClick={() => void toggleCamera()} className={`flex h-11 w-11 items-center justify-center rounded-full ${cameraEnabled ? "bg-[#3b3b3b]" : "bg-red-600"}`} title={cameraEnabled ? "Camera off" : "Camera on"}>{cameraEnabled ? <Camera className="h-5 w-5" /> : <CameraOff className="h-5 w-5" />}</button>
                <button type="button" onClick={() => void startScreenShare()} className={`flex h-11 w-11 items-center justify-center rounded-full ${screenSharing ? "bg-[#6264a7]" : "bg-[#3b3b3b]"}`} title="Share screen"><MonitorUp className="h-5 w-5" /></button>
                <button type="button" onClick={() => void cleanupCall(CallState.Ended, true)} className="flex h-12 w-12 items-center justify-center rounded-full bg-red-600 hover:bg-red-700" title="Leave call"><PhoneOff className="h-5 w-5" /></button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ChatPage;
