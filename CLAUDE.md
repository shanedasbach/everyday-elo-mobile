# everyday-elo-mobile

## Commands
```bash
npm start            # Expo dev server
npm run android      # Android emulator
npm run ios          # iOS simulator
npm run web          # Web version
npm test             # Jest watch mode
npm test:coverage    # Coverage report (95% threshold globally)
```

## Architecture
- **Expo SDK 54** with React Native 0.81 and React 19
- **Expo Router** file-based navigation with typed routes
- **Tab navigation**: browse, create, my-lists, profile
- **Screens**: list/[id] detail, rank/[id] comparison, quick-add modal, (auth) sign-in/sign-up
- **Supabase** shared backend with everyday-elo web app
- **Expo SecureStore** for secure auth token persistence
- **Elo algorithm** in `lib/elo.ts` (K=32, default 1500) — shared logic with web app
- **Haptic feedback** via expo-haptics for ranking interactions
- **Platform**: iOS (com.everydayelo.app), Android (com.everydayelo.app)

## Testing
- Jest with jest-expo and ts-jest transform
- 95% coverage threshold on branches, functions, lines, and statements
- Currently 100% coverage on lib modules (104 tests)
- Test pattern: `lib/__tests__/**/*.test.ts`

## Key Files
- `lib/api.ts` — Supabase API client for all data operations
- `lib/elo.ts` — Elo rating algorithm (shared with web)
- `lib/auth-context.tsx` — Auth state management with SecureStore
- `lib/supabase.ts` — Supabase client configuration
- `lib/templates.ts` — Template data
- `components/` — AddItemModal, BulkAddModal, ItemActionMenu, ListActionSheet
- `/docs/FEATURE-PARITY.md` — Web vs mobile feature matrix
- `/docs/ROADMAP.md` — Phase planning

## Agents

This project has 14 specialized agents in `.claude/agents/`:

| Agent | Role |
|-------|------|
| **mobile-engineer** | Expo, React Native, Expo Router, native integrations, haptics |
| **backend-engineer** | Supabase API client, auth with SecureStore, data sync |
| **qa-engineer** | Jest (95% threshold), API and Elo algorithm tests |
| **data-engineer** | Mobile analytics, user engagement, cross-platform comparison |
| **cto** | Technical leadership, orchestration, feature parity with web |
| **product-engineer** | Mobile features, app store strategy, feature parity |
| **designer** | Mobile-native UI, gesture design, haptic patterns |
| **accountant** | App store costs, EAS builds, shared Supabase costs |
| **ai-engineer** | Claude config, agent management, AI tooling |
| **devops-engineer** | EAS builds, app store submissions, CI/CD, OTA updates |
| **security-engineer** | SecureStore audit, token security, app transport security |
| **technical-writer** | Feature parity docs, setup guides, app store content |
| **performance-engineer** | React Native rendering, startup time, bundle size |
| **elo-specialist** | Elo algorithm parity with web, mobile ranking behavior |
