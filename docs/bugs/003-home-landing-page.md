# Home / Landing Page

**GitHub Issue:** #3  
**Priority:** Critical  
**Type:** Feature  
**Status:** Open

## Requirements

The home/landing page when opening the app should have four main action buttons:

1. **Browse** - Navigate to browse/discover lists
2. **View My Lists** - Navigate to user's personal lists
3. **New List** - Create a new list
4. **Quick Add Item(s)** - Fast way to add items to existing lists

Additionally, there should be a **Home** button in the bottom navigation bar.

## Current State

Currently using a tab-based navigation with Browse as the default. Need to either:
- Add a dedicated Home tab, or
- Make the first tab a proper home screen with these 4 buttons

## Implementation Options

### Option A: Home Tab (Recommended)
Add a 5th "Home" tab that serves as the landing page with the 4 buttons.

### Option B: Replace Browse Default
Make the index tab the home screen, move Browse to a separate tab.

## Files Affected

- `app/(tabs)/_layout.tsx` - Add Home tab
- New: `app/(tabs)/home.tsx` - Home screen with 4 action buttons
- `app/(tabs)/index.tsx` - May need to rename/reorganize
