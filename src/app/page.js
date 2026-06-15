import { Toaster } from 'react-hot-toast';
import PostComposer from '@/components/PostComposer';
import styles from './page.module.css';

export const metadata = {
  title: 'AutoPoster | Publish to Facebook effortlessly',
  description: 'A minimalistic, premium web application for publishing posts directly to your Facebook Page.',
};

export default function Home() {
  return (
    <main className={`${styles.mainContainer} animate-fade-in-up`}>
      <Toaster position="top-center" />
      <header className={styles.header}>
        <div className={styles.logoMark}></div>
        <h1 className={styles.title}>AutoPoster</h1>
        <p className={styles.subtitle}>Publish directly to your Facebook Page</p>
      </header>
      
      <section className={styles.dashboard}>
        <PostComposer />
      </section>
    </main>
  );
}
