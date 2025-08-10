import React, { useState, useEffect } from "react";
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
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { API_URL } from "./config"; // Import from config

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

    const wsUrl = `${API_URL.replace("http", "ws")}/chat/ws/${userId}`;
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
        if (payload.type === "new_message" && payload.message) {
          setMessages((prev) => [...prev, payload.message]);
        }
      } catch {
        // ignore non-JSON
      }
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
        setMessages((prev) => [...prev, sent]);
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

            <ScrollView style={styles.messagesScroll}>
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
                      <View style={[styles.avatar, { backgroundColor: color }]}>
                        <Text style={styles.avatarText}>{initials}</Text>
                      </View>
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
                      <View style={[styles.avatar, { backgroundColor: color }]}>
                        <Text style={styles.avatarText}>{initials}</Text>
                      </View>
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
          </View>

          {/* Call Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Voice/Video Calls</Text>
            <Text style={styles.infoText}>
              WebRTC integration ready. Call functionality will be implemented
              in next iteration.
            </Text>
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
});
