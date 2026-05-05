import {
  VISION_SECTION_DELIM,
  visionSectionsForKeys,
} from '@/modules/media/photo/helpers/photo-vision-multi-sections';

describe('visionSectionsForKeys', () => {
  it('returns a single slot when keyCount is 1', () => {
    const full = `[Photo 1/1]\na`;
    expect(visionSectionsForKeys(full, 1)).toEqual([full.trim()]);
  });

  it('splits on delimiter when counts match', () => {
    const a = '[Photo 1/2]\nalpha';
    const b = '[Photo 2/2]\nbeta';
    const full = `${a}${VISION_SECTION_DELIM}${b}`;
    expect(visionSectionsForKeys(full, 2)).toEqual(['alpha', 'beta']);
  });

  it('pads missing slots with placeholders instead of duplicating full vision', () => {
    const full = '[Photo 1/3]\nonly first';
    const out = visionSectionsForKeys(full, 3);
    expect(out).toHaveLength(3);
    expect(out[0]).toBe('only first');
    expect(out[1]).toContain('Photo 2/3');
    expect(out[1]).toContain('unavailable');
    expect(out[2]).toContain('Photo 3/3');
  });
});
