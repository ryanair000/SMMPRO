"use client";

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { SOCIAL_ACCOUNTS } from '@/lib/socialAccounts';
import styles from './PostComposer.module.css';

function Control({ label, children }) {
  return <div className={styles.control}><span>{label}</span><div>{children}</div></div>;
}

function PaneHeader({ title, badge, hint, children }) {
  return <div className={styles.paneHeader}><div><div className={styles.headingLine}><h2>{title}</h2><span>{badge}</span></div><p>{hint}</p></div>{children}</div>;
}

export default function ModernComposerView({ model: m, fileInputRef }) {
  const [mediaPage, setMediaPage] = useState(0);
  const [panel, setPanel] = useState(null);
  const pageSize = 3;
  const pageCount = Math.max(1, Math.ceil(m.queue.length / pageSize));
  const safePage = Math.min(mediaPage, pageCount - 1);
  const start = safePage * pageSize;
  const visible = m.queue.slice(start, start + pageSize);
  const selectedItem = m.queue[m.selectedIndex];
  const captionIndex = m.carouselMode ? 0 : m.selectedIndex;
  const captionItem = m.queue[captionIndex];
  const warnings = [
    !m.targetLabel || m.targetLabel === 'No channel selected' ? 'Choose at least one channel.' : '',
    !m.validImageUrl ? 'The selected Instagram URL must start with http:// or https://.' : '',
    m.needsPublicInstagramUrl ? 'Instagram-only publishing needs a public image URL.' : '',
    !m.carouselCountValid ? 'Instagram carousels require 2-10 images.' : '',
    m.carouselMediaMissing ? 'Every carousel slide needs an image.' : '',
    m.carouselUrlInvalid ? 'Every carousel URL must be valid.' : '',
    m.scheduleIsTooSoon ? 'Schedule at least 10 minutes from now.' : '',
    m.needsScheduleForRecurrence ? 'Recurring posts need a first publish time.' : '',
    m.scheduleTime && m.instagramTargetActive ? 'Scheduled runs publish to Facebook only.' : ''
  ].filter(Boolean);

  useEffect(() => {
    const close = event => event.key === 'Escape' && setPanel(null);
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, []);

  const selectItem = index => {
    m.setSelectedIndex(Math.max(0, Math.min(index, m.queue.length - 1)));
    setMediaPage(Math.floor(index / pageSize));
  };

  return (
    <div className={styles.composer}>
      <section className={styles.setupBand}>
        <div className={styles.setupTitle}><span>New campaign</span><h1>Create and publish</h1><p>One focused workspace, from media to live post.</p></div>
        <div className={styles.setupControls}>
          <Control label="Brand">{SOCIAL_ACCOUNTS.map(account => <button key={account.id} type="button"
            className={m.selectedAccountId === account.id ? styles.active : ''} onClick={() => m.handleAccountChange(account.id)}
            disabled={m.isSubmitting || m.isGenerating}><i style={{ '--account-accent': account.accent }}>{account.shortName}</i>{account.name}</button>)}</Control>
          <Control label="Channels">
            <button type="button" className={m.facebookTargetActive ? styles.active : ''} onClick={() => m.setPublishFacebook(value => !value)}
              disabled={!m.facebookEnabled || m.carouselMode || m.isSubmitting}>Facebook</button>
            <button type="button" className={m.instagramTargetActive ? styles.active : ''} onClick={() => m.setPublishInstagram(value => !value)}
              disabled={!m.instagramEnabled || m.carouselMode || m.isSubmitting}>Instagram</button>
          </Control>
          <Control label="Format">
            <button type="button" className={!m.carouselMode ? styles.active : ''} onClick={() => m.handlePublishModeChange('individual')}>Separate</button>
            <button type="button" className={m.carouselMode ? styles.active : ''} onClick={() => m.handlePublishModeChange('carousel')} disabled={!m.instagramEnabled}>Carousel</button>
          </Control>
          <Control label="Timing">
            <button type="button" className={!m.scheduleTime && !m.recurrenceEnabled ? styles.active : ''}
              onClick={() => { m.setScheduleTime(''); m.setRecurrenceFrequency('none'); setPanel(null); }} disabled={m.carouselMode}>Now</button>
            <button type="button" className={m.scheduleTime || m.recurrenceEnabled ? styles.active : ''}
              onClick={() => setPanel('schedule')} disabled={m.carouselMode}>Schedule</button>
          </Control>
        </div>
      </section>

      <section className={styles.composerCard}>
        <div className={styles.workspace}>
          <section className={styles.mediaPane}>
            <PaneHeader title="Media" badge={m.queue.length + '/20'} hint={m.carouselMode ? 'Drag images to set carousel order.' : 'Select an image to edit its post.'}>
              <button type="button" className={styles.addButton} onClick={() => fileInputRef.current?.click()}
                disabled={m.isSubmitting || m.isGenerating || m.queue.length >= 20}>+ Add images</button>
            </PaneHeader>
            <input ref={fileInputRef} type="file" accept="image/*" multiple className={styles.hiddenInput}
              onChange={m.handleFilesChange} disabled={m.isSubmitting || m.isGenerating} />
            <div className={[styles.dropZone, m.isDragging ? styles.dropActive : '', !m.queue.length ? styles.dropEmpty : ''].filter(Boolean).join(' ')}
              onDragEnter={event => { event.preventDefault(); m.setIsDragging(true); }} onDragOver={event => event.preventDefault()}
              onDragLeave={() => m.setIsDragging(false)} onDrop={m.handleDrop}>
              {!m.queue.length ? <button type="button" className={styles.emptyDrop} onClick={() => fileInputRef.current?.click()}>
                <span>+</span><strong>Drop or paste your posters here</strong><small>PNG, JPG or WebP · up to 20 images</small><em>Choose images</em>
              </button> : <>
                <div className={styles.mediaGrid}>{visible.map((item, pageIndex) => {
                  const index = start + pageIndex;
                  const source = item.objectUrl || item.imageUrl;
                  return <article key={item.id} className={[styles.mediaCard, index === m.selectedIndex ? styles.selected : '', m.draggedQueueItemId === item.id ? styles.dragging : ''].filter(Boolean).join(' ')}
                    draggable={m.carouselMode && !m.isSubmitting} onDragStart={event => m.handleQueueDragStart(event, item.id)}
                    onDragOver={event => event.preventDefault()} onDrop={event => m.handleQueueDrop(event, index)}
                    onDragEnd={() => m.setDraggedQueueItemId(null)}>
                    <button type="button" className={styles.previewButton} onClick={() => selectItem(index)} aria-label={'Edit image ' + (index + 1)}>
                      <span className={styles.preview}>{source ? <Image src={source} alt={'Campaign image ' + (index + 1)} fill sizes="180px" unoptimized draggable={false} /> : <i>No preview</i>}</span>
                      <b className={styles.order}>{index + 1}</b>
                      <small className={item.status === 'error' ? styles.error : ''}>{item.status === 'generating' ? 'Writing...' : item.status === 'error' ? 'Attention' : 'Ready'}</small>
                    </button>
                    <div className={styles.cardActions}>{m.carouselMode && <>
                      <button type="button" onClick={() => m.moveQueueItem(index, index - 1)} disabled={!index} aria-label="Move earlier">←</button>
                      <button type="button" onClick={() => m.moveQueueItem(index, index + 1)} disabled={index === m.queue.length - 1} aria-label="Move later">→</button>
                    </>}<button type="button" onClick={() => m.removeItem(index)}>Remove</button></div>
                  </article>;
                })}</div>
                <div className={styles.mediaFooter}><span>{m.carouselMode ? 'Drag any poster to rearrange it.' : 'Paste images anywhere with Ctrl+V.'}</span>
                  {pageCount > 1 && <nav className={styles.pager}><button type="button" onClick={() => setMediaPage(safePage - 1)} disabled={!safePage}>←</button>
                    <span>{safePage + 1} / {pageCount}</span><button type="button" onClick={() => setMediaPage(safePage + 1)} disabled={safePage === pageCount - 1}>→</button></nav>}
                </div>
              </>}
            </div>
          </section>

          <section className={styles.captionPane}>
            {captionItem ? <>
              <PaneHeader title="Caption" badge={m.carouselMode ? 'Shared' : (captionIndex + 1) + '/' + m.queue.length}
                hint={m.carouselMode ? 'One caption for the full carousel.' : 'Each image publishes as its own post.'}>
                <button type="button" className={styles.aiButton} onClick={m.handleGenerateAll} disabled={m.isGenerating || m.isSubmitting}>
                  {m.isGenerating ? 'Writing...' : m.carouselMode ? 'Write with AI' : 'Write missing captions'}</button>
              </PaneHeader>
              <div className={styles.captionEditor}><textarea value={captionItem.caption}
                onChange={event => m.updateQueueItem(captionIndex, { caption: event.target.value, status: 'ready' })}
                placeholder={m.carouselMode ? 'Write one caption for this carousel...' : 'Write a caption for this post...'}
                maxLength={m.maxLength} disabled={m.isSubmitting || m.isGenerating} />
                <div><span>{captionItem.caption ? 'Caption ready' : 'Add a caption or let AI write it.'}</span><b>{captionItem.caption.length}/{m.maxLength}</b></div></div>
              {!m.carouselMode && m.queue.length > 1 && <div className={styles.postNav}><button type="button" onClick={() => selectItem(m.selectedIndex - 1)} disabled={!m.selectedIndex}>← Previous</button>
                <span>Post {m.selectedIndex + 1} of {m.queue.length}</span><button type="button" onClick={() => selectItem(m.selectedIndex + 1)} disabled={m.selectedIndex === m.queue.length - 1}>Next →</button></div>}
              <div className={styles.quickSettings}>
                <Option label="Instagram media URL" value={selectedItem?.imageUrl?.trim() ? 'Added' : 'Automatic upload'} active={panel === 'instagram'} onClick={() => setPanel('instagram')} />
                <Option label="Schedule and repeat" value={m.timingLabel} active={panel === 'schedule'} onClick={() => setPanel('schedule')} disabled={m.carouselMode} />
                {!!m.lastRunSummary.length && <Option label="Latest run" value={m.lastRunSummary.length + ' results'} active={panel === 'results'} onClick={() => setPanel('results')} />}
              </div>
              <div className={[styles.readiness, warnings.length ? styles.warning : styles.ready].join(' ')}><span>{warnings.length ? '!' : '✓'}</span><div>
                <strong>{warnings.length ? 'Review before publishing' : 'Ready to publish'}</strong><p>{warnings[0] || m.targetLabel + ' · ' + m.timingLabel}</p></div></div>
            </> : <div className={styles.emptyCaption}><span>Aa</span><h2>Your caption workspace</h2><p>Add posters to write captions and prepare the campaign.</p></div>}
            {panel && <SettingsPanel panel={panel} close={() => setPanel(null)} model={m} selectedItem={selectedItem} />}
          </section>
        </div>

        <footer className={styles.actionBar}>
          <div className={styles.campaignSummary}><span style={{ '--account-accent': m.selectedAccount.accent }}>{m.selectedAccount.shortName}</span><div>
            <strong>{m.selectedAccount.name} · {m.targetLabel}</strong><p>{m.queue.length} image{m.queue.length === 1 ? '' : 's'} · {m.carouselMode ? '1 carousel' : m.queue.length + ' separate post' + (m.queue.length === 1 ? '' : 's')} · {m.timingLabel}</p></div></div>
          <div className={styles.actionStatus}>{warnings.length > 0 && m.queue.length > 0 && <span>{warnings.length} to review</span>}</div>
          <button type="button" className={styles.saveButton} onClick={m.handleSaveDraft} disabled={m.isSubmitting || m.isGenerating}>Save draft</button>
          <button type="button" className={styles.publishButton} onClick={m.handleSubmitAll} disabled={!m.canSubmit} title={m.publishLabel}>
            {m.isSubmitting ? 'Processing...' : !m.queue.length ? 'Add images' : m.carouselMode ? 'Publish carousel' : m.scheduleTime || m.recurrenceEnabled ? 'Schedule posts' : 'Publish posts'}</button>
        </footer>
      </section>
    </div>
  );
}

function Option({ label, value, active, disabled, onClick }) {
  return <button type="button" className={active ? styles.optionActive : ''} disabled={disabled} onClick={onClick}><span>{label}</span><strong>{value}</strong></button>;
}

function SettingsPanel({ panel, close, model: m, selectedItem }) {
  return <div className={styles.settingsPanel} role="dialog" aria-modal="true">
    <div className={styles.panelHeader}><div><span>Campaign options</span><h3>{panel === 'schedule' ? 'Schedule and repeat' : panel === 'instagram' ? 'Instagram media URL' : 'Latest results'}</h3></div>
      <button type="button" onClick={close} aria-label="Close">×</button></div>
    {panel === 'schedule' && <div className={styles.panelBody}>
      <label><span>First publish time</span><input type="datetime-local" value={m.scheduleTime} onChange={event => m.setScheduleTime(event.target.value)} /><small>At least 10 minutes from now.</small></label>
      <div className={styles.fieldRow}><label><span>Hours between posts</span><input type="number" min="0" max="168" value={m.spreadInterval} onChange={event => m.setSpreadInterval(event.target.value)} /></label>
        <label><span>Repeat</span><select value={m.recurrenceFrequency} onChange={event => m.setRecurrenceFrequency(event.target.value)}>
          <option value="none">Do not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option></select></label></div>
      {m.recurrenceEnabled && <label><span>Number of runs</span><input type="number" min="1" max="60" value={m.recurrenceCount} onChange={event => m.setRecurrenceCount(event.target.value)} /><small>{m.totalScheduledJobs} posts total.</small></label>}
      {m.scheduleTime && m.instagramTargetActive && <p className={styles.notice}>Scheduled jobs publish to Facebook only; Instagram is skipped.</p>}
    </div>}
    {panel === 'instagram' && <div className={styles.panelBody}><label><span>Public URL for selected image</span><input type="url" value={selectedItem?.imageUrl || ''}
      onChange={event => m.updateQueueItem(m.selectedIndex, { imageUrl: event.target.value })} placeholder="https://example.com/poster.jpg" />
      <small>Optional for local images; required for Instagram-only restored drafts.</small></label>
      {selectedItem && (selectedItem.objectUrl || selectedItem.imageUrl) && <div className={styles.urlPreview}><span><Image src={selectedItem.objectUrl || selectedItem.imageUrl} alt="" fill sizes="72px" unoptimized /></span>
        <p><strong>Image {m.selectedIndex + 1}</strong><br />{selectedItem.imageUrl?.trim() ? 'Public URL ready.' : 'Will upload automatically.'}</p></div>}</div>}
    {panel === 'results' && <div className={styles.results}>{m.lastRunSummary.map((result, index) => <div key={index}><span>{result.ok === false ? '!' : '✓'}</span>
      <p><strong>{result.post || 'Publish result'}</strong><br />{result.status || result.message || 'Completed.'}</p></div>)}</div>}
    <div className={styles.panelFooter}><button type="button" onClick={close}>Done</button></div>
  </div>;
}
