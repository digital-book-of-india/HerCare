# HerCare Admin Panel

The web administrative dashboard for HerCare (Women's Wellness & Period Tracker).

Built with **React**, **Vite**, **Lucide Icons**, and a clean, responsive medical-grade design system.

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js 20+**
- The HerCare backend running at `http://localhost:5000` (`cd ../backend && npm run dev`)

### 2. Run the Development Server
```bash
cd admin
npm install
npm run dev
```
Open **[http://localhost:5173](http://localhost:5173)** in your browser.
API calls are automatically proxied from `/api` to `http://localhost:5000`.

### 3. Production Build
```bash
npm run build
```
Build output is saved to `dist/`.

---

## 🔒 The 5 Essential Features Implemented

| Feature | Endpoints Behind It | UI Screen & Functionality |
|---|---|---|
| **1. Admin Sign In & Session** | `POST /api/admin/auth/login`<br>`GET /api/admin/me` | Single predefined admin account (`admin@hercare.local`). 8-hour session token with in-memory/session storage. Rate-limit lockout notification if 5 consecutive failed attempts occur (`429 RATE_LIMITED`). |
| **2. Dashboard Overview** | `GET /api/admin/dashboard` | Aggregates only. Real-time platform metrics: Users (Total, Active 7D, Active 30D), Logged Records (Periods, Symptoms, Checklist tasks, Hydration marks), and Active Reminders. **Zero-PII Privacy Enforced:** Counts between 1 and 4 are rendered with `<5` masking badges. |
| **3. Tips Management** | `GET/POST /api/admin/tips`<br>`PATCH/DELETE /api/admin/tips/:id`<br>`POST /api/admin/tips/:id/review`<br>`PATCH /api/admin/tips/:id/active` | **Clinical Review Gate Enforcement:**<br>1. *Write Draft* (starts inactive and hidden).<br>2. *Record Clinical Review* (clinician name and date of approval).<br>3. *Activate* (activation toggle is disabled with clinical review requirement tooltip until approved).<br>4. *Wording Change Safety*: Editing title or content of an approved/live tip automatically clears review (`reviewReset: true`) and takes it offline until re-approved. |
| **4. Default Texts & Content** | `GET/PATCH /api/admin/content` | • **Medical Disclaimer:** 20 to 2000 chars, non-blank validation.<br>• **Privacy Disclosure Notice:** 20 to 4000 chars.<br>• **Default Self-Care Checklist:** Manage up to 20 starter items (`id` slug regex and label 1–80 chars) for newly registered accounts. |
| **5. Feature Switch & Defaults** | `GET/PATCH /api/admin/settings` | • **Master Feature Switch (`featureEnabled`):** Global toggle with double confirmation before disabling. When off, mobile screens return `FEATURE_DISABLED` while users can still export or erase their data.<br>• **Default Cycle Length:** 15 to 60 days.<br>• **Default Period Duration:** 1 to 15 days.<br>• Server cache sync within ~10 seconds. |

---

## 📂 Project Structure

```text
admin/
├── src/
│   ├── components/
│   │   ├── ConfirmModal.jsx    # Danger & action confirmation modals
│   │   ├── Navbar.jsx          # Brand header, navigation tabs, live status & logout
│   │   ├── ReviewModal.jsx     # Clinical sign-off and approval modal
│   │   └── TipModal.jsx        # Tip create/edit modal with review reset warning
│   ├── pages/
│   │   ├── DashboardPage.jsx   # Aggregates only, <5 mask badge, user & logging metrics
│   │   ├── SettingsPage.jsx    # Feature switch with confirmation & cycle defaults
│   │   ├── SignInPage.jsx      # Predefined admin auth with rate limit warning
│   │   ├── TextsPage.jsx       # Disclaimer, privacy policy & default checklist editor
│   │   └── TipsPage.jsx        # 3-step clinical review workflow & tip catalog
│   ├── services/
│   │   └── api.js              # /api/admin/* client with session token & error parser
│   ├── utils/
│   │   └── formatters.js       # Date formatting and status badge resolvers
│   ├── App.jsx                 # App root with session verification and routing
│   ├── main.jsx                # React root mount
│   └── index.css               # HerCare design system stylesheet
├── index.html
├── package.json
└── vite.config.js              # Vite config with backend proxy to port 5000
```
