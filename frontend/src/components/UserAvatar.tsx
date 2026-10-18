import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';

interface UserAvatarProps {
  className?: string;
  /** Custom image URL. If not provided, defaults to authStore.user?.avatar_url. */
  src?: string;
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
 * Round user avatar. If the user has a custom avatar_url set, it displays that image.
 * Otherwise, falls back to /profile-icon.png or initials.
 */
const UserAvatar: React.FC<UserAvatarProps> = ({
  className = '',
  src: propSrc,
  ring = false,
  status,
  name: propName,
  interactive = false,
}) => {
  const [failed, setFailed] = useState(false);
  const user = useAuthStore((s) => s.user);
  const name = propName || user?.name || '';
  const initials = initialsOf(name);
  const avatarSrc = propSrc !== undefined ? propSrc : user?.avatar_url;

  useEffect(() => {
    setFailed(false);
  }, [avatarSrc]);

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
        {avatarSrc && !failed ? (
          <img
            src={avatarSrc}
            alt={name || 'Profile'}
            draggable={false}
            onError={() => setFailed(true)}
            className="h-full w-full object-cover"
          />
        ) : failed && initials ? (
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