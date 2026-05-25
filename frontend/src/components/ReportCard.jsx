import React, { useState } from 'react';
import { Edit3, CheckCircle2, History, X, Trash2 } from 'lucide-react';
import './ReportCard.css';

const API_BASE = '/api';

export default function ReportCard({
  title,
  icon,
  content,
  variant,
  reportId,
  recordedByName,
  onSave,
  onDelete,
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(content);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [saved, setSaved] = useState(false);

  function handleEdit() {
    setEditContent(content);
    setIsEditing(true);
    setSaved(false);
  }

  function handleCancel() {
    setIsEditing(false);
    setEditContent(content);
  }

  function handleSave() {
    onSave(editContent);
    setIsEditing(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  async function loadHistory() {
    if (!reportId) return;
    if (history.length > 0) {
      setShowHistory(!showHistory);
      return;
    }

    setLoadingHistory(true);
    try {
      const res = await fetch(`${API_BASE}/reports/${reportId}/history`);
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
      }
    } catch {
      // ignore
    } finally {
      setLoadingHistory(false);
      setShowHistory(true);
    }
  }

  const cardClass = variant === 'handover' ? 'card-handover' : 'card-progress';

  return (
    <div className={`report-card ${cardClass}`}>
      {/* Card Header */}
      <div className="card-header">
        <div className="card-title-group">
          {icon}
          <h3 className="card-title">{title}</h3>
        </div>
        <div className="card-actions">
          {!isEditing && (
            <>
              <button className="btn-card-action" onClick={handleEdit} title="Edit">
                <Edit3 size={15} />
              </button>
              <button className="btn-card-action" onClick={loadHistory} title="View history">
                <History size={15} />
              </button>
              {onDelete && (
                <button className="btn-card-action btn-delete" onClick={() => {
                  if (window.confirm('Delete this report? This cannot be undone.')) onDelete();
                }} title="Delete report">
                  <Trash2 size={15} />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Recorded By Line */}
      <div className="card-recorded-by">
        <span>Recorded by <strong>{recordedByName || 'Nurse'}</strong></span>
      </div>

      {/* Card Body */}
      {isEditing ? (
        <div className="card-edit">
          <textarea
            className="card-textarea"
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            rows={12}
            autoFocus
          />
          <div className="card-edit-actions">
            <button className="btn-secondary" onClick={handleCancel}>
              <X size={15} />
              Cancel
            </button>
            <button className="btn-primary small" onClick={handleSave}>
              <CheckCircle2 size={15} />
              Approve & Sign
            </button>
          </div>
        </div>
      ) : (
        <div className="card-content">
          <pre className="card-text">{content}</pre>
        </div>
      )}

      {/* Saved confirmation */}
      {saved && (
        <div className="saved-banner">
          <CheckCircle2 size={14} />
          Saved and signed. Audit trail updated.
        </div>
      )}

      {/* Edit History Panel */}
      {showHistory && (
        <div className="history-panel">
          <div className="history-header">
            <h4>Edit History</h4>
            <button className="btn-card-action" onClick={() => setShowHistory(false)}>
              <X size={14} />
            </button>
          </div>
          {loadingHistory ? (
            <p className="history-empty">Loading...</p>
          ) : history.length === 0 ? (
            <p className="history-empty">No previous versions found.</p>
          ) : (
            <div className="history-list">
              {history.map((entry, i) => (
                <div key={i} className="history-item">
                  <div className="history-meta">
                    <strong>{entry.edited_by_name}</strong>
                    <span>{new Date(entry.edited_at).toLocaleString()}</span>
                  </div>
                  <pre className="history-preview">{entry.previous_handover || entry.previous_progress_note}</pre>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
