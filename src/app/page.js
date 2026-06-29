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
    <main className={`${styles.mainContainer} animate-fade-in-up`}>
      <Toaster position="top-center" />
      <header className={styles.header}>
        <div className={styles.logoMark}></div>
        <h1 className={styles.title}>SMM Pro</h1>
        <p className={styles.subtitle}>Manage ChezaHub and JengaSites Facebook and Instagram pages</p>
        <LogoutButton />
      </header>
      
      <section className={styles.dashboard}>
        <PostComposer />
      </section>
    </main>
  );
}
