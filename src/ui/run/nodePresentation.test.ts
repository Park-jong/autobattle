import { describe, expect, it } from 'vitest';
import { eventOptionPresentation, eventSceneKind } from './nodePresentation';

describe('encounter presentation', () => {
  it('keeps the action and written costs/rewards separate without changing their meaning', () => {
    expect(eventOptionPresentation('상자를 뜯는다 (+14G, 지휘관 HP -6)')).toEqual({ title: '상자를 뜯는다', consequences: ['+14G', '지휘관 HP -6'] });
    expect(eventOptionPresentation('금고를 연다 (+25G, 저주 [공포] 1장)')).toEqual({ title: '금고를 연다', consequences: ['+25G', '저주 [공포] 1장'] });
  });
  it('preserves choices without a summary, including an unrecognized format', () => {
    expect(eventOptionPresentation('그냥 떠난다')).toEqual({ title: '그냥 떠난다', consequences: [] });
    expect(eventOptionPresentation('낡은 책 (개정판)을 읽는다')).toEqual({ title: '낡은 책 (개정판)을 읽는다', consequences: [] });
  });
  it('gives each current event its own location and handles unknown events', () => {
    expect(['abandoned_depot', 'wounded_scout', 'gate_smith', 'rift_altar', 'deserter_camp'].map(eventSceneKind)).toEqual(['depot', 'scout', 'forge', 'rift', 'camp']);
    expect(eventSceneKind('future_event')).toBe('camp');
  });
});
