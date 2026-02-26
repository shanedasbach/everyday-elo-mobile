# everyday-elo Mobile App Roadmap

## Overview

Prioritized list of features and bugs, ordered by functionality and user impact.

---

## Phase 1: Core Navigation & Structure

### 1. Home / Landing Page
**Issue:** #3 | **Doc:** [003-home-landing-page.md](bugs/003-home-landing-page.md)  
**Priority:** 🔴 Critical

The app needs a proper entry point with clear navigation to main features:
- Browse lists
- View my lists
- Create new list
- Quick add items

**Why First:** This sets the foundation for the app's navigation structure. Everything else builds on this.

---

## Phase 2: Fix Core Functionality

### 2. List View Bugs
**Issue:** #2 | **Doc:** [002-list-view-bugs.md](bugs/002-list-view-bugs.md)  
**Priority:** 🔴 High

Multiple bugs in the list view that break core functionality:
- Items not scrollable
- Confusing "Done" button
- Items not clickable

**Why Second:** Users can't effectively view or interact with lists — the core purpose of the app.

### 3. My Lists View Bug
**Issue:** #1 | **Doc:** [001-my-lists-view-bug.md](bugs/001-my-lists-view-bug.md)  
**Priority:** 🟡 Low

Quick fix: Change "View Results" → "View List"

**Why Here:** Quick win, can be done alongside Phase 2 work.

---

## Phase 3: List Management Features

### 4. List Management and Interaction
**Issue:** #5 | **Doc:** [005-list-management.md](bugs/005-list-management.md)  
**Priority:** 🟠 High

Add management interface for lists:
- Add/remove items
- Rerank
- Delete
- Share
- Permissions

**Why Third:** Once users can view lists properly (Phase 2), they need to manage them.

---

## Phase 4: Discovery & Social

### 5. Browse Page Tabs (Following / For You)
**Issue:** #4 | **Doc:** [004-browse-page-tabs.md](bugs/004-browse-page-tabs.md)  
**Priority:** 🟢 Low

Add tabbed browse interface:
- For You feed (start here)
- Following feed (requires user follow system)

**Why Last:** Enhancement feature. Core app needs to work first.

---

## Quick Reference

| Phase | Issue | Title | Priority | Effort |
|-------|-------|-------|----------|--------|
| 1 | #3 | Home / Landing Page | 🔴 Critical | Medium |
| 2 | #2 | List View Bugs | 🔴 High | Medium |
| 2 | #1 | My Lists View Bug | 🟡 Low | Small |
| 3 | #5 | List Management | 🟠 High | Large |
| 4 | #4 | Browse Page Tabs | 🟢 Low | Medium |

---

## Dependencies

```
Home Page (#3)
    │
    ▼
List View Fixes (#2) ◄── My Lists Bug (#1)
    │
    ▼
List Management (#5)
    │
    ▼
Browse Tabs (#4) ◄── [Requires: User Follow System]
```

---

*Last updated: 2026-02-26*
