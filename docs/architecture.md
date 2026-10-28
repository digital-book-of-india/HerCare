# System Architecture & Flow

## Architecture Diagram

```mermaid
flowchart TD
    subgraph Mobile Client [HerCare Mobile App]
        UI[Screens & Components]
        State[State Management / Context]
        LocalStore[(Encrypted Local Storage)]
        ApiClient[API Client]
        
        UI --> State
        State <--> LocalStore
        State <--> ApiClient
    end

    subgraph Backend Service [HerCare REST API]
        Gateway[Routes & Auth Middleware]
        Controllers[Controllers]
        Services[Cycle & Health Calculation Engine]
        DB[(Database)]
        
        ApiClient <--> Gateway
        Gateway --> Controllers
        Controllers --> Services
        Services <--> DB
    end
```

## Data Privacy
- Personal health data and cycle records are strictly tied to authenticated user credentials.
- Option for offline-first mode with local SQLite / SecureStore fallback.
