# HerCare Mobile Application

Mobile client for the HerCare Women's Wellness & Period Tracker app.

## Directory Overview

- `src/assets/`: Static image assets, icons, fonts, and illustrations.
- `src/components/`: Modular, reusable UI components (CalendarWidget, SymptomChip, MoodSelector, etc.).
- `src/context/`: State management providers (CycleContext, AuthContext, ThemeContext).
- `src/navigation/`: App navigators (Bottom Tabs, Auth Stack, Modal Stacks).
- `src/screens/`:
  - `HomeScreen`: Dashboard showing current cycle day, prediction countdown, and daily insights.
  - `CalendarScreen`: Monthly calendar highlighting period, ovulation, and fertile days.
  - `LogScreen`: Daily logging for flow, mood, symptoms, sexual activity, and notes.
  - `InsightsScreen`: Historical charts, cycle regularity, and health trends.
  - `ProfileScreen`: Settings, privacy controls, and cycle preferences.
- `src/services/`: API clients, local storage (Encrypted AsyncStorage/SecureStore), and local notification triggers.
- `src/utils/`: Cycle calculation utilities, date helpers, and mathematical predictors.
