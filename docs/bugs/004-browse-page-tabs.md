# Browse Page Tabs

**GitHub Issue:** #4  
**Priority:** Low  
**Type:** Feature Enhancement  
**Status:** Open

## Requirements

The browse page should eventually have two tabbed modes/feeds:

1. **Following** - Lists from users you follow
2. **For You** - Algorithmic/curated feed of popular lists

## Current State

Currently shows a static list of templates. No tabs, no Following functionality.

## Implementation Plan

### Phase 1 (MVP)
Start with just the "For You" tab until following functionality exists.

### Phase 2 (Future)
Add Following tab once user follow system is implemented.

## Technical Considerations

- Need follow/unfollow user functionality first
- "For You" algorithm needs to be defined (popular? recent? category-based?)
- Consider using `react-native-tab-view` or similar for smooth tab switching

## Files Affected

- `app/(tabs)/index.tsx` (Browse screen)
- New: User following system (database + UI)
