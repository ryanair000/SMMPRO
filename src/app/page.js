import { Toaster } from 'react-hot-toast';
import PostComposer from '@/components/PostComposer';
import LogoutButton from '@/components/LogoutButton';
import styles from './page.module.css';

export const metadata = {
  title: 'SMM Pro',
  description: 'Manage ChezaHub and JengaSites Facebook and Instagram publishing.',
};

export default function Home() {
  return (
    <main className={styles.mainContainer}>
      <Toaster position="top-center" />
      <header className={styles.header}>
        <div className={styles.brandLockup}>
          <div className={styles.logoMark} aria-hidden="true">S</div>
          <div>
            <strong className={styles.title}>SMM Pro</strong>
            <span className={styles.subtitle}>Social publishing workspace</span>
          </div>
        </div>
        <div className={styles.headerStatus}><span></span>Publisher ready</div>
        <LogoutButton />
      </header>
      <section className={styles.dashboard} id="composer">
        <PostComposer />
      </section>
    </main>
  );
}
