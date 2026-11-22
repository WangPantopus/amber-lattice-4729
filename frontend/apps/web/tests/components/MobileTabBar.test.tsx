import { activeMobileTab, availableMobileTabs } from '@/components/MobileTabBar';

describe('MobileTabBar route mapping', () => {
  // Tests run with every launch feature on, so Mail is its own tab (Mail tab
  // build, 2026-10-27), third since the founder's decision of 2026-11-13.
  // Moments and Plans follow Pulse while enabled. Messages left the bar for the top bar's chat
  // button (founder decision 2026-11-08).
  it('exposes the tabs in order, Mail third, without Messages', () => {
    const core = ['place', 'today', 'mail', 'nearby'];
    expect(availableMobileTabs(false, false).map(t => t.key)).toEqual(core);
    expect(availableMobileTabs(true, false).map(t => t.key)).toEqual([...core, 'moments']);
    expect(availableMobileTabs(false, true).map(t => t.key)).toEqual([...core, 'plans']);
    expect(availableMobileTabs(true, true).map(t => t.key)).toEqual([...core, 'moments', 'plans']);
  });

  it.each([
    ['/app/place', 'place'],
    ['/app/place/risk', 'place'],
    ['/app/homes/abc/privacy', 'place'],
    ['/app/today', 'today'],
    ['/app/hub/today', 'today'],
    // "Verified homes nearby" opens from Place (founder decision 2026-11-07).
    ['/app/nearby', 'place'],
    ['/app/feed', 'nearby'],
    ['/app/moments', 'moments'],
    ['/app/plans', 'plans'],
    ['/app/plans/a-plan', 'plans'],
    ['/app/mailbox', 'mail'],
    ['/app/mailbox/personal/123', 'mail'],
    // Messages opens from the chat button: no tab is lit there.
    ['/app/chat', null],
    ['/app/chat/room-1', null],
    ['/app/profile/settings', null],
  ])('%s highlights %s', (path, key) => {
    expect(activeMobileTab(path)).toBe(key);
  });
});
