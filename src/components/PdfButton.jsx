// src/components/PdfButton.jsx
import './PdfButton.css'

// Pakai: <PdfButton url={fileUrl} fileName={fileName} />
export default function PdfButton({ url, fileName }) {
  if (!url) return null

  return (
    <a
      className="pdf-btn"
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Buka materi PDF ${fileName || ''}`}
    >
      <span className="pdf-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="26" height="26">
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <path d="M14 3v5h5" />
          <path d="M9 13h6M9 17h4" />
        </svg>
      </span>

      <span className="pdf-text">
        <span className="pdf-title">Buka materi (PDF)</span>
        <span className="pdf-file">{fileName || 'Ketuk untuk membaca materi'}</span>
      </span>

      <span className="pdf-action" aria-hidden="true">
        Buka
        <svg viewBox="0 0 24 24" width="16" height="16">
          <path d="M9 6l6 6-6 6" />
        </svg>
      </span>
    </a>
  )
}
