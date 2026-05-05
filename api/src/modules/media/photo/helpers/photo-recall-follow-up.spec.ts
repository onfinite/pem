import {
  isUndirectedPastPhotosAsk,
  wantsImplicitPastMediaContext,
} from '@/modules/media/photo/helpers/photo-recall-follow-up';

describe('isUndirectedPastPhotosAsk', () => {
  it('matches plural bring-up / shared phrasing', () => {
    expect(
      isUndirectedPastPhotosAsk('Can u bring up photos that i shared?'),
    ).toBe(true);
  });

  it('skips when the ask is anchored to a diagram or doc', () => {
    expect(
      isUndirectedPastPhotosAsk(
        'Can u bring up the photo of the diagram about noshaq?',
      ),
    ).toBe(false);
  });
});

describe('wantsImplicitPastMediaContext', () => {
  it('treats “anything about {topic}” as implicit past media', () => {
    expect(
      wantsImplicitPastMediaContext('Do u now remember anything about nature?'),
    ).toBe(true);
  });
});
