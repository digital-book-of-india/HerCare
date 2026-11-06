# HerCare - Women’s Wellness & Period Tracker

A free, privacy-focused period tracker and wellness helper inside the DBI app. Users record period dates, symptoms and mood, get reminders, and follow simple self-care tips. It is a wellness and tracking tool, **not** a medical diagnosis or contraception app, and every predicted date is an **estimate**.

---

## 📱 Version 1 features

- **Period calendar and predictions:** estimated next period from the user’s own history, clearly labelled as an estimate.
- **Complete period history:** every logged cycle, with actual dates kept separate from estimated ones.
- **Reminders:** upcoming period, daily logging and hydration reminders the user controls (pause, snooze, turn off).
- **Symptom and flow log:** cramps, headache, mood, energy and flow (light, medium, heavy), plus an optional note.
- **Daily self-care:** an editable checklist, hydration reminders and short, clinician-reviewed food and activity tips.

Works offline and syncs to the server. No AI and no subscription. Not in v1: ovulation or fertility information, pregnancy claims, diagnosis, social features, advanced analytics.

---

## 🚦 Status

| Part | State |
|---|---|
| **Backend** (`backend/`) | Built and tested, with full documentation |
| **Mobile app** (`mobile/`) | Not built yet. Start at `backend/docs/mobile-integration-guide.md` |
| **Admin panel** (`admin/`) | Backend API built; interface not built yet. Start at `backend/docs/admin-panel-guide.md` |
| **Clinical review** of tips and texts | Pending: `backend/docs/clinical-review-process.md` |

---

## 📂 Repository structure

```text
HerCare/
├── backend/                # The API (Node.js, Express, MongoDB): finished
│   ├── src/                # routes, controllers, services, models, middlewares, ...
│   ├── tests/              # offline tests, and live API tests in tests/api/
│   └── docs/               # all documentation and the API reference
│
├── mobile/                 # Mobile client (to be built)
├── admin/                  # Admin panel interface (to be built)
├── context.md              # Running project log: decisions, phases, API notes
└── README.md               # This file
```

---

## 🚀 Getting started

The backend needs **Node.js 20+** and **MongoDB**.

```bash
cd backend
npm install
cp .env.example .env     # then fill it in
npm run seed
npm run dev              # http://localhost:5000
```

Everything else (every setting, deploying, testing, the API reference, the guides for the mobile and admin developers) is in **[backend/docs/README.md](backend/docs/README.md)**.
