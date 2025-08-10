import React, { useState, useEffect } from "react";
import "./App.css";
import io from "socket.io-client";

const BACKEND_URL = "https://comm-app-backend.onrender.com";

function App() {
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
        method: "POST",
        headers,
        body,
      });

      if (response.ok) {
        const data = await response.json();
        if (isRegistering) {
          alert("User registered successfully! Please login.");
          setIsRegistering(false);
        } else {
          setToken(data.access_token);
          setIsLoggedIn(true);
          alert("Login successful!");
        }
      } else {
        const error = await response.json();
        alert("Error: " + (error.detail || "Authentication failed"));
      }
    } catch (error) {
      alert("Network error: " + error.message);
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
        alert(`Payment Intent Created! Client Secret: ${data.client_secret}`);
      } else {
        const error = await response.json();
        alert("Payment Error: " + (error.detail || "Payment failed"));
      }
    } catch (error) {
      alert("Payment error: " + error.message);
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
      <div className="App">
        <div className="auth-container">
          <h1 className="title">Communication App</h1>

          <input
            className="input"
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />

          {isRegistering && (
            <input
              className="input"
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}

          <input
            className="input"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button className="button" onClick={handleAuth}>
            {isRegistering ? "Register" : "Login"}
          </button>

          <button
            className="switch-button"
            onClick={() => setIsRegistering(!isRegistering)}
          >
            {isRegistering
              ? "Already have an account? Login"
              : "Need an account? Register"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="App">
      <header className="header">
        <h1 className="header-title">Communication App</h1>
        <button className="logout-button" onClick={logout}>
          Logout
        </button>
      </header>

      <div className="content">
        {/* Chat Section */}
        <div className="section">
          <h2 className="section-title">Chat</h2>
          <input
            className="input"
            type="number"
            placeholder="Recipient ID"
            value={recipientId}
            onChange={(e) => setRecipientId(e.target.value)}
          />
          <div className="message-container">
            {messages.map((msg, index) => (
              <div key={index} className="message">
                <div className="message-text">{msg.content}</div>
                <div className="message-time">
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>
          <div className="message-input-container">
            <input
              className="message-input"
              type="text"
              placeholder="Type a message..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
            />
            <button className="send-button" onClick={sendMessage}>
              Send
            </button>
          </div>
        </div>

        {/* Payment Section */}
        <div className="section">
          <h2 className="section-title">Send Payment</h2>
          <input
            className="input"
            type="number"
            placeholder="Amount (in cents)"
            value={paymentAmount}
            onChange={(e) => setPaymentAmount(e.target.value)}
          />
          <button className="payment-button" onClick={createPayment}>
            Create Payment Intent
          </button>
        </div>

        {/* Call Section */}
        <div className="section">
          <h2 className="section-title">Voice/Video Calls</h2>
          <p className="info-text">
            WebRTC integration ready. Call functionality will be implemented in
            next iteration.
          </p>
        </div>
      </div>
    </div>
  );
}

export default App;
