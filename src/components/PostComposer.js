"use client";

import { useState, useRef } from 'react';
import styles from './PostComposer.module.css';

export default function PostComposer() {
  const [message, setMessage] = useState('');
  const [targetGroups, setTargetGroups] = useState('676582708737987, 8051092188292297, 1747147299313262, 1249030373011362, 428755375095790, 3217380681748224, argentinathefutbolgoat, 1343083937401498, 601926075463454, 2996487803717552, 1183633089289155');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [notification, setNotification] = useState(null);
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
    setNotification(null);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: imagePreview })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate caption');
      setMessage(data.caption);
    } catch (err) {
      setNotification({ type: 'error', text: err.message });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!message.trim() && !imageFile) return;

    setIsSubmitting(true);
    setNotification(null);

    try {
      const formData = new FormData();
      if (message.trim()) formData.append('message', message);
      if (imageFile) formData.append('image', imageFile);
      if (targetGroups.trim()) formData.append('targetGroups', targetGroups);

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
        setNotification({ type: 'error', text: `Posted to Page, but failed groups: ${errors.map(e => e.target).join(', ')}` });
      } else {
        setNotification({ type: 'success', text: 'Post published successfully!' });
      }
      
      setMessage('');
      setImageFile(null);
      setImagePreview(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setNotification({ type: 'error', text: err.message });
    } finally {
      setIsSubmitting(false);
      setTimeout(() => setNotification(null), 8000); // Wait longer to show complex errors
    }
  };

  return (
    <div className={styles.container}>
      {notification && (
        <div className={`${styles.notification} ${styles[notification.type]}`}>
          {notification.text}
        </div>
      )}
      
      <form onSubmit={handleSubmit}>
        <div className={styles.textareaWrapper}>
          <textarea
            className="input-field"
            rows="5"
            placeholder="What's on your mind?"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={maxLength}
          />
          <span className={styles.characterCount}>
            {message.length} / {maxLength}
          </span>
        </div>

        <div className={styles.textareaWrapper} style={{marginBottom: '24px'}}>
          <input
            type="text"
            className="input-field"
            placeholder="Crosspost to Group IDs (optional, comma-separated e.g., 1234, 5678)"
            value={targetGroups}
            onChange={(e) => setTargetGroups(e.target.value)}
          />
        </div>
        
        {imagePreview && (
          <div className={styles.imagePreviewContainer}>
            <img src={imagePreview} alt="Preview" className={styles.imagePreview} />
            <button type="button" className={styles.removeImageBtn} onClick={() => {
              setImageFile(null);
              setImagePreview(null);
              if (fileInputRef.current) fileInputRef.current.value = '';
            }}>✕</button>
          </div>
        )}

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
            <label htmlFor="image-upload" className={styles.iconBtn}>
              📷 Add Photo
            </label>
            {imagePreview && (
              <button 
                type="button" 
                className={styles.aiBtn} 
                onClick={handleGenerateCaption}
                disabled={isGenerating}
              >
                {isGenerating ? '✨ Generating...' : '✨ Auto-Generate Caption'}
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
  );
}
