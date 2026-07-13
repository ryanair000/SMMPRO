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
        <nav className={styles.headerNav} aria-label="Primary navigation">
          <a href="#composer" aria-current="page">Create post</a>
          <a href="#campaign-summary">Campaign summary</a>
        </nav>
        <LogoutButton />
      </header>

      <section className={styles.hero}>
        <span className={styles.eyebrow}>One campaign · every channel</span>
        <h1>Create once. Publish everywhere.</h1>
        <p>Build, caption, schedule, and publish a complete social campaign from one focused workspace.</p>
      </section>

      <ol className={styles.stepRail} aria-label="Campaign workflow">
        <li><span>1</span><div><strong>Brand & channels</strong><small>Choose where to publish</small></div></li>
        <li><span>2</span><div><strong>Campaign media</strong><small>Add up to 20 images</small></div></li>
        <li><span>3</span><div><strong>Captions</strong><small>Write or generate with AI</small></div></li>
        <li><span>4</span><div><strong>Format & timing</strong><small>Publish now or schedule</small></div></li>
      </ol>

      <section className={styles.dashboard} id="composer">
        <PostComposer />
      </section>

      <footer className={styles.footer}>
        <span>SMM Pro</span>
        <span>ChezaHub & JengaSites publishing workspace</span>
      </footer>
    </main>
  );
}
