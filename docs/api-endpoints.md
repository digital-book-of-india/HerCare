# HerCare API Specification

## Authentication Endpoints
- `POST /api/v1/auth/register` - Create new user account
- `POST /api/v1/auth/login` - User login & token generation
- `GET /api/v1/auth/me` - Current user profile

## Cycle & Tracking Endpoints
- `GET /api/v1/cycles` - Retrieve cycle history and predicted next periods
- `POST /api/v1/cycles` - Log a new period cycle start/end date
- `GET /api/v1/cycles/predictions` - Get calculated fertile window & ovulation estimates

## Daily Logs & Symptoms
- `GET /api/v1/logs/daily?date=YYYY-MM-DD` - Fetch log for specific date
- `POST /api/v1/logs/daily` - Save symptoms, flow intensity, mood, notes
- `GET /api/v1/logs/summary` - Fetch monthly calendar summary view

## Reminders
- `GET /api/v1/reminders` - Retrieve active notification reminders
- `PUT /api/v1/reminders` - Update reminder preferences (period alert, fertile window, pills)
