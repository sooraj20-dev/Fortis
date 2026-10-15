# FORTIS AI FITNESS — Adaptive Personal Fitness Intelligence Platform

> **In One Sentence:**  
> Fortis is an AI-powered fitness platform that uses **computer-vision body scans**, **real-time recovery tracking (Fortis Pulse)**, and **regional nutrition planning** to continuously adapt your workouts and meal plans instead of giving you static cookie-cutter templates.

---

## 🚀 Quick Start

### Deploy frontend and API to Vercel

The root [`vercel.json`](./vercel.json) builds the Vite frontend and the FastAPI backend as a Python 3.12 serverless function. The frontend uses same-origin `/api` requests in production, so no public backend URL or CORS configuration is needed.

1. Push the project to GitHub and import the repository in Vercel. Keep the project root directory set to the repository root.
2. In the Vercel project settings, add these environment variables for **Production**, **Preview**, and **Development** as needed:
   - `MONGODB_URL`: a MongoDB connection string for a database reachable from Vercel.
   - `MONGODB_DB_NAME`: the database name (for example, `fortis`).
   - `JWT_SECRET`: a unique, randomly generated secret of at least 32 characters.
   - `AI_PROVIDER=gemini`, `GEMINI_API_KEY`, and `GEMINI_MODEL=gemini-3.8-flash` for the AI Coach and Vision features.
3. Deploy. The app is served at `/`; the API and interactive API docs are available at `/api/...` and `/docs`.

Vercel functions are stateless: application records are stored in MongoDB, while temporary scan and exercise uploads use `/tmp` and are not retained between requests. The API caps uploads at 4 MB on Vercel to stay below the platform's request-body limit. Video analysis can also exceed the function-duration limit for larger or longer clips; use a dedicated backend host and object storage if those workloads are required.

### First-time setup

Requirements: Python 3.11 or newer, Node.js 18 or newer, and a reachable MongoDB database.

1. Create the backend environment and install dependencies:

   ```powershell
   cd backend
   py -3 -m venv venv
   .\venv\Scripts\Activate.ps1
   python -m pip install --upgrade pip
   pip install -r requirements.txt
   Copy-Item .env.example .env
   ```

2. Edit `backend/.env` and set `MONGODB_URL` to your MongoDB connection string and `JWT_SECRET` to a unique random value of at least 32 characters. Do not commit `.env` or share its values.

3. Install frontend dependencies:

   ```powershell
   cd ..\frontend
   npm ci
   ```

### Start the application on Windows

After first-time setup, run:

```powershell
.\start.bat
# or in PowerShell:
.\start.ps1
```
The launchers start:
- **Frontend App**: [http://localhost:5173](http://localhost:5173)
- **Backend API Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)

### Manual start

**1. Start Backend:**
```powershell
cd backend
.\venv\Scripts\Activate.ps1
python run.py
```

**2. Start Frontend:**
```powershell
cd frontend
npm run dev
```

---

## 👤 Demo account

For a local demo, register an account with these credentials; demo sign-in works once the account exists:
- **Email:** `demo@fortis.ai`
- **Password:** `Demo@123`
The exercise and food catalogs are seeded on backend startup when their collections are empty.

---

## 🧠 What Makes Fortis Unique? (The 3 Pillars)



        ┌────────────────────────────────────────────────────────┐
        │                       FORTIS AI                        │
        └──────────────────────────┬─────────────────────────────┘
                                   │
         ┌─────────────────────────┼─────────────────────────┐
         ▼                         ▼                         ▼
   1. AI BODY SCAN        2. FORTIS PULSE           3. ADAPTIVE NUTRITION
  MediaPipe Tasks 3D     Daily Fitness State         Regional Food Engine
  Kinematic Tracker        Dynamic Feedback            Budget Optimizer
```

### 1. 👁️ AI Computer-Vision Body Scan
- **Powered by:** MediaPipe Tasks Pose Landmarker & OpenCV (Python 3.14 on Windows).
- **How it works:**
  1. The user points their webcam or uploads a video doing 3 squats.
  2. MediaPipe tracks **33 skeleton keypoints** in real-time.
  3. Fortis computes joint angles (knee flexion, hip depth, torso sway, asymmetry).
  4. Generates an instant **Movement Profile** (Mobility, Stability, Consistency).
  5. Recalculates your training plan into an **Adaptive Blueprint**.
- **No webcam?** Includes a 1-click **Movement Simulation** mode for immediate testing.

### 2. ⚡ Fortis Pulse & Decision Engine
- Rather than static routines, Fortis computes your **Fortis Pulse (0–100)** every day:
  $$\text{Pulse} = w_1(\text{Strength}) + w_2(\text{Recovery}) + w_3(\text{Consistency}) + w_4(\text{Nutrition}) + w_5(\text{Fatigue Risk}) + w_6(\text{Movement})$$
- The **Decision Engine** adapts your workout intensity dynamically:
  - `PROGRESSIVE` (Ready for overload)
  - `NORMAL` (Standard training load)
  - `REDUCED` (Minor fatigue detected)
  - `RECOVERY` (Active mobility & light tissue repair)
  - `REST` (High fatigue risk / injury prevention)

### 3. 🍛 Regional Nutrition Intelligence (Kerala / Indian Staples)
- Real database of Indian & South Indian foods (Puttu, Kadala, Appam, Fish Curry, Eggs, Chapati).
- **Budget Optimizer:** Calibrates daily meal plans to meet macro targets within budget limits (e.g., ₹150/day).
- **Weekly Grocery Generator:** Auto-aggregates weekly shopping ingredients with cost breakdowns.

---

## 🏗️ Architecture & Tech Stack

```
Frontend (React 18 + Vite + TypeScript + Tailwind)
   ↓  HTTP / REST (Axios)
