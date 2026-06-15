"use client";

import { useState, useRef } from 'react';
import toast from 'react-hot-toast';
import styles from './PostComposer.module.css';

export default function PostComposer() {
  const [message, setMessage] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const fileInputRef = useRef(null);

  const maxLength = 2200;

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerateCaption = async () => {
    if (!imagePreview) return;
    setIsGenerating(true);
    const toastId = toast.loading('Generating perfect caption...');
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: imagePreview })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate caption');
      setMessage(data.caption);
      toast.success('Caption generated!', { id: toastId });
    } catch (err) {
      toast.error(err.message, { id: toastId });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!message.trim() && !imageFile) return;

    setIsSubmitting(true);
    const toastId = toast.loading('Publishing to Facebook...');

    try {
      const formData = new FormData();
      if (message.trim()) formData.append('message', message);
      if (imageFile) formData.append('image', imageFile);

      const res = await fetch('/api/post', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to post');
      }

      // Check results for partial group failures
      const errors = data.results?.filter(r => r.status.includes('Failed') || r.status.includes('Error'));
      if (errors && errors.length > 0) {
        const errorReasons = [...new Set(errors.map(e => e.status))].join(' | ');
        toast.error(`Posted to Page! But Admin Group failed. Meta API Error: ${errorReasons}`, { id: toastId, duration: 6000 });
      } else {
        toast.success('Post published successfully to Page and Admin Group!', { id: toastId });
      }
      
      setMessage('');
      setImageFile(null);
      setImagePreview(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      toast.error(err.message, { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.splitGrid}>
      {/* LEFT PANE - CONTROLS */}
      <div className={`glass-panel ${styles.controlPane}`}>
        <h2 className={styles.paneTitle}>Create Post</h2>
        <form onSubmit={handleSubmit} className={styles.formContent}>
          <div className={styles.textareaWrapper}>
            <textarea
              className="input-field"
              placeholder="What's on your mind?"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={maxLength}
              disabled={isSubmitting || isGenerating}
            />
            <span className={styles.characterCount}>
              {message.length} / {maxLength}
            </span>
          </div>

          <div className={styles.controls}>
            <div className={styles.leftControls}>
              <input 
                type="file" 
                accept="image/*" 
                ref={fileInputRef}
                onChange={handleImageChange} 
                style={{ display: 'none' }}
                id="image-upload"
              />
              <label htmlFor="image-upload" className={`${styles.iconBtn} ${isSubmitting ? styles.disabled : ''}`}>
                📷 Add Photo
              </label>
              {imagePreview && (
                <button 
                  type="button" 
                  className={styles.aiBtn} 
                  onClick={handleGenerateCaption}
                  disabled={isGenerating || isSubmitting}
                >
                  {isGenerating ? '✨ Generating...' : '✨ Auto-Generate'}
                </button>
              )}
            </div>
            
            <div className={styles.actions}>
              <button 
                type="submit" 
                className="btn" 
                disabled={(!message.trim() && !imageFile) || isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <span className={styles.spinner}></span>
                    Publishing...
                  </>
                ) : (
                  'Publish Post'
                )}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* RIGHT PANE - PREVIEW */}
      <div className={`glass-panel ${styles.previewPane}`}>
        <h2 className={styles.paneTitle}>Live Preview</h2>
        <div className={styles.previewContent}>
          <div className={styles.fbMockup}>
            <div className={styles.fbHeader}>
              <div className={styles.fbAvatar}></div>
              <div className={styles.fbMeta}>
                <div className={styles.fbName}>PlayMechi</div>
                <div className={styles.fbTime}>Just now · 🌍</div>
              </div>
            </div>
            
            <div className={styles.fbBody}>
              {isGenerating ? (
                <div className={styles.skeletonText}>
                  <div className={styles.skeletonLine}></div>
                  <div className={styles.skeletonLine}></div>
                  <div className={styles.skeletonLine} style={{width: '60%'}}></div>
                </div>
              ) : (
                message && <p className={styles.fbText}>{message}</p>
              )}
            </div>

            {imagePreview && (
              <div className={styles.fbImageWrapper}>
                <img src={imagePreview} alt="Preview" className={styles.fbImage} />
                <button type="button" className={styles.removeImageBtn} onClick={() => {
                  setImageFile(null);
                  setImagePreview(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}>✕</button>
              </div>
            )}

            {!message && !imagePreview && !isGenerating && (
              <div className={styles.emptyState}>
                Your preview will appear here
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
