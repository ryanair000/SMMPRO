import { Toaster } from 'react-hot-toast';
import PostComposer from '@/components/PostComposer';
import styles from './page.module.css';

export const metadata = {
  title: 'Chezahub AutoPoster',
  description: 'Generate Chezahub gaming captions and publish to connected social pages.',
};

export default function Home() {
  return (
    <main className={`${styles.mainContainer} animate-fade-in-up`}>
      <Toaster position="top-center" />
      <header className={styles.header}>
        <div className={styles.logoMark}></div>
        <h1 className={styles.title}>Chezahub AutoPoster</h1>
        <p className={styles.subtitle}>Generate gaming captions and publish to your social pages</p>
      </header>
      
      <section className={styles.dashboard}>
        <PostComposer />
      </section>
    </main>
  );
}