Backend (FastAPI + MongoDB)
   ↓
Vision & ML Engine:
   ├── MediaPipe Tasks Pose Landmarker (3D biomechanics)
   ├── OpenCV (Video capture & frame pre-processing)
   ├── Fortis Decision Engine (Rule-based expert system)
   └── Interpretable Fatigue Predictor (7-day weighted recovery model)
```

| Component | Technology | Why It Was Chosen |
| --- | --- | --- |
| **Backend** | Python 3.11+, FastAPI | API with automated interactive Swagger docs (`/docs`). |
| **Database** | MongoDB + PyMongo | Persistent application data in a MongoDB database configured through `MONGODB_URL`. |
| **Vision AI** | MediaPipe Tasks (Pose Landmarker) | Fast, private, monocular 3D skeleton tracking running directly on CPU. |
| **Frontend** | React 18, Vite, Tailwind CSS | Lightning fast build, modern responsive UI, dark mode aesthetic. |
| **State & Auth** | Zustand + JWT | Persistent offline-friendly auth store and clean token management. |

---

## 🎯 How to Explain the Project in 2 Minutes (Viva / Presentation Guide)

1. **The Hook:**  
   *"Most fitness apps give users static workout plans that ignore how tired they are, how well they move, or what local foods they eat."*

2. **The Solution:**  
   *"Fortis creates a closed-loop intelligence system: it looks at user movement through computer vision, predicts daily fatigue, and dynamically adjusts training and diet."*

3. **The Tech Demo:**  
   - Show the **Dashboard**: The dynamic Fortis Pulse score and today's AI recommendation.
   - Show **Fortis Scan**: Open the camera, perform a squat or run simulation, watch MediaPipe detect 33 joint landmarks, and see the movement score update the workout blueprint.
   - Show **Nutrition**: Demonstrate the Kerala regional diet meal planner with the ₹150/day budget optimizer.
   - Show **AI Coach**: Ask the AI Coach *"Why did my workout change today?"* and show how it explains its reasoning based on real scan and sleep data.

---

## 📂 Project Directory Structure

```text
Fortis/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI application & startup lifespan
│   │   ├── config.py            # App settings (MongoDB, JWT, AI)
│   │   ├── database.py          # MongoDB-backed data access
│   │   ├── intelligence/        # Decision Engine & Fitness State calculator
│   │   ├── ml/                  # Fatigue & trend progression models
│   │   ├── models/              # SQLAlchemy database tables
│   │   ├── nutrition/           # Regional foods & budget optimizer
│   │   ├── routers/             # API routes (scan, auth, workout, coach, etc.)
│   │   └── vision/              # MediaPipe Pose Landmarker vision pipeline
│   │       ├── models/          # pose_landmarker.task model file
│   │       ├── body_scan.py     # Modern MediaPipe Tasks extractor
│   │       └── scan_service.py  # Kinematic scoring & pulse sync
│   ├── run.py                   # Single-command backend starter
│   └── requirements.txt         # Python dependencies
│
├── frontend/
│   ├── src/
│   │   ├── pages/               # Landing, Auth, Dashboard, Scan, Workout, Nutrition
│   │   ├── components/          # Reusable UI widgets & Splash screen
│   │   ├── layouts/             # AppLayout with sidebar & header
│   │   ├── services/            # Axios API clients (api.ts, scanApi.ts)
│   │   └── stores/              # Zustand auth & fitness stores
│   └── package.json             # React dependencies
│
├── start.bat                    # 1-Click launcher (Windows CMD)
├── start.ps1                    # 1-Click launcher (PowerShell)
└── README.md                    # Project documentation
```

---

## 🔒 Privacy & Responsible AI

- **Camera privacy:** Video streams are analyzed in-memory; raw video is never stored on disk or sent to 3rd-party servers.
- **Responsible AI Disclaimer:** Fortis provides functional movement and fitness guidance. It is not a clinical medical diagnostic device.
