"use client";

import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { SOCIAL_ACCOUNTS } from '@/lib/socialAccounts';
import styles from './PostComposer.module.css';

export default function PostComposer() {
  const [queue, setQueue] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedAccountId, setSelectedAccountId] = useState(SOCIAL_ACCOUNTS[0].id);
  const [publishFacebook, setPublishFacebook] = useState(true);
  const [publishInstagram, setPublishInstagram] = useState(true);
  const [scheduleTime, setScheduleTime] = useState('');
  const [spreadInterval, setSpreadInterval] = useState(2);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fileInputRef = useRef(null);
  const maxLength = 2200;
  const selectedAccount = SOCIAL_ACCOUNTS.find(account => account.id === selectedAccountId) || SOCIAL_ACCOUNTS[0];
  const selectedItem = queue[selectedIndex];

  const handleFilesChange = (event) => {
    const files = Array.from(event.target.files);
    if (!files.length) return;

    if (queue.length + files.length > 20) {
      toast.error('You can only upload up to 20 images at once.');
      return;
    }

    const newItems = files.map(file => ({
      id: Math.random().toString(36).slice(2, 11),
      file,
      preview: URL.createObjectURL(file),
      caption: '',
      imageUrl: '',
      status: 'pending'
    }));

    setQueue(prev => [...prev, ...newItems]);
    if (queue.length === 0) setSelectedIndex(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const updateQueueItem = (index, updates) => {
    setQueue(prev => {
      const newQueue = [...prev];
      newQueue[index] = { ...newQueue[index], ...updates };
      return newQueue;
    });
  };

  const handleGenerateAll = async () => {
    if (queue.length === 0) return;
    setIsGenerating(true);

    let successCount = 0;

    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      if (item.caption) continue;

      setSelectedIndex(i);
      updateQueueItem(i, { status: 'generating' });

      try {
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(item.file);
          reader.onload = () => resolve(reader.result);
          reader.onerror = error => reject(error);
        });

        const res = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: base64, accountId: selectedAccount.id })
        });
        const data = await res.json();

        if (!res.ok) throw new Error(data.error || 'Generation failed');

        updateQueueItem(i, { caption: data.caption, status: 'ready' });
        successCount++;
      } catch (err) {
        toast.error(`Image ${i + 1}: ${err.message}`);
        updateQueueItem(i, { status: 'error' });
      }
    }

    setIsGenerating(false);
    toast.success(`Generated ${successCount} ${selectedAccount.name} captions.`);
  };

  const handleSubmitAll = async () => {
    if (queue.length === 0) return;
    if (!publishFacebook && !publishInstagram) {
      toast.error('Choose Facebook, Instagram, or both before publishing.');
      return;
    }

    let baseTime = null;
    if (scheduleTime) {
      baseTime = new Date(scheduleTime).getTime() / 1000;
      const nowUnix = Date.now() / 1000;
      if (baseTime < nowUnix + 600) {
        toast.error('Scheduled time must be at least 10 minutes in the future.');
        return;
      }
    }

    setIsSubmitting(true);
    const toastId = toast.loading(`Publishing/Scheduling for ${selectedAccount.name}...`);
    let successCount = 0;

    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      if (item.status === 'published') continue;

      setSelectedIndex(i);

      try {
        const formData = new FormData();
        formData.append('accountId', selectedAccount.id);
        formData.append('publishFacebook', publishFacebook ? 'true' : 'false');
        formData.append('publishInstagram', publishInstagram ? 'true' : 'false');
        if (item.caption.trim()) formData.append('message', item.caption);
        if (item.file) formData.append('image', item.file);
        if (item.imageUrl?.trim()) formData.append('imageUrl', item.imageUrl.trim());

        if (baseTime) {
          const postUnixTime = Math.floor(baseTime + (i * spreadInterval * 3600));
          formData.append('scheduledPublishTime', postUnixTime.toString());
        }

        const res = await fetch('/api/post', {
          method: 'POST',
          body: formData
        });

        const text = await res.text();
        let data = {};
        try {
          data = text ? JSON.parse(text) : {};
        } catch {
          data = { error: text || 'Failed to post' };
        }

        if (!res.ok) {
          const fbCode = data.details?.code ? ` (code ${data.details.code})` : '';
          throw new Error(`${data.error || 'Failed to post'}${fbCode}`);
        }

        updateQueueItem(i, { status: 'published' });
        const failedTargets = data.results
          ?.filter(result => result.status && result.status !== 'Success')
          .map(result => `${result.target}: ${result.status}`);

        if (failedTargets?.length) {
          toast.error(`Image ${i + 1}: ${failedTargets.join('; ')}`);
        }

        successCount++;
      } catch (err) {
        toast.error(`Image ${i + 1}: ${err.message}`);
        updateQueueItem(i, { status: 'error' });
      }
    }

    setIsSubmitting(false);
    toast.success(`Successfully processed ${successCount} posts.`, { id: toastId });
    setQueue([]);
    setSelectedIndex(0);
    setScheduleTime('');
  };

  const removeItem = (index) => {
    setQueue(prev => prev.filter((_, i) => i !== index));
    if (selectedIndex >= index && selectedIndex > 0) {
      setSelectedIndex(selectedIndex - 1);
    }
  };

  return (
    <div className={styles.splitGrid}>
      <div className={`glass-panel ${styles.controlPane}`}>
        <div className={styles.accountHeader}>
          <div>
            <h2 className={styles.paneTitle}>Campaign Composer</h2>
            <p className={styles.accountHint}>Switch between managed Meta pages before generating or publishing.</p>
          </div>
          <span className={styles.accountBadge} style={{ '--account-accent': selectedAccount.accent }}>
            {selectedAccount.shortName}
          </span>
        </div>

        <div className={styles.accountSwitcher} aria-label="Managed social account">
          {SOCIAL_ACCOUNTS.map(account => (
            <button
              key={account.id}
              type="button"
              className={`${styles.accountCard} ${selectedAccount.id === account.id ? styles.accountCardActive : ''}`}
              style={{ '--account-accent': account.accent }}
              onClick={() => setSelectedAccountId(account.id)}
              disabled={isSubmitting || isGenerating}
              aria-pressed={selectedAccount.id === account.id}
            >
              <span className={styles.accountAvatar}>{account.shortName}</span>
              <span className={styles.accountCopy}>
                <strong>{account.name}</strong>
                <small>{account.description}</small>
              </span>
            </button>
          ))}
        </div>

        <div className={styles.platformToggles}>
          <label>
            <input
              type="checkbox"
              checked={publishFacebook}
              onChange={e => setPublishFacebook(e.target.checked)}
              disabled={isSubmitting}
            />
            Facebook Page
          </label>
          <label>
            <input
              type="checkbox"
              checked={publishInstagram}
              onChange={e => setPublishInstagram(e.target.checked)}
              disabled={isSubmitting}
            />
            Instagram
          </label>
        </div>

        <div className={styles.topControls}>
          <input
            type="file"
            accept="image/*"
            multiple
            ref={fileInputRef}
            onChange={handleFilesChange}
            style={{ display: 'none' }}
            id="bulk-upload"
          />
          <label htmlFor="bulk-upload" className={`${styles.iconBtn} ${isSubmitting ? styles.disabled : ''}`}>
            Add Photos
          </label>

          <button
            type="button"
            className={styles.aiBtn}
            onClick={handleGenerateAll}
            disabled={isGenerating || isSubmitting || queue.length === 0}
          >
            {isGenerating ? `Generating ${selectedAccount.name} captions...` : `Auto-Generate for ${selectedAccount.name}`}
          </button>
        </div>

        {queue.length > 0 && (
          <div className={styles.queueContainer}>
            {queue.map((item, idx) => (
              <div
                key={item.id}
                className={`${styles.queueItem} ${selectedIndex === idx ? styles.active : ''} ${styles['status-' + item.status]}`}
                onClick={() => setSelectedIndex(idx)}
              >
                <img src={item.preview} alt="thumb" />
                <div className={styles.queueInfo}>
                  <span className={styles.queueLabel}>Post {idx + 1}</span>
                  <span className={styles.queueStatus}>{item.status}</span>
                </div>
                <button className={styles.removeQueueBtn} onClick={(e) => { e.stopPropagation(); removeItem(idx); }}>x</button>
              </div>
            ))}
          </div>
        )}

        {selectedItem && (
          <div className={styles.activeEditor}>
            <h3>Edit Post {selectedIndex + 1}</h3>
            <div className={styles.textareaWrapper}>
              <textarea
                value={selectedItem.caption}
                maxLength={maxLength}
                onChange={e => updateQueueItem(selectedIndex, { caption: e.target.value, status: 'ready' })}
                placeholder={`Write or generate a ${selectedAccount.name} caption...`}
                disabled={isSubmitting}
              />
              <span className={styles.characterCount}>
                {selectedItem.caption.length}/{maxLength}
              </span>
            </div>
            <div className={styles.urlInput}>
              <label>Public image URL for Instagram</label>
              <input
                type="url"
                value={selectedItem.imageUrl}
                onChange={e => updateQueueItem(selectedIndex, { imageUrl: e.target.value })}
                placeholder="https://example.com/image.jpg"
                disabled={isSubmitting}
              />
            </div>
          </div>
        )}

        <div className={styles.schedulingBlock}>
          <h3>Scheduling Options</h3>
          <div className={styles.scheduleRow}>
            <div className={styles.scheduleInput}>
              <label>Start Date & Time (Leave blank to post now)</label>
              <input
                type="datetime-local"
                value={scheduleTime}
                onChange={e => setScheduleTime(e.target.value)}
                disabled={isSubmitting}
              />
            </div>
            {scheduleTime && queue.length > 1 && (
              <div className={styles.scheduleInput}>
                <label>Spread Interval (Hours)</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={spreadInterval}
                  onChange={e => setSpreadInterval(parseFloat(e.target.value) || 0)}
                  disabled={isSubmitting}
                />
              </div>
            )}
          </div>
        </div>

        <button
          className="btn"
          onClick={handleSubmitAll}
          disabled={queue.length === 0 || isSubmitting || isGenerating}
          style={{ marginTop: 'auto' }}
        >
          {isSubmitting ? <><span className={styles.spinner}></span> Processing...</> : (scheduleTime ? `Schedule ${queue.length} ${selectedAccount.name} Posts` : `Publish ${queue.length} ${selectedAccount.name} Posts Now`)}
        </button>
      </div>

      <div className={`glass-panel ${styles.previewPane}`}>
        <h2 className={styles.paneTitle}>Live Preview {selectedItem ? `(Post ${selectedIndex + 1})` : ''}</h2>
        <div className={styles.previewTargets}>
          <span>{selectedAccount.name}</span>
          <span>
            {publishFacebook ? 'Facebook' : ''}
            {publishFacebook && publishInstagram ? ' + ' : ''}
            {publishInstagram ? 'Instagram' : ''}
          </span>
        </div>
        <div className={styles.previewContent}>
          {selectedItem ? (
            <div className={styles.fbMockup}>
              <div className={styles.fbHeader}>
                <div className={styles.fbAvatar} style={{ background: selectedAccount.accent }}>
                  {selectedAccount.shortName}
                </div>
                <div className={styles.fbMeta}>
                  <div className={styles.fbName}>{selectedAccount.name}</div>
                  <div className={styles.fbTime}>
                    {scheduleTime
                      ? `Scheduled: ${new Date(new Date(scheduleTime).getTime() + (selectedIndex * spreadInterval * 3600000)).toLocaleString()}`
                      : 'Just now - Public'}
                  </div>
                </div>
              </div>

              <div className={styles.fbBody}>
                {selectedItem.status === 'generating' ? (
                  <div className={styles.skeletonText}>
                    <div className={styles.skeletonLine}></div>
                    <div className={styles.skeletonLine}></div>
                    <div className={styles.skeletonLine} style={{ width: '60%' }}></div>
                  </div>
                ) : (
                  selectedItem.caption && <p className={styles.fbText}>{selectedItem.caption}</p>
                )}
              </div>

              <div className={styles.fbImageWrapper}>
                <img src={selectedItem.preview} alt="Preview" className={styles.fbImage} />
              </div>
            </div>
          ) : (
            <div className={styles.emptyState}>
              Upload images to see preview
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
