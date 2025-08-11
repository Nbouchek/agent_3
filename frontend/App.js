import React, { useState, useEffect, useRef } from "react";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Image,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { API_URL } from "./config"; // Import from config
// Removed react-native-webrtc import for web compatibility

export default function App() {
  const [backendStatus, setBackendStatus] = useState("Connecting...");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [token, setToken] = useState("");
  const [userId, setUserId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [ws, setWs] = useState(null);
  const [recipientId, setRecipientId] = useState("1");
  const [paymentAmount, setPaymentAmount] = useState("1000");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [paymentStatus, setPaymentStatus] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [receivedPayments, setReceivedPayments] = useState([]);
  const [sentPayments, setSentPayments] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [usernamesCache, setUsernamesCache] = useState({});
  const [avatarsCache, setAvatarsCache] = useState({});
  const messagesRef = useRef(null);
  const scrollToBottom = () => {
    try {
      messagesRef.current?.scrollToEnd({ animated: true });
    } catch {}
  };
  const [inCall, setInCall] = useState(false);
  const [callingUserId, setCallingUserId] = useState(null);
  const [acceptedFromId, setAcceptedFromId] = useState(null);
  const [incomingFromId, setIncomingFromId] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const pcRef = useRef(null);

  const isWeb = Platform.OS === "web";
  const iceServers = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

  const createPeer = (targetIdOverride = null) => {
    if (!isWeb) throw new Error("Calls supported on web only in MVP");
    const pc = new window.RTCPeerConnection(iceServers);
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        const sendTarget = targetIdOverride ?? parseInt(recipientId, 10);
        ws?.send?.(
          JSON.stringify({
            type: "webrtc_ice",
            target_id: sendTarget,
            candidate: e.candidate,
          })
        );
      }
    };
    pc.ontrack = (event) => {
      setRemoteStream(event.streams[0]);
    };
    pcRef.current = pc;
    return pc;
  };

  const getMedia = async () => {
    if (!isWeb) throw new Error("Calls supported on web only in MVP");
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true,
    });
    setLocalStream(stream);
    return stream;
  };

  const startCall = async () => {
    try {
      if (!isWeb) {
        Alert.alert("Call", "Calls supported on web only in MVP");
        return;
      }
      const target = parseInt(recipientId, 10);
      if (!target) {
        Alert.alert("Call", "Select a valid recipient id");
        return;
      }
      if (target === userId) {
        Alert.alert("Call", "Cannot call yourself. Pick another user.");
        return;
      }
      if (!ws || ws.readyState !== 1) {
        Alert.alert("Call", "Connecting… please try again in a moment.");
        return;
      }
      setCallingUserId(target);
      setInCall(true);
      // Notify callee immediately before media permission to avoid delays
      ws?.send?.(JSON.stringify({ type: "call_invite", target_id: target }));
      const pc = createPeer();
      const stream = await getMedia();
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      ws?.send?.(
        JSON.stringify({ type: "webrtc_offer", target_id: target, sdp: offer })
      );
    } catch (e) {
      Alert.alert("Call error", e.message);
    }
  };

  const endCall = () => {
    try {
      ws?.send?.(
        JSON.stringify({ type: "call_end", target_id: callingUserId })
      );
    } catch {}
    try {
      pcRef.current?.close();
    } catch {}
    setInCall(false);
    setCallingUserId(null);
    setAcceptedFromId(null);
    setLocalStream(null);
    setRemoteStream(null);
  };

  const nameForMessage = (msg) => {
    return msg.sender_id === userId
      ? "You"
      : recipientName || `User ${msg.sender_id}`;
  };

  const initialsForName = (name) => {
    if (!name) return "?";
    const parts = String(name).trim().split(/\s+/);
    const first = parts[0]?.[0] || "?";
    const second = parts[1]?.[0] || "";
    return (first + second).toUpperCase();
  };

  const avatarColorForId = (id) => {
    const colors = [
      "#6C8CF5",
      "#F56C6C",
      "#67C23A",
      "#E6A23C",
      "#909399",
      "#9B59B6",
      "#16A085",
    ];
    if (!id && id !== 0) return colors[0];
    return colors[id % colors.length];
  };

  const getUsername = async (uid) => {
    if (usernamesCache[uid]) return usernamesCache[uid];
    // Avoid 400 from /users/{id} when requesting our own profile via this route
    if (uid === userId) {
      const name = "You";
      setUsernamesCache((prev) => ({ ...prev, [uid]: name }));
      return name;
    }
    try {
      const res = await fetch(`${API_URL}/users/${uid}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const name = data.username || `User ${uid}`;
        setUsernamesCache((prev) => ({ ...prev, [uid]: name }));
        if (data.avatar_url)
          setAvatarsCache((prev) => ({ ...prev, [uid]: data.avatar_url }));
        return name;
      }
    } catch {}
    return `User ${uid}`;
  };

  const Avatar = ({ uid, name, size = 34 }) => {
    const url = avatarsCache[uid];
    if (url) {
      return (
        <Image
          source={{ uri: url }}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            marginHorizontal: 6,
          }}
          resizeMode="cover"
        />
      );
    }
    return (
      <View
        style={[
          styles.avatar,
          {
            backgroundColor: avatarColorForId(uid),
            width: size,
            height: size,
            borderRadius: size / 2,
          },
        ]}
      >
        <Text style={styles.avatarText}>{initialsForName(name)}</Text>
      </View>
    );
  };

  const enrichConversations = async (items) => {
    const enriched = await Promise.all(
      items.map(async (c) => ({
        ...c,
        username: await getUsername(c.user_id),
      }))
    );
    setConversations(enriched);
  };

  // Check backend health on startup
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const response = await fetch(`${API_URL}/health`);
        if (response.ok) {
          const data = await response.json();
          if (data.status === "healthy") {
            setBackendStatus("Connected");
          } else {
            setBackendStatus(`Unhealthy: ${data.database}`);
          }
        } else {
          setBackendStatus("Error: Could not connect");
        }
      } catch (error) {
        setBackendStatus("Error: Network request failed");
      }
    };

    checkHealth();
  }, []);

  const handleAuth = async () => {
    try {
      const endpoint = isRegistering ? "/auth/register" : "/auth/token";
      const method = "POST";

      let body;
      if (isRegistering) {
        body = JSON.stringify({ username, email, password });
      } else {
        body = `username=${username}&password=${password}`;
      }

      const headers = {
        "Content-Type": isRegistering
          ? "application/json"
          : "application/x-www-form-urlencoded",
      };

      const response = await fetch(`${API_URL}${endpoint}`, {
        method,
        headers,
        body,
      });

      if (response.ok) {
        const data = await response.json();
        if (isRegistering) {
          Alert.alert("Success", "User registered successfully! Please login.");
          setIsRegistering(false);
        } else {
          setToken(data.access_token);
          setIsLoggedIn(true);
          // Fetch current user id
          const meRes = await fetch(`${API_URL}/users/me`, {
            headers: { Authorization: `Bearer ${data.access_token}` },
          });
          if (meRes.ok) {
            const me = await meRes.json();
            setUserId(me.id);
          } else {
            Alert.alert("Warning", "Could not fetch user profile.");
          }
          Alert.alert("Success", "Login successful!");
        }
      } else {
        const error = await response.json();
        Alert.alert("Error", error.detail || "Authentication failed");
      }
    } catch (error) {
      Alert.alert("Error", "Network error: " + error.message);
    }
  };

  // Connect native WebSocket once we have token and userId
  useEffect(() => {
    if (!token || !userId || ws) return;

    const wsBase = API_URL.replace("http://", "ws://").replace(
      "https://",
      "wss://"
    );
    const wsUrl = `${wsBase}/chat/ws/${userId}?token=${encodeURIComponent(
      token
    )}`;
    const socket = new WebSocket(wsUrl);

    let pingTimer = null;

    socket.onopen = () => {
      // Keep alive pings
      pingTimer = setInterval(() => {
        try {
          socket.send(JSON.stringify({ type: "ping" }));
        } catch {}
      }, 30000);
    };

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        // Chat messages
        if (payload.type === "new_message" && payload.message) {
          setMessages((prev) => {
            const next = [...prev, payload.message];
            requestAnimationFrame(scrollToBottom);
            return next;
          });
        }
        // Payments
        if (payload.type === "payment_created" && payload.payment) {
          const p = payload.payment;
          if (p.recipient_id === userId) {
            setReceivedPayments((prev) => [
              {
                id: p.id,
                amount: p.amount,
                currency: p.currency,
                status: p.status,
                created: p.created,
                description: p.description,
                recipient_id: p.recipient_id,
                sender_id: p.sender_id,
              },
              ...prev,
            ]);
          }
          if (p.sender_id === userId) {
            setPaymentStatus(`Created: ${p.id}`);
            setSentPayments((prev) => [
              {
                id: p.id,
                amount: p.amount,
                currency: p.currency,
                status: p.status,
                created: p.created,
                description: p.description,
                recipient_id: p.recipient_id,
                sender_id: p.sender_id,
              },
              ...prev,
            ]);
          }
        }
        if (payload.type === "payment_updated" && payload.payment) {
          const p = payload.payment;
          setReceivedPayments((prev) =>
            prev.map((it) =>
              it.id === p.id ? { ...it, status: p.status } : it
            )
          );
          if (p.sender_id === userId) setPaymentStatus(`Status: ${p.status}`);
        }
        // Call signaling
        if (payload.type === "call_invite") {
          const fromId = payload.from;
          console.log("Incoming call from", fromId);
          setCallingUserId(fromId);
          setIncomingFromId(fromId);
          if (isWeb) {
            Alert.alert("Incoming call", `User ${fromId} is calling you`, [
              {
                text: "Decline",
                style: "destructive",
                onPress: () => {
                  try {
                    socket.send(
                      JSON.stringify({ type: "call_end", target_id: fromId })
                    );
                  } catch {}
                  setIncomingFromId(null);
                },
              },
              {
                text: "Accept",
                onPress: () => {
                  setAcceptedFromId(fromId);
                  setInCall(true);
                  setRecipientId(String(fromId));
                  setIncomingFromId(null);
                },
              },
            ]);
          } else {
            setAcceptedFromId(fromId);
            setInCall(true);
            setRecipientId(String(fromId));
            setIncomingFromId(null);
          }
        }
        if (payload.type === "webrtc_offer" && payload.sdp) {
          (async () => {
            if (acceptedFromId !== null && acceptedFromId !== payload.from)
              return;
            console.log("Offer from", payload.from);
            const pc = createPeer(payload.from);
            const stream = await getMedia();
            stream.getTracks().forEach((t) => pc.addTrack(t, stream));
            await pc.setRemoteDescription(payload.sdp);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.send(
              JSON.stringify({
                type: "webrtc_answer",
                target_id: payload.from,
                sdp: answer,
              })
            );
          })();
        }
        if (payload.type === "webrtc_answer" && payload.sdp) {
          (async () => {
            console.log("Answer from", payload.from);
            await pcRef.current?.setRemoteDescription(payload.sdp);
          })();
        }
        if (payload.type === "webrtc_ice" && payload.candidate) {
          (async () => {
            try {
              await pcRef.current?.addIceCandidate(payload.candidate);
            } catch {}
          })();
        }
        if (payload.type === "call_end") {
          endCall();
        }
      } catch {}
    };

    socket.onclose = () => {
      if (pingTimer) clearInterval(pingTimer);
      setWs(null);
    };

    setWs(socket);

    return () => {
      if (pingTimer) clearInterval(pingTimer);
      try {
        socket.close();
      } catch {}
    };
  }, [token, userId]);

  // Extend WS handler for call events
  useEffect(() => {
    if (!ws) return;
    const socket = ws;
    const onMsg = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === "call_invite") {
          const fromId = payload.from;
          setCallingUserId(fromId);
          setIncomingFromId(fromId);
          if (isWeb) {
            Alert.alert("Incoming call", `User ${fromId} is calling you`, [
              {
                text: "Decline",
                style: "destructive",
                onPress: () => {
                  try {
                    socket.send(
                      JSON.stringify({ type: "call_end", target_id: fromId })
                    );
                  } catch {}
                  setIncomingFromId(null);
                },
              },
              {
                text: "Accept",
                onPress: () => {
                  setAcceptedFromId(fromId);
                  setInCall(true);
                  setRecipientId(String(fromId));
                  setIncomingFromId(null);
                },
              },
            ]);
          } else {
            setAcceptedFromId(fromId);
            setInCall(true);
            setRecipientId(String(fromId));
            setIncomingFromId(null);
          }
        }
        if (payload.type === "webrtc_offer" && payload.sdp) {
          (async () => {
            if (acceptedFromId !== null && acceptedFromId !== payload.from)
              return;
            const pc = createPeer(payload.from);
            const stream = await getMedia();
            stream.getTracks().forEach((t) => pc.addTrack(t, stream));
            await pc.setRemoteDescription(payload.sdp);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.send(
              JSON.stringify({
                type: "webrtc_answer",
                target_id: payload.from,
                sdp: answer,
              })
            );
          })();
        }
        if (payload.type === "webrtc_answer" && payload.sdp) {
          (async () => {
            await pcRef.current?.setRemoteDescription(payload.sdp);
          })();
        }
        if (payload.type === "webrtc_ice" && payload.candidate) {
          (async () => {
            try {
              await pcRef.current?.addIceCandidate(payload.candidate);
            } catch {}
          })();
        }
        if (payload.type === "call_end") {
          endCall();
        }
      } catch {}
    };
    socket.addEventListener?.("message", onMsg);
    return () => {
      socket.removeEventListener?.("message", onMsg);
    };
  }, [ws]);

  useEffect(() => {
    if (!token) return;
    const idNum = parseInt(recipientId, 10);
    if (!idNum || idNum <= 0) {
      setMessages([]);
      return;
    }
    const loadConversation = async () => {
      try {
        const res = await fetch(`${API_URL}/chat/messages/${idNum}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setMessages(Array.isArray(data) ? data : []);
          setTimeout(scrollToBottom, 0);
        }
      } catch {
        // ignore
      }
    };
    loadConversation();
  }, [token, recipientId]);

  const sendMessage = async () => {
    if (!newMessage.trim()) return;
    try {
      const response = await fetch(`${API_URL}/chat/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          content: newMessage,
          receiver_id: parseInt(recipientId, 10),
        }),
      });

      if (response.ok) {
        const sent = await response.json();
        setMessages((prev) => {
          const next = [...prev, sent];
          requestAnimationFrame(scrollToBottom);
          return next;
        });
        setNewMessage("");
      } else {
        const error = await response.json();
        Alert.alert("Error", error.detail || "Failed to send message");
      }
    } catch (error) {
      Alert.alert("Error", "Network error: " + error.message);
    }
  };

  const createPayment = async () => {
    try {
      const amountInt = parseInt(paymentAmount, 10);
      const recipientInt = parseInt(recipientId, 10);
      if (!recipientInt || recipientInt <= 0) {
        Alert.alert("Payment", "Please select a valid recipient id");
        return;
      }
      if (!amountInt || amountInt <= 0) {
        Alert.alert(
          "Payment",
          "Please enter a valid amount in cents (e.g., 500)"
        );
        return;
      }

      setPaymentStatus("Creating payment intent...");
      console.log("Creating payment intent", { amountInt, recipientInt });

      const response = await fetch(`${API_URL}/payment/create-intent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          amount: amountInt,
          recipient_id: recipientInt,
        }),
      });

      console.log("Payment response status:", response.status);

      if (response.ok) {
        const data = await response.json();
        console.log("Payment success:", data);
        setPaymentStatus(`Created: ${data.payment_intent_id}`);
        Alert.alert(
          "Payment Intent Created",
          `Client Secret: ${data.client_secret}`
        );
      } else {
        let detail = "Payment failed";
        try {
          const err = await response.json();
          detail = err.detail || JSON.stringify(err);
        } catch {}
        console.warn("Payment error:", detail);
        setPaymentStatus(`Error: ${detail}`);
        Alert.alert("Payment Error", detail);
      }
    } catch (error) {
      console.error("Payment exception:", error);
      setPaymentStatus(`Exception: ${error.message}`);
      Alert.alert("Error", "Payment error: " + error.message);
    }
  };

  const searchUsers = async () => {
    if (!searchQuery || searchQuery.trim().length < 2) {
      Alert.alert("Search", "Please enter at least 2 characters");
      return;
    }
    try {
      const res = await fetch(
        `${API_URL}/users/search?query=${encodeURIComponent(
          searchQuery.trim()
        )}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setSearchResults(Array.isArray(data) ? data : []);
      } else {
        setSearchResults([]);
        const e = await res.json();
        Alert.alert("Search Error", e.detail || "Could not search users");
      }
    } catch (e) {
      Alert.alert("Search Error", e.message);
    }
  };

  const loadReceivedPayments = async () => {
    try {
      const res = await fetch(`${API_URL}/payment/received`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setReceivedPayments(Array.isArray(data) ? data : []);
      } else {
        const e = await res.json().catch(() => ({}));
        Alert.alert("Payments", e.detail || "Could not load received payments");
      }
    } catch (e) {
      Alert.alert("Payments", e.message);
    }
  };

  const loadSentPayments = async () => {
    try {
      const res = await fetch(`${API_URL}/payment/transactions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSentPayments(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      // ignore
    }
  };

  const fetchConversations = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/chat/conversations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const items = Array.isArray(data) ? data : [];
        enrichConversations(items);
      }
    } catch {}
  };

  // Load received payments after login
  useEffect(() => {
    if (token) loadReceivedPayments();
  }, [token]);

  // Poll as fallback
  useEffect(() => {
    if (!token) return;
    const id = setInterval(() => {
      loadReceivedPayments();
      loadSentPayments();
    }, 10000);
    return () => clearInterval(id);
  }, [token]);

  useEffect(() => {
    if (token) fetchConversations();
  }, [token]);

  const openConversation = async (otherId) => {
    setRecipientId(String(otherId));
    await fetch(`${API_URL}/chat/mark-read/${otherId}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    }).catch(() => {});
    fetchConversations();
  };

  const logout = () => {
    setIsLoggedIn(false);
    setToken("");
    setUserId(null);
    setMessages([]);
    setSearchResults([]);
    if (ws) {
      try {
        ws.close();
      } catch {}
      setWs(null);
    }
  };

  if (!isLoggedIn) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="auto" />
        <View style={styles.authContainer}>
          <Text style={styles.title}>Communication App</Text>
          <Text style={styles.statusText}>Backend Status: {backendStatus}</Text>

          <TextInput
            style={styles.input}
            placeholder="Username"
            value={username}
            onChangeText={setUsername}
          />

          {isRegistering && (
            <TextInput
              style={styles.input}
              placeholder="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
            />
          )}

          <TextInput
            style={styles.input}
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <TouchableOpacity style={styles.button} onPress={handleAuth}>
            <Text style={styles.buttonText}>
              {isRegistering ? "Register" : "Login"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.switchButton}
            onPress={() => setIsRegistering(!isRegistering)}
          >
            <Text style={styles.switchButtonText}>
              {isRegistering
                ? "Already have an account? Login"
                : "Need an account? Register"}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="auto" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Communication App</Text>
        <TouchableOpacity style={styles.logoutButton} onPress={logout}>
          <Text style={styles.logoutButtonText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
          {/* Conversations Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Conversations</Text>
            {conversations.length === 0 ? (
              <Text style={{ color: "#666" }}>No conversations yet.</Text>
            ) : (
              <View style={styles.convList}>
                {conversations.map((c) => (
                  <TouchableOpacity
                    key={c.user_id}
                    style={styles.convItem}
                    onPress={() => openConversation(c.user_id)}
                  >
                    <View
                      style={{ flexDirection: "row", alignItems: "center" }}
                    >
                      <Avatar
                        uid={c.user_id}
                        name={c.username || `User ${c.user_id}`}
                        size={34}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.convTitle}>
                          {c.username || `User ${c.user_id}`}
                        </Text>
                        <Text style={styles.convMeta} numberOfLines={1}>
                          {c.last_message}
                        </Text>
                      </View>
                      {!!c.unread_count && (
                        <View style={styles.unreadBadge}>
                          <Text style={styles.unreadText}>
                            {c.unread_count}
                          </Text>
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Chat Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Chat</Text>

            {/* User search */}
            <View style={{ marginBottom: 10 }}>
              <TextInput
                style={styles.input}
                placeholder="Search username..."
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
              />
              <TouchableOpacity style={styles.button} onPress={searchUsers}>
                <Text style={styles.buttonText}>Search Users</Text>
              </TouchableOpacity>
              {searchResults.length > 0 && (
                <View style={styles.resultsBox}>
                  {searchResults.map((u) => (
                    <TouchableOpacity
                      key={u.id}
                      style={styles.resultItem}
                      onPress={() => {
                        setRecipientId(String(u.id));
                        setRecipientName(u.username || "");
                        Alert.alert(
                          "Recipient Selected",
                          `${u.username} (id ${u.id})`
                        );
                      }}
                    >
                      <Text style={styles.resultText}>
                        {u.username} (id {u.id})
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <Text style={{ marginBottom: 6, color: "#666" }}>
              {`My ID: ${userId ?? "-"}`}
              {recipientId
                ? `   •   Recipient: ${
                    recipientName
                      ? recipientName + " (id " + recipientId + ")"
                      : "id " + recipientId
                  }`
                : ""}
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Recipient ID"
              value={recipientId}
              onChangeText={(v) => {
                setRecipientId(v);
                if (!v) setRecipientName("");
              }}
              keyboardType="numeric"
            />

            <ScrollView
              style={styles.messagesScroll}
              ref={messagesRef}
              onContentSizeChange={scrollToBottom}
            >
              {messages.map((msg, index) => {
                const isMine = msg.sender_id === userId;
                const displayName = nameForMessage(msg);
                const initials = initialsForName(displayName);
                const color = avatarColorForId(isMine ? userId : msg.sender_id);
                return (
                  <View
                    key={index}
                    style={[
                      styles.messageRow,
                      isMine ? styles.messageRowRight : styles.messageRowLeft,
                    ]}
                  >
                    {!isMine && (
                      <Avatar
                        uid={msg.sender_id}
                        name={displayName}
                        size={34}
                      />
                    )}
                    <View
                      style={[
                        styles.messageBubble,
                        isMine
                          ? styles.messageBubbleMy
                          : styles.messageBubbleOther,
                      ]}
                    >
                      <Text style={styles.messageName}>{displayName}</Text>
                      <Text style={styles.messageText}>{msg.content}</Text>
                      <Text style={styles.messageTime}>
                        {new Date(msg.timestamp).toLocaleTimeString()}
                      </Text>
                    </View>
                    {isMine && (
                      <Avatar uid={userId} name={displayName} size={34} />
                    )}
                  </View>
                );
              })}
            </ScrollView>

            <View style={styles.messageInputContainer}>
              <TextInput
                style={styles.messageInput}
                placeholder="Type a message..."
                value={newMessage}
                onChangeText={setNewMessage}
              />
              <TouchableOpacity style={styles.sendButton} onPress={sendMessage}>
                <Text style={styles.sendButtonText}>Send</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Payment Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Send Payment</Text>
            <TextInput
              style={styles.input}
              placeholder="Amount (in cents)"
              value={paymentAmount}
              onChangeText={setPaymentAmount}
              keyboardType="numeric"
            />
            <TouchableOpacity
              style={styles.paymentButton}
              onPress={createPayment}
            >
              <Text style={styles.paymentButtonText}>
                Create Payment Intent
              </Text>
            </TouchableOpacity>
            {!!paymentStatus && (
              <Text style={{ marginTop: 8, color: "#555" }}>
                {paymentStatus}
              </Text>
            )}

            <View style={{ marginTop: 16 }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Text style={styles.sectionTitle}>Received Payments</Text>
                <TouchableOpacity
                  style={[
                    styles.button,
                    {
                      paddingVertical: 8,
                      paddingHorizontal: 12,
                      marginBottom: 0,
                    },
                  ]}
                  onPress={loadReceivedPayments}
                >
                  <Text style={styles.buttonText}>Refresh</Text>
                </TouchableOpacity>
              </View>
              {receivedPayments.length === 0 ? (
                <Text style={{ color: "#666" }}>No received payments yet.</Text>
              ) : (
                <View style={styles.paymentList}>
                  {receivedPayments.map((p) => (
                    <View key={p.id} style={styles.paymentItem}>
                      <Text style={styles.paymentTitle}>{p.id}</Text>
                      <Text style={styles.paymentMeta}>{`Amount: $${(
                        p.amount / 100
                      ).toFixed(2)}  •  From: ${
                        p.sender_id ?? "-"
                      }  •  Status: ${p.status}`}</Text>
                      <Text style={styles.paymentMeta}>
                        {new Date(p.created * 1000).toLocaleString()}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
            <View style={{ marginTop: 20 }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Text style={styles.sectionTitle}>Sent Payments</Text>
                <TouchableOpacity
                  style={[
                    styles.button,
                    {
                      paddingVertical: 8,
                      paddingHorizontal: 12,
                      marginBottom: 0,
                    },
                  ]}
                  onPress={loadSentPayments}
                >
                  <Text style={styles.buttonText}>Refresh</Text>
                </TouchableOpacity>
              </View>
              {sentPayments.length === 0 ? (
                <Text style={{ color: "#666" }}>No sent payments yet.</Text>
              ) : (
                <View style={styles.paymentList}>
                  {sentPayments.map((p) => (
                    <View key={p.id} style={styles.paymentItem}>
                      <Text style={styles.paymentTitle}>{p.id}</Text>
                      <Text style={styles.paymentMeta}>{`Amount: $${(
                        p.amount / 100
                      ).toFixed(2)}  •  To: ${
                        p.recipient_id ?? "-"
                      }  •  Status: ${p.status}`}</Text>
                      <Text style={styles.paymentMeta}>
                        {new Date(p.created * 1000).toLocaleString()}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>

          {/* Call Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Voice/Video Calls</Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              {!inCall ? (
                <TouchableOpacity style={styles.button} onPress={startCall}>
                  <Text style={styles.buttonText}>
                    {isWeb ? "Start Call" : "Start Call (web only)"}
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.button, { backgroundColor: "#FF3B30" }]}
                  onPress={endCall}
                >
                  <Text style={styles.buttonText}>End Call</Text>
                </TouchableOpacity>
              )}
            </View>
            {/* For web preview, we won’t render native Video; show simple state */}
            <View style={{ marginTop: 10 }}>
              <Text style={styles.infoText}>
                {inCall ? "In Call" : "Not in call"}
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  authContainer: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 30,
    color: "#333",
  },
  statusText: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 20,
    color: "#666",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 15,
    marginBottom: 15,
    fontSize: 16,
    backgroundColor: "white",
  },
  button: {
    backgroundColor: "#007AFF",
    padding: 15,
    borderRadius: 8,
    marginBottom: 15,
  },
  buttonText: {
    color: "white",
    textAlign: "center",
    fontSize: 16,
    fontWeight: "bold",
  },
  switchButton: {
    padding: 10,
  },
  switchButtonText: {
    color: "#007AFF",
    textAlign: "center",
    fontSize: 14,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
  },
  logoutButton: {
    backgroundColor: "#FF3B30",
    padding: 8,
    borderRadius: 6,
  },
  logoutButtonText: {
    color: "white",
    fontSize: 14,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  section: {
    backgroundColor: "white",
    padding: 20,
    borderRadius: 12,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 15,
    color: "#333",
  },
  resultsBox: {
    backgroundColor: "#fafafa",
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 8,
    marginBottom: 10,
  },
  resultItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  resultText: {
    fontSize: 14,
    color: "#333",
  },
  messageContainer: {
    maxHeight: 200,
    marginBottom: 15,
  },
  message: {
    backgroundColor: "#E3F2FD",
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
  },
  messageText: {
    fontSize: 14,
    color: "#333",
  },
  messageTime: {
    fontSize: 12,
    color: "#666",
    marginTop: 4,
  },
  messageInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  messageInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 12,
    marginRight: 10,
    backgroundColor: "white",
  },
  sendButton: {
    backgroundColor: "#007AFF",
    padding: 12,
    borderRadius: 8,
  },
  sendButtonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "bold",
  },
  paymentButton: {
    backgroundColor: "#34C759",
    padding: 15,
    borderRadius: 8,
  },
  paymentButtonText: {
    color: "white",
    textAlign: "center",
    fontSize: 16,
    fontWeight: "bold",
  },
  paymentList: {
    marginTop: 8,
  },
  paymentItem: {
    backgroundColor: "#fafafa",
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  paymentTitle: {
    fontSize: 13,
    color: "#333",
    fontWeight: "600",
    marginBottom: 2,
  },
  paymentMeta: {
    fontSize: 12,
    color: "#666",
  },
  infoText: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    fontStyle: "italic",
  },
  messagesScroll: {
    height: 260,
    marginBottom: 10,
  },
  messageRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginBottom: 8,
  },
  messageRowLeft: {
    justifyContent: "flex-start",
  },
  messageRowRight: {
    justifyContent: "flex-end",
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 6,
  },
  avatarText: {
    color: "white",
    fontWeight: "700",
    fontSize: 12,
  },
  messageBubble: {
    maxWidth: "75%",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  messageBubbleMy: {
    backgroundColor: "#D1ECFF",
    alignSelf: "flex-end",
    borderTopRightRadius: 4,
  },
  messageBubbleOther: {
    backgroundColor: "#F1F1F1",
    alignSelf: "flex-start",
    borderTopLeftRadius: 4,
  },
  messageName: {
    fontSize: 11,
    color: "#555",
    marginBottom: 2,
  },
  messageText: {
    fontSize: 14,
    color: "#222",
  },
  messageTime: {
    fontSize: 11,
    color: "#666",
    marginTop: 4,
    alignSelf: "flex-end",
  },
  convList: {
    marginTop: 6,
  },
  convItem: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    position: "relative",
  },
  convTitle: {
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  convMeta: {
    color: "#666",
    fontSize: 12,
  },
  unreadBadge: {
    position: "absolute",
    right: 10,
    top: 10,
    backgroundColor: "#FF3B30",
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  unreadText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
});
