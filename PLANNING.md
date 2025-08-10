# Project Planning: Communication App MVP

## Overview
This project aims to build a Minimum Viable Product (MVP) for a cross-platform communication app that supports text messaging, audio calls, video calls, and payment sending. It incorporates best features from apps like WhatsApp (end-to-end encryption, status updates), Viber (free calls), Telegram (channels, bots), Teams/Slack (team collaboration, integrations), Zoom (high-quality video), WeChat (payments, mini-apps), and others. The app will work on mobile (iOS/Android) and desktop (Windows/Mac/Linux).

The MVP will focus on core features to make it simple and easy to follow, using best practices and modern techniques. Since there are no developers or testers, we'll use AI-driven development, unit tests, and n8n for quick proof-of-concepts where applicable (e.g., workflow integrations for payments or notifications).

## Goals
- Provide seamless text chatting with real-time delivery.
- Enable audio and video calls using WebRTC for peer-to-peer efficiency.
- Integrate payment sending via Stripe for secure transactions.
- Ensure cross-platform compatibility.
- Prioritize security (E2E encryption), privacy, and user-friendly UI.
- Make it scalable and maintainable.

## Architecture
- **Backend**: Python with FastAPI for RESTful APIs and WebSockets for real-time features.
- **Database**: PostgreSQL (deployed on Render) for user data, messages, and transactions. Use SQLAlchemy or SQLModel for ORM.
- **Realtime Communication**: Socket.IO for messaging; WebRTC for calls (with signaling server in FastAPI).
- **Frontend**:
  - Mobile: React Native for iOS/Android.
  - Desktop: React with Electron or Tauri for native feel.
  - Shared codebase where possible using React Native for Web.
- **Payments**: Stripe API integration.
- **Authentication**: JWT with OAuth options (Google, etc.).
- **Deployment**:
  - Backend and DB on Render.
  - Frontend hosted on Vercel or Render static sites; mobile apps via app stores (for MVP, focus on web-first).
- **Other Tech**:
  - Encryption: Signal Protocol or similar for E2E.
  - Testing: Pytest for unit tests.
  - Workflows: n8n for PoC of integrations (e.g., payment notifications).
- **Best Practices**: Modular code, max 500 lines per file, PEP8, type hints, Black formatting, Pydantic validation, docstrings.

## Style and Constraints
- Primary language: Python for backend.
- Naming: snake_case for files/functions, CamelCase for classes.
- File structure: Modular, with /app (backend), /frontend (React Native), /tests.
- Constraints: Keep it simple; start with web version for quick MVP, extend to native later. Use open-source where possible to avoid costs.

## Development Approach
- Break into tasks, each handled by an 'AI agent' (sequential tool calls).
- Use n8n for rapid prototyping of non-core features (e.g., email notifications, payment webhooks).
- Ensure everything is testable and documented.
