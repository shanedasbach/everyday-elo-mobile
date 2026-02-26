# List View Bugs

**GitHub Issue:** #2  
**Priority:** High  
**Type:** Bug  
**Status:** Open

## Problems

### 1. Items Not Scrollable
If there are more items than fit on the screen, there's no way to scroll and see the lower ones.

**Fix:** Wrap item list in `ScrollView` or use `FlatList`.

### 2. "Done" Button Doesn't Make Sense
The "Done" button is confusing. Should have a back/exit button in the top left to navigate to the previous view.

**Fix:** Replace with back navigation button using `router.back()`.

### 3. No List Management Interface
Missing management options for list owners/editors:
- Add item(s)
- Rerank list
- Delete list
- Share list
- Manage permissions

**Fix:** See Issue #5 for full management implementation.

### 4. List Items Not Clickable
Items should be tappable and navigate to a list item detail view with management options and more info.

**Fix:** Wrap items in `TouchableOpacity`/`Pressable` and create item detail screen.

## Files Affected

- `app/rank/[id].tsx` (or list view screen)
- New: `app/list/[id].tsx` (list detail view)
- New: `app/item/[id].tsx` (item detail view)
