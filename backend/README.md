# HerCare Backend API

Backend REST API for HerCare Women's Wellness & Period Tracker.

## Directory Overview

- `src/config/`: Database connections, environment configurations, and security settings.
- `src/controllers/`: Request handlers for authentication, cycle logging, wellness metrics, and insights.
- `src/middlewares/`: Authentication verification (JWT), request validation, and error handling.
- `src/models/`: Database schemas (User, Cycle, DailyLog, Symptom, Mood, Reminder).
- `src/routes/`: Express/FastAPI route definitions mapping endpoints to controllers.
- `src/services/`: Core logic:
  - Period and ovulation window calculation engine.
  - Cycle length rolling average algorithm.
  - Push notification scheduler.
- `src/utils/`: Common helper functions, date calculations, and response formatters.
