# Feature Parity: Mobile vs Web

## Current Status

| Feature | Web | Mobile | Priority |
|---------|-----|--------|----------|
| Home screen | ✅ | ✅ | - |
| Browse templates | ✅ | ✅ | - |
| Create list | ✅ | ✅ | - |
| Ranking comparisons | ✅ | ✅ | - |
| Results view | ✅ | ✅ | - |
| My Lists | ✅ | ✅ | - |
| List detail | ✅ | ✅ | - |
| Share list | ✅ | ✅ | - |
| Sign in | ✅ | ✅ | - |
| **Sign up** | ✅ | ✅ | - |
| **Profile (edit name, stats)** | ✅ | ✅ | - |
| **Bulk add items** | ✅ | ✅ | - |
| **Save & Exit ranking** | ✅ | ✅ | - |
| **Skip comparison** | ✅ | ✅ | - |
| **Add items after ranking** | ✅ | ✅ | - |
| **Express mode** | ✅ | ✅ | - |
| **Forgot password** | ✅ | ✅ | - |
| **Reset password** | ✅ | ⏳ | 🟢 Low (needs deep link) |
| **Featured lists (API)** | ✅ | ✅ | - |
| **Item actions (boost/remove)** | ✅ | ✅ | - |

---

## Implementation Plan

### Phase 1: Critical Auth & Core UX
**Goal:** Users can fully sign up and use core ranking features

1. **Sign Up Screen** `app/(auth)/sign-up.tsx`
   - Email/password registration
   - Match web validation
   - Navigate to home after signup

2. **Bulk Add Items** `components/BulkAddModal.tsx`
   - Paste multiple items (one per line)
   - Duplicate detection
   - Add to create screen

3. **Save & Exit** (update `app/rank/[id].tsx`)
   - Button in header during comparison
   - Save current progress
   - Navigate to my-lists

4. **Skip Comparison** (update `app/rank/[id].tsx`)
   - "Can't decide? Skip" button
   - Don't count as comparison
   - Move to next pair

---

### Phase 2: Profile & Password
**Goal:** Full account management

5. **Profile Screen Improvements** `app/(tabs)/profile.tsx`
   - Edit name with save
   - Show stats (lists created, member since)
   - Link to change password
   - Sign out button

6. **Forgot Password Screen** `app/(auth)/forgot-password.tsx`
   - Email input
   - Send reset link via Supabase

7. **Reset Password** (deep link handling)
   - Handle Supabase magic link
   - New password form

---

### Phase 3: Enhanced Results
**Goal:** Post-ranking item management

8. **Add Items to Completed List** (update results view)
   - "Add Item" button
   - Modal for single item add
   - Triggers re-ranking prompt

9. **Item Actions Menu** `components/ItemActionMenu.tsx`
   - Tap item to open menu
   - Boost to top / Send to bottom
   - Remove item
   - Re-compare against specific item

---

### Phase 4: Discovery & Polish
**Goal:** Feature-complete with web

10. **Featured Lists from API** (update `app/(tabs)/browse.tsx`)
    - Fetch from Supabase featured_lists
    - Show hourly rotation
    - Creator name + stats

11. **Express Mode** (update `app/rank/[id].tsx`)
    - Toggle button in header
    - Auto-skip lopsided matchups
    - Visual indicator when active

---

## Effort Estimates

| Phase | Features | Effort | Priority |
|-------|----------|--------|----------|
| Phase 1 | Sign up, Bulk add, Save & Exit, Skip | ~3-4 hours | 🔴 Critical |
| Phase 2 | Profile, Forgot/Reset password | ~2-3 hours | 🟠 Important |
| Phase 3 | Add items, Item actions | ~2-3 hours | 🟠 Nice to have |
| Phase 4 | Featured lists, Express mode | ~2-3 hours | 🟢 Polish |

**Total: ~10-13 hours for full parity**

---

## Dependencies

- Phase 2 (Forgot Password) needs Supabase email templates configured
- Phase 2 (Reset Password) needs deep link handling with expo-linking
- Phase 4 (Featured Lists) needs featured_lists table populated

---

---

## Testing Status

✅ **100% coverage achieved** on lib modules (`elo.ts`, `api.ts`)

| Metric | Coverage |
|--------|----------|
| Statements | 100% |
| Branches | 100% |
| Functions | 100% |
| Lines | 100% |

**104 tests covering:**
- ELO algorithm use cases
- API functions (CRUD, rankings, comparisons)
- Error handling edge cases
- Full ranking flow integration

---

*Last updated: 2026-02-27*
