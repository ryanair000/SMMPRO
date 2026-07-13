"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { SOCIAL_ACCOUNTS } from '@/lib/socialAccounts';
import styles from './PostComposer.module.css';

export default function PostComposer() {
  const [queue, setQueue] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedAccountId, setSelectedAccountId] = useState(SOCIAL_ACCOUNTS[0].id);
  const [publishFacebook, setPublishFacebook] = useState(true);
  const [publishInstagram, setPublishInstagram] = useState(true);
  const [publishMode, setPublishMode] = useState('individual');
  const [scheduleTime, setScheduleTime] = useState('');
  const [spreadInterval, setSpreadInterval] = useState(2);
  const [recurrenceFrequency, setRecurrenceFrequency] = useState('none');
  const [recurrenceCount, setRecurrenceCount] = useState(7);
  const [lastRunSummary, setLastRunSummary] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [draggedQueueItemId, setDraggedQueueItemId] = useState(null);

  const fileInputRef = useRef(null);
  const queueRef = useRef([]);
  const maxLength = 2200;
  const draftStorageKey = 'smm-pro-campaign-draft';
  const selectedAccount = SOCIAL_ACCOUNTS.find(account => account.id === selectedAccountId) || SOCIAL_ACCOUNTS[0];
  const selectedItem = queue[selectedIndex];
  const facebookEnabled = selectedAccount.platforms?.facebook !== false;
  const instagramEnabled = selectedAccount.platforms?.instagram !== false;
  const facebookTargetActive = facebookEnabled && publishFacebook;
  const instagramTargetActive = instagramEnabled && publishInstagram;
  const carouselMode = publishMode === 'carousel';
  const hasTargets = facebookTargetActive || instagramTargetActive;
  const validImageUrl = !selectedItem?.imageUrl?.trim() || /^https?:\/\/\S+$/i.test(selectedItem.imageUrl.trim());
  const needsPublicInstagramUrl = !carouselMode && instagramTargetActive && !facebookTargetActive && !selectedItem?.imageUrl?.trim() && !selectedItem?.file;
  const carouselCountValid = !carouselMode || (queue.length >= 2 && queue.length <= 10);
  const carouselMediaMissing = carouselMode && queue.some(item => !item.imageUrl?.trim() && !item.file);
  const carouselUrlInvalid = carouselMode && queue.some(item => item.imageUrl?.trim() && !/^https?:\/\/\S+$/i.test(item.imageUrl.trim()));
  const scheduleDate = scheduleTime ? new Date(scheduleTime) : null;
  const scheduleIsTooSoon = scheduleDate && Number.isFinite(scheduleDate.getTime()) && scheduleDate.getTime() < Date.now() + 600000;
  const recurrenceEnabled = recurrenceFrequency !== 'none';
  const normalizedRecurrenceCount = Math.min(60, Math.max(1, Number.parseInt(recurrenceCount, 10) || 1));
  const needsScheduleForRecurrence = recurrenceEnabled && !scheduleTime;
  const recurrenceIntervalSeconds = recurrenceFrequency === 'weekly' ? 7 * 24 * 60 * 60 : 24 * 60 * 60;
  const totalScheduledJobs = queue.length * (recurrenceEnabled ? normalizedRecurrenceCount : 1);
  const canSubmit = queue.length > 0
    && hasTargets
    && validImageUrl
    && carouselCountValid
    && !carouselMediaMissing
    && !carouselUrlInvalid
    && !scheduleIsTooSoon
    && !needsScheduleForRecurrence
    && !isSubmitting
    && !isGenerating;
  const publishLabel = queue.length === 0
    ? 'Add Photos to Continue'
    : carouselMode
      ? `Publish 1 ${selectedAccount.name} Carousel (${queue.length} image${queue.length === 1 ? '' : 's'})`
    : scheduleTime || recurrenceEnabled
      ? `${recurrenceEnabled ? 'Schedule Recurring' : 'Schedule'} ${totalScheduledJobs} ${selectedAccount.name} Posts`
      : `Publish ${queue.length} ${selectedAccount.name} Posts Now`;
  const targetLabel = [facebookTargetActive && 'Facebook', instagramTargetActive && 'Instagram']
    .filter(Boolean)
    .join(' + ') || 'No channel selected';
  const timingLabel = carouselMode
    ? 'Publish immediately'
    : scheduleTime
      ? `${recurrenceEnabled ? `${recurrenceFrequency}, ` : ''}${new Date(scheduleTime).toLocaleString()}`
      : 'Publish immediately';

  const formatFileSize = bytes => {
    if (!Number.isFinite(bytes) || bytes <= 0) return 'Remote image';
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleAccountChange = (accountId) => {
    const nextAccount = SOCIAL_ACCOUNTS.find(account => account.id === accountId) || SOCIAL_ACCOUNTS[0];
    setSelectedAccountId(nextAccount.id);
    setPublishFacebook(nextAccount.platforms?.facebook !== false);
    setPublishInstagram(nextAccount.platforms?.instagram !== false);
    setPublishMode('individual');
    setLastRunSummary([]);
  };

  const handlePublishModeChange = (mode) => {
    setPublishMode(mode);
    setLastRunSummary([]);

    if (mode === 'carousel') {
      setPublishFacebook(false);
      setPublishInstagram(true);
      setScheduleTime('');
      setRecurrenceFrequency('none');
    }
  };

  const preparePublicImageUrl = async (item, index) => {
    let url = item.imageUrl?.trim() || '';
    if (!url && item.file) {
      const uploadFormData = new FormData();
      uploadFormData.append('image', item.file);
      const uploadResponse = await fetch('/api/upload-image', {
        method: 'POST',
        body: uploadFormData
      });
      const uploadData = await uploadResponse.json().catch(() => ({}));
      if (!uploadResponse.ok || !uploadData.url) {
        throw new Error(uploadData.error || `Could not prepare image ${index + 1} for Instagram.`);
      }
      url = uploadData.url;
      updateQueueItem(index, { imageUrl: url });
    }

    if (!url) throw new Error(`Image ${index + 1} needs a file or public URL.`);
    return url;
  };

  const addFilesToQueue = useCallback((files, sourceLabel = 'Added') => {
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    if (!imageFiles.length) {
      toast.error('No image was found.');
      return;
    }

    if (queue.length + imageFiles.length > 20) {
      toast.error('You can only upload up to 20 images at once.');
      return;
    }

    const newItems = imageFiles.map(file => ({
      id: Math.random().toString(36).slice(2, 11),
      file,
      objectUrl: URL.createObjectURL(file),
      caption: '',
      imageUrl: '',
      status: 'pending'
    }));

    setQueue(prev => [...prev, ...newItems]);
    setLastRunSummary([]);
    if (queue.length === 0) setSelectedIndex(0);
    toast.success(`${sourceLabel} ${imageFiles.length} image${imageFiles.length === 1 ? '' : 's'}.`);
  }, [queue.length]);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    try {
      const savedDraft = JSON.parse(localStorage.getItem(draftStorageKey) || 'null');
      if (!savedDraft || savedDraft.version !== 1) return;

      const draftAccount = SOCIAL_ACCOUNTS.find(account => account.id === savedDraft.accountId);
      if (draftAccount) setSelectedAccountId(draftAccount.id);
      setPublishFacebook(savedDraft.publishFacebook !== false);
      setPublishInstagram(savedDraft.publishInstagram !== false);
      setPublishMode(savedDraft.publishMode === 'carousel' ? 'carousel' : 'individual');
      setScheduleTime(savedDraft.scheduleTime || '');
      setSpreadInterval(Number(savedDraft.spreadInterval) || 0);
      setRecurrenceFrequency(['daily', 'weekly'].includes(savedDraft.recurrenceFrequency) ? savedDraft.recurrenceFrequency : 'none');
      setRecurrenceCount(Number(savedDraft.recurrenceCount) || 7);

      const restorableItems = Array.isArray(savedDraft.items)
        ? savedDraft.items.filter(item => /^https?:\/\/\S+$/i.test(item.imageUrl || '')).map(item => ({
          id: Math.random().toString(36).slice(2, 11),
          file: null,
          objectUrl: '',
          caption: item.caption || '',
          imageUrl: item.imageUrl,
          status: 'pending',
          name: item.name || 'Remote image'
        }))
        : [];

      if (restorableItems.length) setQueue(restorableItems);
      toast.success('Your saved campaign draft was restored.');
    } catch {
      localStorage.removeItem(draftStorageKey);
    }
  }, []);

  useEffect(() => {
    const handlePaste = (event) => {
      const files = Array.from(event.clipboardData?.files || []);
      const imageFiles = files.filter(file => file.type.startsWith('image/'));

      if (!imageFiles.length) return;

      event.preventDefault();
      addFilesToQueue(imageFiles, 'Pasted');
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [addFilesToQueue]);

  useEffect(() => () => {
    queueRef.current.forEach(item => {
      if (item.objectUrl) URL.revokeObjectURL(item.objectUrl);
    });
  }, []);

  const handleFilesChange = (event) => {
    const files = Array.from(event.target.files);
    if (!files.length) return;

    const invalidFile = files.find(file => !file.type.startsWith('image/'));
    if (invalidFile) {
      toast.error(`${invalidFile.name} is not an image file.`);
      return;
    }

    addFilesToQueue(files, 'Added');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setIsDragging(false);
    if (isSubmitting) return;
    addFilesToQueue(Array.from(event.dataTransfer.files || []), 'Added');
  };

  const updateQueueItem = (index, updates) => {
    setQueue(prev => {
      const newQueue = [...prev];
      if (!newQueue[index]) return prev;
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
    if (!hasTargets) {
      toast.error('Choose Facebook, Instagram, or both before publishing.');
      return;
    }

    if (needsPublicInstagramUrl) {
      toast.error('Instagram-only publishing needs a public image URL. Add one in the Instagram URL field.');
      return;
    }

    if (!validImageUrl) {
      toast.error('Enter a valid public image URL or leave the field empty.');
      return;
    }

    if (needsScheduleForRecurrence) {
      toast.error('Choose a first scheduled date and time for recurring posts.');
      return;
    }

    if (!carouselCountValid) {
      toast.error('Instagram carousels require 2-10 images.');
      return;
    }

    if (carouselMediaMissing || carouselUrlInvalid) {
      toast.error('Every carousel slide needs an uploaded image or a valid public image URL.');
      return;
    }

    if (carouselMode) {
      setIsSubmitting(true);
      setLastRunSummary([]);
      const toastId = toast.loading(`Preparing ${queue.length} images for the ${selectedAccount.name} carousel...`);

      try {
        const carouselItems = [];
        for (let index = 0; index < queue.length; index += 1) {
          setSelectedIndex(index);
          updateQueueItem(index, { status: 'uploading' });
          const imageUrl = await preparePublicImageUrl(queue[index], index);
          carouselItems.push({ imageUrl });
          updateQueueItem(index, { status: 'ready' });
        }

        const formData = new FormData();
        formData.append('accountId', selectedAccount.id);
        formData.append('publishFacebook', 'false');
        formData.append('publishInstagram', 'true');
        formData.append('publishMode', 'carousel');
        formData.append('message', queue[0]?.caption?.trim() || '');
        formData.append('carouselItems', JSON.stringify(carouselItems));

        const response = await fetch('/api/post', {
          method: 'POST',
          body: formData
        });
        const text = await response.text();
        let data = {};
        try {
          data = text ? JSON.parse(text) : {};
        } catch {
          data = { error: text || 'Failed to publish carousel' };
        }

        if (!response.ok) {
          throw new Error(data.error || 'Failed to publish carousel');
        }

        const failedTargets = (data.results || []).filter(result => result.status !== 'Success');
        if (failedTargets.length) {
          throw new Error(failedTargets.map(result => `${result.target}: ${result.status}`).join('; '));
        }

        setLastRunSummary((data.results || []).map(result => ({
          post: 'Carousel',
          target: result.target,
          status: result.status || 'Unknown',
          ok: result.status === 'Success'
        })));
        toast.success('Instagram carousel published successfully.', { id: toastId });
        localStorage.removeItem(draftStorageKey);
        queue.forEach(item => {
          if (item.objectUrl) URL.revokeObjectURL(item.objectUrl);
        });
        setQueue([]);
        setSelectedIndex(0);
      } catch (error) {
        queue.forEach((_, index) => updateQueueItem(index, { status: 'error' }));
        setLastRunSummary([{ post: 'Carousel', target: selectedAccount.name, status: error.message, ok: false }]);
        toast.error(error.message, { id: toastId });
      } finally {
        setIsSubmitting(false);
      }
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
    setLastRunSummary([]);
    const toastId = toast.loading(`${recurrenceEnabled ? 'Scheduling recurring posts' : 'Publishing/Scheduling'} for ${selectedAccount.name}...`);
    let successCount = 0;
    let hadFailures = false;
    const occurrenceCount = recurrenceEnabled ? normalizedRecurrenceCount : 1;

    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      if (item.status === 'published') continue;

      setSelectedIndex(i);
      let itemImageUrl = item.imageUrl?.trim() || '';

      for (let occurrenceIndex = 0; occurrenceIndex < occurrenceCount; occurrenceIndex += 1) {
        try {
          if (instagramTargetActive && !facebookTargetActive && !itemImageUrl && item.file) {
            itemImageUrl = await preparePublicImageUrl(item, i);
          }

          if (instagramTargetActive && !facebookTargetActive && !itemImageUrl) {
            throw new Error('Instagram-only publishing needs a public image URL.');
          }

          const formData = new FormData();
          formData.append('accountId', selectedAccount.id);
          formData.append('publishFacebook', facebookTargetActive ? 'true' : 'false');
          formData.append('publishInstagram', instagramTargetActive ? 'true' : 'false');
          if (item.caption.trim()) formData.append('message', item.caption);
          if (item.file) formData.append('image', item.file);
          if (itemImageUrl) formData.append('imageUrl', itemImageUrl);

          if (baseTime) {
            const recurrenceOffset = occurrenceIndex * recurrenceIntervalSeconds;
            const spreadOffset = i * spreadInterval * 3600;
            const postUnixTime = Math.floor(baseTime + recurrenceOffset + spreadOffset);
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

          const label = recurrenceEnabled ? `Post ${i + 1}, run ${occurrenceIndex + 1}` : `Post ${i + 1}`;
          const resultRows = (data.results || []).map(result => ({
            post: label,
            target: result.target,
            status: result.status || 'Unknown',
            ok: result.status === 'Success'
          }));
          const failedTargets = data.results
            ?.filter(result => result.status && result.status !== 'Success')
            .map(result => `${result.target}: ${result.status}`);

          if (failedTargets?.length) {
            hadFailures = true;
            updateQueueItem(i, { status: 'error' });
            toast.error(`${label}: ${failedTargets.join('; ')}`);
          } else {
            updateQueueItem(i, { status: 'published' });
            successCount++;
          }

          setLastRunSummary(prev => [...prev, ...resultRows]);
        } catch (err) {
          const label = recurrenceEnabled ? `Post ${i + 1}, run ${occurrenceIndex + 1}` : `Post ${i + 1}`;
          hadFailures = true;
          toast.error(`${label}: ${err.message}`);
          updateQueueItem(i, { status: 'error' });
          setLastRunSummary(prev => [
            ...prev,
            { post: label, target: selectedAccount.name, status: err.message, ok: false }
          ]);
        }
      }
    }

    setIsSubmitting(false);
    if (hadFailures) {
      toast.error(`Finished with issues. ${successCount} posts fully succeeded; review the queue before retrying.`, { id: toastId });
    } else {
      toast.success(`Successfully processed ${successCount} posts.`, { id: toastId });
      localStorage.removeItem(draftStorageKey);
      queue.forEach(item => {
        if (item.objectUrl) URL.revokeObjectURL(item.objectUrl);
      });
      setQueue([]);
      setSelectedIndex(0);
      setScheduleTime('');
    }
  };

  const removeItem = (index) => {
    const item = queue[index];
    if (item?.objectUrl) URL.revokeObjectURL(item.objectUrl);
    setLastRunSummary([]);
    setQueue(prev => prev.filter((_, i) => i !== index));
    if (selectedIndex >= index && selectedIndex > 0) {
      setSelectedIndex(selectedIndex - 1);
    }
  };

  const moveQueueItem = (fromIndex, toIndex) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || toIndex >= queue.length) return;

    const selectedId = queue[selectedIndex]?.id;
    const nextQueue = [...queue];
    const [movedItem] = nextQueue.splice(fromIndex, 1);
    nextQueue.splice(toIndex, 0, movedItem);

    setQueue(nextQueue);
    setSelectedIndex(Math.max(0, nextQueue.findIndex(item => item.id === selectedId)));
    setLastRunSummary([]);
  };

  const handleQueueDragStart = (event, itemId) => {
    if (!carouselMode || queue.length < 2) return;
    setDraggedQueueItemId(itemId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', itemId);
  };

  const handleQueueDrop = (event, toIndex) => {
    if (!carouselMode) return;
    event.preventDefault();
    const itemId = event.dataTransfer.getData('text/plain') || draggedQueueItemId;
    const fromIndex = queue.findIndex(item => item.id === itemId);
    moveQueueItem(fromIndex, toIndex);
    setDraggedQueueItemId(null);
  };

  const handleSaveDraft = () => {
    try {
      const items = queue
        .filter(item => /^https?:\/\/\S+$/i.test(item.imageUrl?.trim() || ''))
        .map(item => ({
          name: item.file?.name || item.name || 'Remote image',
          caption: item.caption,
          imageUrl: item.imageUrl.trim()
        }));

      localStorage.setItem(draftStorageKey, JSON.stringify({
        version: 1,
        accountId: selectedAccount.id,
        publishFacebook,
        publishInstagram,
        publishMode,
        scheduleTime,
        spreadInterval,
        recurrenceFrequency,
        recurrenceCount,
        items
      }));

      const localOnlyCount = queue.length - items.length;
      if (localOnlyCount > 0) {
        toast.success(`Draft settings saved. Re-add ${localOnlyCount} local image file${localOnlyCount === 1 ? '' : 's'} when you return.`);
      } else {
        toast.success('Campaign draft saved in this browser.');
      }
    } catch {
      toast.error('Could not save the draft in this browser.');
    }
  };

  return (
    <div className={styles.splitGrid}>
      <div className={`glass-panel ${styles.controlPane}`}>
        <div className={styles.sectionKicker}>Step 1</div>
        <div className={styles.accountHeader}>
          <div>
            <h2 className={styles.paneTitle}>Choose your brand and channels</h2>
            <p className={styles.accountHint}>Select the account this campaign belongs to, then choose where it should publish.</p>
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
              onClick={() => handleAccountChange(account.id)}
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
              checked={facebookTargetActive}
              onChange={e => setPublishFacebook(e.target.checked)}
              disabled={isSubmitting || !facebookEnabled || carouselMode}
            />
            Facebook Page{!facebookEnabled ? ' (Unavailable)' : carouselMode ? ' (Individual mode only)' : ''}
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

        {instagramTargetActive && (
          <div className={styles.publishModeBlock}>
            <h3>Post format</h3>
            <div className={styles.publishModeOptions}>
              <label className={publishMode === 'individual' ? styles.publishModeActive : ''}>
                <input
                  type="radio"
                  name="publish-mode"
                  value="individual"
                  checked={publishMode === 'individual'}
                  onChange={() => handlePublishModeChange('individual')}
                  disabled={isSubmitting}
                />
                <span>
                  <strong>Individual posts</strong>
                  <small>Each image publishes separately with its own caption.</small>
                </span>
              </label>
              <label className={publishMode === 'carousel' ? styles.publishModeActive : ''}>
                <input
                  type="radio"
                  name="publish-mode"
                  value="carousel"
                  checked={publishMode === 'carousel'}
                  onChange={() => handlePublishModeChange('carousel')}
                  disabled={isSubmitting}
                />
                <span>
                  <strong>Carousel</strong>
                  <small>2-10 images in one post. Instagram uses one shared caption.</small>
                </span>
              </label>
            </div>
            {carouselMode && (
              <p className={styles.publishModeHint}>
                Post 1&apos;s caption will be the shared carousel caption. Use Individual posts when every image needs its own caption.
              </p>
            )}
          </div>
        )}

        <div className={styles.sectionDivider}>
          <span aria-hidden="true">2</span>
          <div>
            <h2 className={styles.paneTitle}>Add your campaign media</h2>
            <p className={styles.accountHint}>Upload up to 20 images or paste directly from your clipboard.</p>
          </div>
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
            + Add images
          </label>
        </div>
        <p className={styles.pasteHint}>Tip: copy an image from your clipboard and press Ctrl+V anywhere on this page.</p>

        {(!hasTargets || !validImageUrl || needsPublicInstagramUrl || !carouselCountValid || carouselMediaMissing || carouselUrlInvalid || scheduleIsTooSoon || needsScheduleForRecurrence || (scheduleTime && instagramTargetActive)) && (
          <div className={styles.validationPanel} role="status">
            {!hasTargets && <p>Choose Facebook, Instagram, or both.</p>}
            {!validImageUrl && <p>Use a valid public image URL or leave it empty.</p>}
            {needsPublicInstagramUrl && <p>Instagram-only publishing needs a public image URL.</p>}
            {!carouselCountValid && <p>Instagram carousels require 2-10 images.</p>}
            {carouselMediaMissing && <p>Every carousel slide needs an uploaded image or public image URL.</p>}
            {carouselUrlInvalid && <p>Every carousel URL must start with http:// or https://.</p>}
            {scheduleIsTooSoon && <p>Scheduled time must be at least 10 minutes in the future.</p>}
            {needsScheduleForRecurrence && <p>Recurring posts need a first scheduled date and time.</p>}
            {scheduleTime && instagramTargetActive && <p>Instagram scheduling is not supported yet. Scheduled runs will publish/schedule Facebook and report Instagram as skipped.</p>}
          </div>
        )}

        {queue.length > 0 && (
          <section className={styles.mediaQueue} aria-labelledby="media-queue-title">
            <div className={styles.queueHeader}>
              <div>
                <h3 id="media-queue-title">{carouselMode ? 'Carousel slides' : 'Photo queue'}</h3>
                <p>{carouselMode ? 'Drag slides or use the arrows to set the published order.' : 'Select a file to edit its caption and publishing URL.'}</p>
              </div>
              <span className={styles.queueCount}>{selectedIndex + 1} of {queue.length}</span>
            </div>
            <div className={styles.queueContainer}>
              {queue.map((item, idx) => (
                <div
                  key={item.id}
                  className={`${styles.queueItem} ${selectedIndex === idx ? styles.active : ''} ${draggedQueueItemId === item.id ? styles.queueItemDragging : ''} ${styles['status-' + item.status]}`}
                  draggable={carouselMode && queue.length > 1}
                  onDragStart={event => handleQueueDragStart(event, item.id)}
                  onDragOver={event => {
                    if (carouselMode) {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = 'move';
                    }
                  }}
                  onDrop={event => handleQueueDrop(event, idx)}
                  onDragEnd={() => setDraggedQueueItemId(null)}
                  onClick={() => setSelectedIndex(idx)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedIndex(idx);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-pressed={selectedIndex === idx}
                  aria-label={`Edit ${carouselMode ? 'slide' : 'post'} ${idx + 1}, status ${item.status}`}
                >
                  <span className={styles.fileIcon} aria-hidden="true">{idx + 1}</span>
                  <div className={styles.queueInfo}>
                    <span className={styles.queueLabel}>{item.file?.name || item.name || `${carouselMode ? 'Slide' : 'Post'} ${idx + 1}`}</span>
                    <span className={styles.fileMeta}>{formatFileSize(item.file?.size)}</span>
                    <span className={styles.queueStatus}>{item.status}</span>
                  </div>
                  {carouselMode && queue.length > 1 && (
                    <div className={styles.reorderControls} aria-label={`Reorder slide ${idx + 1}`}>
                      <button
                        type="button"
                        disabled={idx === 0}
                        aria-label={`Move slide ${idx + 1} earlier`}
                        title="Move earlier"
                        onClick={event => {
                          event.stopPropagation();
                          moveQueueItem(idx, idx - 1);
                        }}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        disabled={idx === queue.length - 1}
                        aria-label={`Move slide ${idx + 1} later`}
                        title="Move later"
                        onClick={event => {
                          event.stopPropagation();
                          moveQueueItem(idx, idx + 1);
                        }}
                      >
                        ↓
                      </button>
                      <span className={styles.dragHandle} aria-hidden="true" title="Drag to reorder">⋮⋮</span>
                    </div>
                  )}
                  <button
                    type="button"
                    className={styles.removeQueueBtn}
                    aria-label={`Remove ${carouselMode ? 'slide' : 'post'} ${idx + 1}`}
                    onClick={(event) => { event.stopPropagation(); removeItem(idx); }}
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {queue.length === 0 && (
          <label
            htmlFor="bulk-upload"
            className={`${styles.emptyUpload} ${isDragging ? styles.emptyUploadDragging : ''}`}
            onDragEnter={() => setIsDragging(true)}
            onDragLeave={() => setIsDragging(false)}
            onDragOver={event => event.preventDefault()}
            onDrop={handleDrop}
          >
            <span className={styles.uploadGlyph} aria-hidden="true">+</span>
            <strong>Drop images here or browse files</strong>
            <span>PNG, JPG or WEBP · up to 20 images · paste with Ctrl+V</span>
          </label>
        )}

        {selectedItem && (
          <div className={styles.activeEditor}>
            <div className={styles.editorHeader}>
              <div>
                <span className={styles.sectionKicker}>Step 3</span>
                <h2 className={styles.paneTitle}>Write your caption</h2>
              </div>
              <button
                type="button"
                className={styles.inlineAiButton}
                onClick={handleGenerateAll}
                disabled={isGenerating || isSubmitting || queue.length === 0}
              >
                {isGenerating ? 'Writing captions…' : 'Generate with AI'}
              </button>
            </div>
            <div className={styles.captionTabs} role="tablist" aria-label="Campaign posts">
              {queue.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={selectedIndex === index}
                  className={selectedIndex === index ? styles.captionTabActive : ''}
                  onClick={() => setSelectedIndex(index)}
                >
                  {carouselMode ? 'Slide' : 'Post'} {index + 1}
                </button>
              ))}
            </div>
            <div className={styles.textareaWrapper}>
              <textarea
                value={selectedItem.caption}
                maxLength={maxLength}
                onChange={e => updateQueueItem(selectedIndex, { caption: e.target.value, status: 'ready' })}
                placeholder={carouselMode && selectedIndex > 0
                  ? 'Carousel captions are shared. Edit Slide 1 for the published caption.'
                  : `Write or generate a ${selectedAccount.name} caption...`}
                disabled={isSubmitting || (carouselMode && selectedIndex > 0)}
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
                aria-invalid={!validImageUrl}
                disabled={isSubmitting}
              />
            </div>
          </div>
        )}

        <div className={styles.sectionDivider}>
          <span aria-hidden="true">4</span>
          <div>
            <h2 className={styles.paneTitle}>Choose when to publish</h2>
            <p className={styles.accountHint}>Publish now, schedule a campaign, or set a recurring cadence.</p>
          </div>
        </div>

        {!carouselMode ? <div className={styles.schedulingBlock}>
          <h3>Campaign timing</h3>
          <div className={styles.scheduleRow}>
            <div className={styles.scheduleInput}>
              <label>First Date & Time (Leave blank to post now)</label>
              <input
                type="datetime-local"
                value={scheduleTime}
                onChange={e => setScheduleTime(e.target.value)}
                disabled={isSubmitting}
              />
            </div>
            {scheduleTime && queue.length > 1 && (
              <div className={styles.scheduleInput}>
                <label>Spread Posts Apart (Hours)</label>
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
          <div className={styles.recurrenceGrid}>
            <div className={styles.scheduleInput}>
              <label>Repeat</label>
              <select
                value={recurrenceFrequency}
                onChange={event => setRecurrenceFrequency(event.target.value)}
                disabled={isSubmitting}
              >
                <option value="none">Do not repeat</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>
            {recurrenceEnabled && (
              <div className={styles.scheduleInput}>
                <label>Occurrences</label>
                <input
                  type="number"
                  min="1"
                  max="60"
                  step="1"
                  value={recurrenceCount}
                  onChange={event => setRecurrenceCount(event.target.value)}
                  disabled={isSubmitting}
                />
              </div>
            )}
          </div>
          {recurrenceEnabled && (
            <p className={styles.scheduleHint}>
              This will create {totalScheduledJobs} scheduled Facebook post{totalScheduledJobs === 1 ? '' : 's'}.
              Example: choose tomorrow at 9:00 AM and Daily to post every day at 9:00 AM.
            </p>
          )}
        </div> : (
          <div className={styles.schedulingBlock}>
            <h3>Carousel Publishing</h3>
            <p className={styles.scheduleHint}>Instagram carousels publish immediately. Scheduling and recurrence are unavailable in carousel mode.</p>
          </div>
        )}

        {lastRunSummary.length > 0 && (
          <div className={styles.resultPanel} aria-live="polite">
            <h3>Publish Results</h3>
            <div className={styles.resultList}>
              {lastRunSummary.map((result, index) => (
                <div
                  key={`${result.post}-${result.target}-${index}`}
                  className={`${styles.resultItem} ${result.ok ? styles.resultSuccess : styles.resultError}`}
                >
                  <span>{result.post}</span>
                  <strong>{result.target}</strong>
                  <em>{result.status}</em>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      <aside id="campaign-summary" className={`glass-panel ${styles.summaryPane}`} aria-label="Campaign summary">
        <div className={styles.summaryHeader}>
          <span className={styles.summaryEyebrow}>Campaign summary</span>
          <span className={styles.summaryStatus}>Draft</span>
        </div>

        <div className={styles.summaryBrand}>
          <span className={styles.summaryAvatar} style={{ '--account-accent': selectedAccount.accent }}>
            {selectedAccount.shortName}
          </span>
          <div>
            <strong>{selectedAccount.name}</strong>
            <span>{selectedAccount.handle}</span>
          </div>
        </div>

        <dl className={styles.summaryList}>
          <div>
            <dt>Channels</dt>
            <dd>{targetLabel}</dd>
          </div>
          <div>
            <dt>Media</dt>
            <dd>{queue.length ? `${queue.length} image${queue.length === 1 ? '' : 's'}` : 'No images added'}</dd>
          </div>
          <div>
            <dt>Format</dt>
            <dd>{carouselMode ? 'Instagram carousel' : 'Individual posts'}</dd>
          </div>
          <div>
            <dt>Timing</dt>
            <dd>{timingLabel}</dd>
          </div>
          {recurrenceEnabled && (
            <div>
              <dt>Total jobs</dt>
              <dd>{totalScheduledJobs}</dd>
            </div>
          )}
        </dl>

        <div className={styles.summaryNotice}>
          <span aria-hidden="true">✓</span>
          <p>Review the campaign details, then publish when every field is ready.</p>
        </div>

        <button
          className={`btn ${styles.summaryPublishButton}`}
          onClick={handleSubmitAll}
          disabled={!canSubmit}
        >
          {isSubmitting ? <><span className={styles.spinner}></span> Processing...</> : publishLabel}
        </button>
        <button
          type="button"
          className={styles.saveDraftButton}
          onClick={handleSaveDraft}
          disabled={isSubmitting || isGenerating}
        >
          Save as draft
        </button>
        <p className={styles.draftHint}>Drafts are stored securely in this browser. Local files must be added again after you return.</p>
      </aside>
    </div>
  );
}
