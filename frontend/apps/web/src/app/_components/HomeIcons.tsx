// The homepage's line icons, drawn once in a hidden sprite and used by name (<Icon name="home" />), as in the sample.

import styles from './home.module.css';

export type IconName = 'home' | 'sun' | 'mail' | 'pulse' | 'moment' | 'plans' | 'heart' | 'spark' | 'shield' | 'globe' | 'chat' | 'pin';

export function IconSprite() {
  return (
    <svg className={styles.sprite} aria-hidden="true" focusable="false">
      <defs>
        <symbol id="hp-i-home" viewBox="0 0 24 24"><path d="M3 10.6 12 3l9 7.6V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></symbol>
        <symbol id="hp-i-sun" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" /><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" /></symbol>
        <symbol id="hp-i-mail" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3.5 7.5 8.5 6 8.5-6" /></symbol>
        <symbol id="hp-i-pulse" viewBox="0 0 24 24"><path d="M2.5 12h4l3-8 4.5 16 3-8h4.5" /></symbol>
        <symbol id="hp-i-moment" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.6" strokeDasharray="3.4 3" /><circle cx="12" cy="12" r="3.2" /></symbol>
        <symbol id="hp-i-plans" viewBox="0 0 24 24"><rect x="3" y="4.5" width="18" height="16.5" rx="2" /><path d="M3 9.5h18M8 2.5v4M16 2.5v4" /></symbol>
        <symbol id="hp-i-heart" viewBox="0 0 24 24"><path d="M12 20.5s-7.5-4.6-7.5-10.4A4.1 4.1 0 0 1 12 7.6a4.1 4.1 0 0 1 7.5 2.5c0 5.8-7.5 10.4-7.5 10.4z" /></symbol>
        <symbol id="hp-i-spark" viewBox="0 0 24 24"><path d="M11 3.5 12.9 9l5.6 1.9-5.6 1.9L11 18.4l-1.9-5.6L3.5 10.9 9.1 9zM18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" /></symbol>
        <symbol id="hp-i-shield" viewBox="0 0 24 24"><path d="M12 3l7.5 3v5.2c0 5-3.6 8.2-7.5 9.8-3.9-1.6-7.5-4.8-7.5-9.8V6z" /><path d="m8.8 12 2.3 2.3 4.2-4.6" /></symbol>
        <symbol id="hp-i-globe" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18" /></symbol>
        <symbol id="hp-i-chat" viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4z" /></symbol>
        <symbol id="hp-i-pin" viewBox="0 0 24 24"><path d="M12 21s-6.5-6-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 15 12 21 12 21z" /><circle cx="12" cy="9.8" r="2.3" /></symbol>
      </defs>
    </svg>
  );
}

export function Icon({ name, className = styles.ic }: { name: IconName; className?: string }) {
  return (
    <svg className={className} aria-hidden="true" focusable="false">
      <use href={`#hp-i-${name}`} />
    </svg>
  );
}
