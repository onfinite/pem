import {
  isPhotoRecallEligibleMessage,
  messageHasImageKeys,
} from '@/modules/media/photo/helpers/photo-recall-eligibility';

describe('messageHasImageKeys', () => {
  it('returns false for empty or missing keys', () => {
    expect(messageHasImageKeys(null)).toBe(false);
    expect(messageHasImageKeys([])).toBe(false);
    expect(messageHasImageKeys([{ key: '' }])).toBe(false);
  });

  it('returns true when a key is present', () => {
    expect(messageHasImageKeys([{ key: 'chat-images/u/1.jpg' }])).toBe(true);
  });
});

describe('isPhotoRecallEligibleMessage', () => {
  it('requires user role', () => {
    expect(
      isPhotoRecallEligibleMessage({
        role: 'pem',
        kind: 'image',
        imageKeys: [{ key: 'k' }],
        visionSummary: 'x',
      }),
    ).toBe(false);
  });

  it('accepts image kind with keys and vision', () => {
    expect(
      isPhotoRecallEligibleMessage({
        role: 'user',
        kind: 'image',
        imageKeys: [{ key: 'k' }],
        visionSummary: ' summary ',
      }),
    ).toBe(true);
  });

  it('accepts voice with image keys and vision', () => {
    expect(
      isPhotoRecallEligibleMessage({
        role: 'user',
        kind: 'voice',
        imageKeys: [{ key: 'k' }],
        visionSummary: 'receipt total',
      }),
    ).toBe(true);
  });

  it('rejects voice without image keys', () => {
    expect(
      isPhotoRecallEligibleMessage({
        role: 'user',
        kind: 'voice',
        imageKeys: [],
        visionSummary: 'x',
      }),
    ).toBe(false);
  });

  it('rejects empty vision', () => {
    expect(
      isPhotoRecallEligibleMessage({
        role: 'user',
        kind: 'image',
        imageKeys: [{ key: 'k' }],
        visionSummary: '   ',
      }),
    ).toBe(false);
  });
});
