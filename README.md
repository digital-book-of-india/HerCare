# HerCare - Women’s Wellness & Period Tracker

A modern, privacy-focused mobile application and backend designed for tracking menstrual cycles, ovulation windows, symptoms, moods, and overall wellness.

---

## 📱 Features

- **Cycle & Ovulation Tracking**: Accurate prediction of next period, fertile window, and ovulation day.
- **Symptom & Mood Logging**: Daily logs for flow intensity, cramps, mood changes, physical symptoms, and energy levels.
- **Wellness & Health Insights**: Hydration reminders, sleep tracking, and personalized wellness tips based on cycle phase.
- **Privacy & Security**: Secure user authentication and local/encrypted cloud data storage.
- **Reminders & Notifications**: Gentle alerts before cycle start, fertile days, and daily logging reminders.

---

## 📂 Repository Structure

```text
HerCare/
├── mobile/                 # Mobile client application
│   ├── src/
│   │   ├── assets/         # Images, fonts, and icons
│   │   ├── components/     # Reusable UI widgets and elements
│   │   ├── context/        # State management & global context
│   │   ├── navigation/     # App routing & navigation stacks
│   │   ├── screens/        # UI screens (Home, Calendar, Symptoms, Insights, Profile)
│   │   ├── services/       # API clients, local storage, push notifications
│   │   └── utils/          # Cycle calculators, date formatters, validators
│   └── README.md
│
├── backend/                # Backend API service
│   ├── src/
│   │   ├── config/         # Database and server configuration
│   │   ├── controllers/    # API request handlers
│   │   ├── middlewares/    # Authentication, validation, and error handling
│   │   ├── models/         # Database schemas / entity definitions
│   │   ├── routes/         # REST API endpoints
│   │   ├── services/       # Business logic (cycle prediction engine, analytics)
│   │   └── utils/          # Helper functions and constants
│   └── README.md
│
├── .gitignore              # Standard git ignore rules
└── README.md               # Main project documentation
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+) or Python (v3.10+) depending on preferred backend stack
- React Native / Flutter SDK for mobile app development
- Git

### Setup
1. Clone the repository:
   ```bash
   git clone https://github.com/digital-book-of-india/HerCare.git
   cd HerCare
   ```
2. Navigate to `mobile/` or `backend/` and follow their respective `README.md` setup instructions.
