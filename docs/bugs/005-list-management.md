# List Management and Interaction

**GitHub Issue:** #5  
**Priority:** High  
**Type:** Feature  
**Status:** Open

## Problem

The interface for interacting with a list is missing. Users need management options based on their permissions.

## Requirements

### List Owners and Editors
1. **Add item(s)** - Add new items to the list
2. **Rerank list** - Start a new ranking session
3. **Delete list** - Remove the list entirely
4. **Share list** - Generate share link or invite users
5. **Manage permissions** - Control who can view/edit
6. **Copy/duplicate list** - Create a copy of the list

### List Viewers (Read-only)
1. **Share list** - Share with others
2. **Copy/duplicate list** - Create their own copy

## Implementation

### UI Options

**Option A: Action Sheet**
Long-press or menu button opens an action sheet with available options.

**Option B: Dedicated Management Screen**
Navigate to a full management screen with all options laid out.

**Option C: Inline Buttons**
Show relevant action buttons directly on the list view.

### Permission Checking
Check user's role (owner/editor/viewer) via Supabase RLS or list membership table.

## Files Affected

- `app/list/[id].tsx` - List detail view with management UI
- New: `app/list/[id]/settings.tsx` - Full settings screen
- New: `components/ListActionSheet.tsx` - Reusable action sheet
- May need new Supabase tables for permissions
