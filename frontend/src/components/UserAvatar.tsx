import React, { useState } from 'react';

interface UserAvatarProps {
  className?: string;
  /** Gradient ring around the avatar. */
  ring?: boolean;
  /** Small presence dot in the corner. */
  status?: 'online' | 'away' | 'offline';
  /** Used for an initials fallback and for screen readers. Optional. */
  name?: string;
  /** Lifts slightly on hover / press (use when the avatar is a button or link). */
  interactive?: boolean;
}

const STATUS_COLOR: Record<NonNullable<UserAvatarProps['status']>, string> = {
  online: 'bg-emerald-400',
  away: 'bg-amber-400',
  offline: 'bg-text-muted',
};

const initialsOf = (name?: string) =>
  (name || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');

/**
 * Round user avatar. With only `className` it looks like before: a brand-coloured circle
 * with the profile icon. Size it from outside, e.g. className="w-9 h-9".
 */
const UserAvatar: React.FC<UserAvatarProps> = ({ className = '', ring = false, status, name, interactive = false }) => {
  const [failed, setFailed] = useState(false);
  const initials = initialsOf(name);

  return (
    <span
      {...(name ? { role: 'img', 'aria-label': name } : { 'aria-hidden': true })}
      className={[
        'relative inline-flex shrink-0 rounded-full',
        ring ? 'p-[2px] bg-gradient-to-br from-brand via-amber-400 to-brand-light' : '',
        interactive ? 'transition-transform duration-200 hover:scale-105 active:scale-95' : '',
        className,
      ].join(' ')}
    >
      <span className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-brand-light">
        {failed && initials ? (
          <span className="font-black text-white leading-none select-none" style={{ fontSize: '0.42em' }}>
            {initials}
          </span>
        ) : (
          <img
            src="/profile-icon.png"
            alt=""
            draggable={false}
            onError={() => setFailed(true)}
            className="h-full w-full object-contain"
          />
        )}
      </span>

      {status && (
        <span
          aria-hidden
          className={`absolute bottom-0 right-0 block rounded-full border-2 border-dark-bg ${STATUS_COLOR[status]}`}
          style={{ width: '28%', height: '28%', minWidth: 8, minHeight: 8 }}
        />
      )}
    </span>
  );
};

export default UserAvatar;