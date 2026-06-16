"use client";

import { useState, useRef, useEffect } from 'react';
import toast from 'react-hot-toast';
import styles from './PostComposer.module.css';

export default function PostComposer() {
  const [queue, setQueue] = useState([]); // { id, file, preview, caption, status }
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  const [scheduleTime, setScheduleTime] = useState('');
  const [spreadInterval, setSpreadInterval] = useState(2);
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const fileInputRef = useRef(null);

  const maxLength = 2200;

  // Handle multiple file uploads
  const handleFilesChange = (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    if (queue.length + files.length > 20) {
      toast.error('You can only upload up to 20 images at once.');
      return;
    }

    const newItems = files.map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      file,
      preview: URL.createObjectURL(file),
      caption: '',
      status: 'pending' // pending, generating, ready, published, error
    }));

    setQueue(prev => [...prev, ...newItems]);
    if (queue.length === 0) setSelectedIndex(0);
    
    // Clear input so same files can be selected again if needed
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
      if (item.caption) continue; // Skip if already has caption
      
      setSelectedIndex(i); // Auto-focus the item being generated
      updateQueueItem(i, { status: 'generating' });
      
      try {
        // Convert File to Base64 just-in-time for the API
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(item.file);
          reader.onload = () => resolve(reader.result);
          reader.onerror = error => reject(error);
        });

        const res = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: base64 })
        });
        const data = await res.json();
        
        if (!res.ok) throw new Error(data.error || 'Generation failed');
        
        updateQueueItem(i, { caption: data.caption, status: 'ready' });
        successCount++;
      } catch (err) {
        toast.error(`Image ${i+1}: ${err.message}`);
        updateQueueItem(i, { status: 'error' });
      }
    }
    
    setIsGenerating(false);
    toast.success(`Generated ${successCount} captions!`);
  };

  const handleSubmitAll = async () => {
    if (queue.length === 0) return;
    setIsSubmitting(true);
    const toastId = toast.loading('Publishing/Scheduling all posts...');

    let baseTime = null;
    if (scheduleTime) {
      baseTime = new Date(scheduleTime).getTime() / 1000; // Unix timestamp
      const nowUnix = Date.now() / 1000;
      if (baseTime < nowUnix + 600) {
        toast.error("Scheduled time must be at least 10 minutes in the future.", { id: toastId });
        setIsSubmitting(false);
        return;
      }
    }

    let successCount = 0;

    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      if (item.status === 'published') continue;
      
      setSelectedIndex(i);
      
      try {
        const formData = new FormData();
        if (item.caption.trim()) formData.append('message', item.caption);
        if (item.file) formData.append('image', item.file);
        
        if (baseTime) {
          // Spread interval (hours -> seconds)
          const postUnixTime = Math.floor(baseTime + (i * spreadInterval * 3600));
          formData.append('scheduledPublishTime', postUnixTime.toString());
        }

        const res = await fetch('/api/post', {
          method: 'POST',
          body: formData,
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
          toast.error(`Image ${i+1}: ${failedTargets.join('; ')}`);
        }

        successCount++;
      } catch (err) {
        toast.error(`Image ${i+1}: ${err.message}`);
        updateQueueItem(i, { status: 'error' });
      }
    }

    setIsSubmitting(false);
    toast.success(`Successfully processed ${successCount} posts!`, { id: toastId });
  };

  const removeItem = (index) => {
    setQueue(prev => prev.filter((_, i) => i !== index));
    if (selectedIndex >= index && selectedIndex > 0) {
      setSelectedIndex(selectedIndex - 1);
    }
  };

  const selectedItem = queue[selectedIndex];

  return (
    <div className={styles.splitGrid}>
      {/* LEFT PANE - CONTROLS & QUEUE */}
      <div className={`glass-panel ${styles.controlPane}`}>
        <h2 className={styles.paneTitle}>Campaign Composer (Up to 20)</h2>
        
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
            📁 Add Photos
          </label>
          
          <button 
            type="button" 
            className={styles.aiBtn} 
            onClick={handleGenerateAll}
            disabled={isGenerating || isSubmitting || queue.length === 0}
          >
            {isGenerating ? '✨ Generating All...' : '✨ Auto-Generate All'}
          </button>
        </div>

        {queue.length > 0 && (
          <div className={styles.queueContainer}>
            {queue.map((item, idx) => (
              <div 
                key={item.id} 
                className={`${styles.queueItem} ${selectedIndex === idx ? styles.active : ''} ${styles['status-'+item.status]}`}
                onClick={() => setSelectedIndex(idx)}
              >
                <img src={item.preview} alt="thumb" />
                <div className={styles.queueInfo}>
                  <span className={styles.queueLabel}>Post {idx + 1}</span>
                  <span className={styles.queueStatus}>{item.status}</span>
                </div>
                <button className={styles.removeQueueBtn} onClick={(e) => { e.stopPropagation(); removeItem(idx); }}>✕</button>
              </div>
            ))}
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
          {isSubmitting ? <><span className={styles.spinner}></span> Processing...</> : (scheduleTime ? `Schedule ${queue.length} Posts` : `Publish ${queue.length} Posts Now`)}
        </button>
      </div>

      {/* RIGHT PANE - LIVE PREVIEW */}
      <div className={`glass-panel ${styles.previewPane}`}>
        <h2 className={styles.paneTitle}>Live Preview {selectedItem ? `(Post ${selectedIndex + 1})` : ''}</h2>
        <div className={styles.previewContent}>
          {selectedItem ? (
            <div className={styles.fbMockup}>
              <div className={styles.fbHeader}>
                <div className={styles.fbAvatar}></div>
                <div className={styles.fbMeta}>
                  <div className={styles.fbName}>PlayMechi</div>
                  <div className={styles.fbTime}>
                    {scheduleTime 
                      ? `Scheduled: ${new Date(new Date(scheduleTime).getTime() + (selectedIndex * spreadInterval * 3600000)).toLocaleString()}` 
                      : 'Just now · 🌍'}
                  </div>
                </div>
              </div>
              
              <div className={styles.fbBody}>
                {selectedItem.status === 'generating' ? (
                  <div className={styles.skeletonText}>
                    <div className={styles.skeletonLine}></div>
                    <div className={styles.skeletonLine}></div>
                    <div className={styles.skeletonLine} style={{width: '60%'}}></div>
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
