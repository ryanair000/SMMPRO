"use client";

import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import styles from './LogoutButton.module.css';

export default function LogoutButton() {
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await fetch('/api/logout', { method: 'POST' });
      router.push('/login');
      router.refresh();
    } catch {
      toast.error('Could not sign out. Please try again.');
    }
  };

  return (
    <button type="button" className={styles.logoutButton} onClick={handleLogout}>
      Sign Out
    </button>
  );
}
