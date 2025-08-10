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
} from "react-native";
import { StatusBar } from "expo-status-bar";
import io from "socket.io-client";
import { StripeProvider } from "@stripe/stripe-react-native";

const BACKEND_URL = "https://comm-app-backend.onrender.com";

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [token, setToken] = useState("");
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [socket, setSocket] = useState(null);
  const [recipientId, setRecipientId] = useState("1");
  const [paymentAmount, setPaymentAmount] = useState("1000");

  // Initialize WebSocket connection
  useEffect(() => {
    if (token && !socket) {
      const newSocket = io(BACKEND_URL, {
        auth: { token },
      });

      newSocket.on("connect", () => {
        console.log("Connected to WebSocket");
      });

      newSocket.on("message", (message) => {
        setMessages((prev) => [...prev, message]);
      });

      setSocket(newSocket);
    }

    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, [token]);

  const handleAuth = async () => {
    try {
      const endpoint = isRegistering ? "/auth/register" : "/auth/token";
      const method = isRegistering ? "POST" : "POST";

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

      const response = await fetch(`${BACKEND_URL}${endpoint}`, {
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

  const sendMessage = () => {
    if (newMessage.trim() && socket) {
      const message = {
        content: newMessage,
        sender_id: 1, // For MVP, hardcoded
        receiver_id: parseInt(recipientId),
        timestamp: new Date().toISOString(),
      };

      socket.emit("message", message);
      setMessages((prev) => [...prev, message]);
      setNewMessage("");
    }
  };

  const createPayment = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/payment/create-intent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          amount: parseInt(paymentAmount),
          recipient_id: parseInt(recipientId),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        Alert.alert(
          "Payment Intent Created",
          `Client Secret: ${data.client_secret}`
        );
      } else {
        const error = await response.json();
        Alert.alert("Payment Error", error.detail || "Payment failed");
      }
    } catch (error) {
      Alert.alert("Error", "Payment error: " + error.message);
    }
  };

  const logout = () => {
    setIsLoggedIn(false);
    setToken("");
    setMessages([]);
    if (socket) {
      socket.disconnect();
      setSocket(null);
    }
  };

  if (!isLoggedIn) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="auto" />
        <View style={styles.authContainer}>
          <Text style={styles.title}>Communication App</Text>

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

      <ScrollView style={styles.content}>
        {/* Chat Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Chat</Text>
          <TextInput
            style={styles.input}
            placeholder="Recipient ID"
            value={recipientId}
            onChangeText={setRecipientId}
            keyboardType="numeric"
          />
          <View style={styles.messageContainer}>
            {messages.map((msg, index) => (
              <View key={index} style={styles.message}>
                <Text style={styles.messageText}>{msg.content}</Text>
                <Text style={styles.messageTime}>
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </Text>
              </View>
            ))}
          </View>
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
            <Text style={styles.paymentButtonText}>Create Payment Intent</Text>
          </TouchableOpacity>
        </View>

        {/* Call Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Voice/Video Calls</Text>
          <Text style={styles.infoText}>
            WebRTC integration ready. Call functionality will be implemented in
            next iteration.
          </Text>
        </View>
      </ScrollView>
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
});
