'use client'
import { useState, useCallback } from 'react'

const COLS_TO_DROP = [
  'ID (read-only)',
  'Parent ID (read-only)',
  'Tag',
  'From Wallet ID',
  'To Wallet ID',
  'Fee Amount',
  'Fee Currency',
  'Net Worth Amount',
  'Net Worth Currency',
  'Fee Worth Amount',
  'Fee Worth Currency',
  'Fee Value (read-only)',
  'Value Currency (read-only)',
  'Deleted',
  'From Source (read-only)',
  'To Source (read-only)',
  'Negative Balances (read-only)',
  'Missing Rates (read-only)',
  'Missing Cost Basis (read-only)',
  'Synced To Accounting At (UTC read-only)',
]

const CURRENCY_COLS = ['From Currency', 'To Currency']
const NET_VALUE_COL = 'Net Value (read-only)'
const MIN_NET_VALUE = 100

function cleanCurrency(val) {
  if (!val) return val
  return String(val).split(';')[0].trim()
}

function parseNetValue(val) {
  const n = parseFloat(String(val).replace(/[^0-9.\-]/g, ''))
  return isNaN(n) ? 0 : n
}

export default function Home() {
  const [status, setStatus] = useState('idle') // idle | processing | done | error
  const [stats, setStats] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const processFile = useCallback(async (file) => {
    if (!file) return
    if (!file.name.endsWith('.csv')) {
      setErrorMsg('Please upload a CSV file.')
      setStatus('error')
      return
    }

    setStatus('processing')
    setErrorMsg('')
    setStats(null)

    try {
      const text = await file.text()

      // Lazy-load papaparse from CDN via dynamic import workaround
      // We'll parse manually for simplicity
      const lines = text.split('\n')
      const headers = parseCSVLine(lines[0])
      const rows = lines.slice(1).filter(l => l.trim()).map(l => parseCSVLine(l))

      // Determine keep columns
      const keepIndices = []
      const keepHeaders = ['Client Comment']
      headers.forEach((h, i) => {
        if (!COLS_TO_DROP.includes(h)) {
          keepIndices.push(i)
          keepHeaders.push(h)
        }
      })

      const netValueIdx = headers.indexOf(NET_VALUE_COL)

      // Build data rows
      let processedRows = rows.map(row => {
        const kept = ['', ...keepIndices.map(i => row[i] ?? '')]
        return kept
      })

      // Clean currency columns
      const fromCurrencyNewIdx = keepHeaders.indexOf('From Currency')
      const toCurrencyNewIdx = keepHeaders.indexOf('To Currency')

      processedRows = processedRows.map(row => {
        const r = [...row]
        if (fromCurrencyNewIdx >= 0) r[fromCurrencyNewIdx] = cleanCurrency(r[fromCurrencyNewIdx])
        if (toCurrencyNewIdx >= 0) r[toCurrencyNewIdx] = cleanCurrency(r[toCurrencyNewIdx])
        return r
      })

      // Sort by net value descending
      const netValueNewIdx = keepHeaders.indexOf(NET_VALUE_COL)
      processedRows.sort((a, b) => {
        const va = parseNetValue(a[netValueNewIdx])
        const vb = parseNetValue(b[netValueNewIdx])
        return vb - va
      })

      // Mark rows below threshold as hidden (we'll style them differently in preview)
      const visibleRows = processedRows.filter(r => Math.abs(parseNetValue(r[netValueNewIdx])) >= MIN_NET_VALUE)
      const hiddenRows = processedRows.filter(r => Math.abs(parseNetValue(r[netValueNewIdx])) < MIN_NET_VALUE)

      setStats({
        totalRows: rows.length,
        visibleRows: visibleRows.length,
        hiddenRows: hiddenRows.length,
        removedCols: COLS_TO_DROP.length,
        keepHeaders,
      })

      // Generate XLSX
      const { utils, write } = await import('https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs')

      const wsData = [keepHeaders, ...visibleRows, ...hiddenRows]
      const ws = utils.aoa_to_sheet(wsData)

      // Style column widths
      ws['!cols'] = keepHeaders.map((h, i) => ({
        wch: h === 'Client Comment' ? 22 : 18
      }))

      // Mark hidden rows (rows after visibleRows+1 header)
      const hiddenRowStart = 1 + visibleRows.length // 0-indexed in sheet
      ws['!rows'] = Array.from({ length: wsData.length }, (_, i) => {
        if (i === 0) return { hpt: 26 }
        return i > visibleRows.length ? { hidden: true } : {}
      })

      const wb = utils.book_new()
      utils.book_append_sheet(wb, ws, 'Transactions')

      const buf = write(wb, { bookType: 'xlsx', type: 'array' })
      const blob = new Blob([buf], { type: 'application/octet-stream' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'transactions_cleaned.xlsx'
      a.click()
      URL.revokeObjectURL(url)

      setStatus('done')
    } catch (e) {
      console.error(e)
      setErrorMsg(e.message)
      setStatus('error')
    }
  }, [])

  const onDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    processFile(file)
  }, [processFile])

  const onFileChange = useCallback((e) => {
    processFile(e.target.files[0])
  }, [processFile])

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@400;600;700;800&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        body {
          font-family: 'Syne', sans-serif;
          background: #0a0a0f;
          color: #e8e4dc;
          min-height: 100vh;
          overflow-x: hidden;
        }

        .grid-bg {
          position: fixed; inset: 0; z-index: 0;
          background-image:
            linear-gradient(rgba(255,220,50,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,220,50,0.04) 1px, transparent 1px);
          background-size: 40px 40px;
          pointer-events: none;
        }

        .accent-blob {
          position: fixed;
          width: 600px; height: 600px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(255,210,0,0.07) 0%, transparent 70%);
          top: -200px; right: -200px;
          pointer-events: none;
          z-index: 0;
        }

        .wrapper {
          position: relative; z-index: 1;
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 48px 24px;
        }

        header {
          text-align: center;
          margin-bottom: 52px;
        }

        .eyebrow {
          font-family: 'DM Mono', monospace;
          font-size: 11px;
          letter-spacing: 0.2em;
          color: #ffd200;
          text-transform: uppercase;
          margin-bottom: 16px;
          opacity: 0.8;
        }

        h1 {
          font-size: clamp(2.4rem, 5vw, 4rem);
          font-weight: 800;
          line-height: 1.05;
          letter-spacing: -0.03em;
          color: #f5f0e8;
        }

        h1 span {
          color: #ffd200;
        }

        .subtitle {
          margin-top: 16px;
          font-family: 'DM Mono', monospace;
          font-size: 13px;
          color: #8a8680;
          max-width: 440px;
          margin-left: auto;
          margin-right: auto;
          line-height: 1.7;
        }

        .card {
          width: 100%;
          max-width: 600px;
          background: #13131a;
          border: 1px solid #2a2a35;
          border-radius: 4px;
          overflow: hidden;
        }

        .card-header {
          padding: 14px 20px;
          border-bottom: 1px solid #2a2a35;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .dot {
          width: 8px; height: 8px;
          border-radius: 50%;
          background: #2a2a35;
        }
        .dot.y { background: #ffd200; }

        .drop-zone {
          padding: 56px 32px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 20px;
          cursor: pointer;
          transition: background 0.2s;
          border: 2px dashed transparent;
          margin: 20px;
          border-radius: 2px;
        }

        .drop-zone.over, .drop-zone:hover {
          background: rgba(255,210,0,0.04);
          border-color: rgba(255,210,0,0.3);
        }

        .drop-icon {
          width: 56px; height: 56px;
          border: 1.5px solid #3a3a45;
          border-radius: 2px;
          display: flex; align-items: center; justify-content: center;
          background: #1a1a22;
          font-size: 24px;
        }

        .drop-label {
          font-family: 'DM Mono', monospace;
          font-size: 13px;
          color: #6a6a75;
          text-align: center;
          line-height: 1.8;
        }

        .drop-label strong {
          color: #ffd200;
          font-weight: 500;
        }

        .btn {
          background: #ffd200;
          color: #0a0a0f;
          border: none;
          padding: 12px 28px;
          font-family: 'Syne', sans-serif;
          font-weight: 700;
          font-size: 13px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          cursor: pointer;
          border-radius: 2px;
          transition: opacity 0.15s, transform 0.15s;
        }
        .btn:hover { opacity: 0.88; transform: translateY(-1px); }
        .btn:active { transform: translateY(0); }

        input[type=file] { display: none; }

        .processing {
          padding: 48px 32px;
          text-align: center;
          font-family: 'DM Mono', monospace;
          color: #6a6a75;
          font-size: 13px;
        }

        .spinner {
          display: inline-block;
          width: 32px; height: 32px;
          border: 2px solid #2a2a35;
          border-top-color: #ffd200;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          margin-bottom: 16px;
        }

        @keyframes spin { to { transform: rotate(360deg); } }

        .result {
          padding: 32px;
        }

        .result-title {
          font-family: 'DM Mono', monospace;
          font-size: 11px;
          letter-spacing: 0.15em;
          color: #ffd200;
          text-transform: uppercase;
          margin-bottom: 24px;
        }

        .stat-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-bottom: 28px;
        }

        .stat {
          background: #0a0a0f;
          border: 1px solid #2a2a35;
          border-radius: 2px;
          padding: 16px;
        }

        .stat-val {
          font-size: 2rem;
          font-weight: 800;
          color: #f5f0e8;
          letter-spacing: -0.03em;
          line-height: 1;
        }

        .stat-val.accent { color: #ffd200; }

        .stat-label {
          font-family: 'DM Mono', monospace;
          font-size: 10px;
          color: #5a5a65;
          margin-top: 6px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }

        .success-msg {
          font-family: 'DM Mono', monospace;
          font-size: 12px;
          color: #5a9a6a;
          background: rgba(90,154,106,0.08);
          border: 1px solid rgba(90,154,106,0.2);
          border-radius: 2px;
          padding: 12px 16px;
          margin-bottom: 20px;
        }

        .reset-btn {
          background: transparent;
          border: 1px solid #3a3a45;
          color: #8a8680;
          padding: 10px 20px;
          font-family: 'DM Mono', monospace;
          font-size: 12px;
          cursor: pointer;
          border-radius: 2px;
          transition: all 0.15s;
          width: 100%;
          letter-spacing: 0.08em;
        }
        .reset-btn:hover { border-color: #ffd200; color: #ffd200; }

        .error-msg {
          padding: 32px;
          font-family: 'DM Mono', monospace;
          font-size: 12px;
          color: #c06060;
          background: rgba(192,96,96,0.06);
          border-top: 1px solid rgba(192,96,96,0.2);
        }

        .rules {
          margin-top: 40px;
          max-width: 600px;
          width: 100%;
        }

        .rules-title {
          font-family: 'DM Mono', monospace;
          font-size: 10px;
          letter-spacing: 0.15em;
          color: #3a3a45;
          text-transform: uppercase;
          margin-bottom: 12px;
        }

        .rule-list {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .rule-tag {
          font-family: 'DM Mono', monospace;
          font-size: 10px;
          padding: 4px 10px;
          background: #13131a;
          border: 1px solid #2a2a35;
          border-radius: 2px;
          color: #5a5a65;
          text-decoration: line-through;
          letter-spacing: 0.04em;
        }
      `}</style>

      <div className="grid-bg" />
      <div className="accent-blob" />

      <div className="wrapper">
        <header>
          <p className="eyebrow">Transaction Processor</p>
          <h1>Clean your<br /><span>crypto exports</span></h1>
          <p className="subtitle">
            Drop a CSV export → get a clean XLSX.<br />
            Removes noise columns, strips currency IDs,<br />
            sorts by value, hides sub-$100 rows.
          </p>
        </header>

        <div className="card">
          <div className="card-header">
            <div className="dot y" />
            <div className="dot" />
            <div className="dot" />
          </div>

          {status === 'idle' && (
            <label>
              <input type="file" accept=".csv" onChange={onFileChange} />
              <div
                className={`drop-zone${dragOver ? ' over' : ''}`}
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
              >
                <div className="drop-icon">📄</div>
                <p className="drop-label">
                  <strong>Drop your CSV here</strong><br />
                  or click to browse
                </p>
                <button className="btn" onClick={e => e.preventDefault()}>
                  Select File
                </button>
              </div>
            </label>
          )}

          {status === 'processing' && (
            <div className="processing">
              <div className="spinner" />
              <p>Processing transactions...</p>
            </div>
          )}

          {status === 'done' && stats && (
            <div className="result">
              <p className="result-title">✓ Export ready</p>
              <div className="stat-grid">
                <div className="stat">
                  <div className="stat-val accent">{stats.visibleRows}</div>
                  <div className="stat-label">Visible rows</div>
                </div>
                <div className="stat">
                  <div className="stat-val">{stats.hiddenRows}</div>
                  <div className="stat-label">Hidden (&lt;$100)</div>
                </div>
                <div className="stat">
                  <div className="stat-val">{stats.removedCols}</div>
                  <div className="stat-label">Cols removed</div>
                </div>
                <div className="stat">
                  <div className="stat-val">{stats.keepHeaders.length}</div>
                  <div className="stat-label">Cols kept</div>
                </div>
              </div>
              <div className="success-msg">
                ↓ transactions_cleaned.xlsx downloaded automatically
              </div>
              <button className="reset-btn" onClick={() => setStatus('idle')}>
                Process another file
              </button>
            </div>
          )}

          {status === 'error' && (
            <div className="error-msg">
              ✕ Error: {errorMsg || 'Something went wrong.'}<br /><br />
              <button className="reset-btn" onClick={() => setStatus('idle')}>Try again</button>
            </div>
          )}
        </div>

        <div className="rules">
          <p className="rules-title">Columns removed automatically</p>
          <div className="rule-list">
            {COLS_TO_DROP.map(c => <span key={c} className="rule-tag">{c}</span>)}
          </div>
        </div>
      </div>
    </>
  )
}

// Minimal CSV line parser handling quoted fields
function parseCSVLine(line) {
  const result = []
  let cur = ''
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      inQuote = !inQuote
    } else if (ch === ',' && !inQuote) {
      result.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  result.push(cur)
  return result
}
