# THE LEDGER

## AI-Powered Recruitment & Interview Management Platform

The Ledger is a production-grade AI Recruitment and Interview Management Platform designed to streamline the entire hiring lifecycle for recruiters and candidates. It enables organizations to create company profiles, publish job openings, define customizable interview pipelines, receive and manage applications, perform AI-powered ATS resume analysis, rank candidates, schedule interviews, conduct real-time video interviews, and manage recruitment workflows through intelligent AI assistants. Candidates can build professional profiles, upload resumes, apply for jobs, track application progress, schedule interviews through conversational AI, join WebRTC-based interview meetings, and manage their interview journey from a single platform.

The platform follows a production-first engineering philosophy where correctness, scalability, maintainability, security, accessibility, and performance are prioritized over rapid code generation. Every implementation must follow the engineering lifecycle of Inspect → Understand → Plan → Implement → Verify → Review → Fix → Document. Existing code should always be inspected before modification, working functionality should never be rewritten without understanding its purpose, and all changes must be verified before being considered complete.

The system consists of multiple integrated modules including Authentication, Candidate Portal, Recruiter Portal, Admin Portal, Company Profiles, Public Company Pages, Job Management, Resume Management, AI ATS Resume Analysis, Candidate Ranking, Recruitment Pipelines, Interview Scheduling, Recruiter Calendars, Candidate Calendars, AI Booking Assistant, AI Chat Assistant, WebRTC Meeting Rooms, Socket.IO Real-Time Synchronization, Notifications, Analytics, Settings, and Profile Management. Every module shares common business services rather than duplicating logic across different parts of the application.

The AI layer provides ATS resume scoring, resume skill extraction, intelligent candidate ranking, conversational interview scheduling, availability search using natural language, interview rescheduling, interview cancellation, recruiter assistance, and candidate assistance. AI is never treated as the source of truth. Every AI request is converted into validated backend tool calls, authorization is always enforced on the server, all tool inputs are schema validated, and MongoDB remains the authoritative data source.

The architecture follows a clean separation of responsibilities:

Frontend (React, TypeScript, Vite, Tailwind CSS, TanStack Query, React Router, React Hook Form, Zod, Socket.IO Client, Framer Motion) → REST API → Express Backend → Business Services → MongoDB → Socket.IO → AI Provider → WebRTC Meeting Service → Notification Layer.

Business logic always belongs to backend services. Controllers remain thin, routes only provide request wiring, frontend components only render UI and manage client state, and all important validation happens on the backend.

The platform includes production-ready features such as JWT Authentication, Role-Based Access Control, Recruiter Isolation, Multi-Tenant Scheduling, Transaction-Safe Interview Booking, Conflict Detection, Timezone-Aware Scheduling, Availability Engine, MongoDB Transactions, Secure Guest Management, WebRTC Video Meetings, Socket.IO Real-Time Updates, AI Tool Validation, Input Validation, Rate Limiting, Security Headers, Error Handling, Retry Mechanisms, Responsive Design, Dark Mode Support, Accessibility Compliance, and Build Optimizations.

Technology Stack:

Frontend: React, TypeScript, Vite, Tailwind CSS, TanStack Query, React Router, React Hook Form, Zod, Socket.IO Client, Framer Motion

Backend: Node.js, Express.js, TypeScript, MongoDB, Mongoose, Socket.IO, JWT Authentication, Zod Validation, Luxon

AI: OpenRouter, LLM Tool Calling, Structured AI Tool Architecture

Realtime: Socket.IO

Meetings: WebRTC

Deployment: Vercel, Render, MongoDB Atlas

Engineering Principles:

- Build production-ready software rather than demo applications.
- Reuse existing business logic instead of duplicating functionality.
- Keep backend as the single source of truth.
- Never trust client-side validation or AI output.
- Ensure scalability, maintainability, security, and testability.
- Write type-safe, reusable, and well-documented code.
- Follow clean architecture and separation of concerns.
- Verify every implementation before claiming completion.
- Preserve working code unless a justified architectural improvement is required.

Development Workflow:

Before implementing any feature, always inspect the repository, understand the existing architecture, identify reusable services, create an implementation plan, implement incrementally, verify functionality through builds and testing, review changes, document architectural decisions, and only then proceed to the next phase. Never overwrite working code without a clear reason and never claim verification without actually running the appropriate checks.

Future Roadmap:

The platform is designed for future expansion with support for multi-recruiter organizations, panel interviews, calendar integrations, automated email and SMS notifications, AI interview evaluation, coding assessment modules, candidate skill graphs, offer management, HR analytics dashboards, interview recording, TURN server integration for WebRTC, CI/CD pipelines, Docker, Kubernetes deployment, and enterprise-scale infrastructure while preserving the existing clean architecture and production-quality engineering standards.
