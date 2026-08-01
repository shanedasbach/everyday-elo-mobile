import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Regression guard for issue #52.
 *
 * VoiceOver/TalkBack users could not operate the core ranking surface or the
 * action modals because the interactive controls exposed no accessibility
 * metadata. This test documents the expectation that every `<TouchableOpacity`
 * in those files declares an `accessibilityRole` and an `accessibilityLabel`,
 * so a future control added without labels fails CI rather than shipping silently.
 */

const ROOT = join(__dirname, '..', '..');

// Files that make up the hot path (rank screen) and the four action modals.
const FILES = [
  'app/rank/[id].tsx',
  'components/AddItemModal.tsx',
  'components/BulkAddModal.tsx',
  'components/ItemActionMenu.tsx',
  'components/ListActionSheet.tsx',
];

/**
 * Returns one slice of source per `<TouchableOpacity` occurrence, spanning from
 * the opening tag up to the next touchable (or end of file). The opening-tag
 * props always appear at the top of a slice, so checking the slice text is a
 * reliable proxy for "this control declared these props".
 */
function touchableSlices(source: string): string[] {
  const parts = source.split('<TouchableOpacity');
  // First part is everything before the first touchable — drop it.
  return parts.slice(1);
}

describe('accessibility labels (issue #52)', () => {
  for (const file of FILES) {
    describe(file, () => {
      const source = readFileSync(join(ROOT, file), 'utf8');
      const slices = touchableSlices(source);

      it('has at least one interactive control', () => {
        expect(slices.length).toBeGreaterThan(0);
      });

      it('every TouchableOpacity declares accessibilityRole', () => {
        slices.forEach((slice, i) => {
          if (!slice.includes('accessibilityRole=')) {
            throw new Error(
              `TouchableOpacity #${i + 1} in ${file} is missing accessibilityRole`,
            );
          }
        });
      });

      it('every TouchableOpacity declares accessibilityLabel', () => {
        slices.forEach((slice, i) => {
          if (!slice.includes('accessibilityLabel=')) {
            throw new Error(
              `TouchableOpacity #${i + 1} in ${file} is missing accessibilityLabel`,
            );
          }
        });
      });
    });
  }

  it('comparison choice buttons announce the item they select', () => {
    const source = readFileSync(join(ROOT, 'app/rank/[id].tsx'), 'utf8');
    expect(source).toContain('accessibilityLabel={`Choose ${itemA.name}`}');
    expect(source).toContain('accessibilityLabel={`Choose ${itemB.name}`}');
  });
});
