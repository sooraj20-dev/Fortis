import React from 'react';

interface UserAvatarProps {
  className?: string;
}

const UserAvatar: React.FC<UserAvatarProps> = ({ className = '' }) => (
  <span
    aria-hidden="true"
    className={`inline-flex items-center justify-center overflow-hidden rounded-full bg-brand-light shrink-0 ${className}`}
  >
    <img src="/profile-icon.png" alt="" className="h-full w-full object-contain" />
  </span>
);

export default UserAvatar;
