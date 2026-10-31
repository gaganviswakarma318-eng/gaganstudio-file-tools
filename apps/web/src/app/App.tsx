import { useEffect, useMemo, useRef, useState } from "react";
import { JobManager, ProcessingRouter } from "@gsft/core";
import type {
  ImageFormat,
  PdfCompressRequest,
  PdfExtractPagesRequest,
  PdfMergeRequest,
  PdfRotatePagesRequest,
  ProcessingJob,
  ResizeFit,
  ResizeOptions,
} from "@gsft/shared";
import { createBrowserImageProcessor } from "@gsft/image-processor";
import { createBrowserPdfProcessor } from "@gsft/pdf-processor";

const navItems = [
  { name: "Home", icon: "⌂", tool: null },
  { name: "Image tools", icon: "▧", tool: "image" },
  { name: "PDF tools", icon: "▤", tool: "pdf" },
  { name: "Documents", icon: "▤", tool: null },
  { name: "Video", icon: "▷", tool: null },
  { name: "Audio", icon: "♫", tool: null },
  { name: "Archives", icon: "▣", tool: null },
] as const;

const tools = [
  { icon: "↔", title: "Image resizer", detail: "Resize without leaving your device", active: true },
  { icon: "✦", title: "Image compressor", detail: "Reduce file size with quality control" },
  { icon: "⇄", title: "Format converter", detail: "JPG, PNG and WebP" },
];

const formatLabels: Record<ImageFormat, string> = { png: "PNG", jpeg: "JPEG", webp: "WebP" };

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function App() {
  const [activeTool, setActiveTool] = useState<"image" | "pdf">("image");
  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");
  const [files, setFiles] = useState<File[]>([]);
  const [jobs, setJobs] = useState<ProcessingJob[]>([]);
  const [width, setWidth] = useState(1920);
  const [height, setHeight] = useState(1080);
  const [fit, setFit] = useState<ResizeFit>("inside");
  const [format, setFormat] = useState<ImageFormat>("webp");
  const [quality, setQuality] = useState(85);
  const [preventEnlargement, setPreventEnlargement] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [notice, setNotice] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const options = useMemo<ResizeOptions>(
    () => ({ width, height, fit, format, quality, preventEnlargement }),
    [width, height, fit, format, quality, preventEnlargement],
  );
  const imageProcessor = useMemo(() => createBrowserImageProcessor(), []);
  const pdfProcessor = useMemo(() => createBrowserPdfProcessor(), []);
  const router = useMemo(
    () => new ProcessingRouter([imageProcessor, pdfProcessor]),
    [imageProcessor, pdfProcessor],
  );
  const imageResizeCapability = imageProcessor.capability;
  const pdfExtractCapability = pdfProcessor.capability;
  const activeCapability = activeTool === "image" ? imageResizeCapability : pdfExtractCapability;
  const manager = useMemo(
    () => new JobManager(router),
    [router],
  );

  useEffect(() => manager.subscribe(setJobs), [manager]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    const failed = jobs.find((job) => job.status === "failed");
    if (failed?.error) setNotice(`${failed.file.name}: ${failed.error}`);
  }, [jobs]);

  const handleFiles = (selected: FileList | File[]) => {
    const next = Array.from(selected);
    if (!next.length) return;
    setFiles((current) => [...current, ...next]);
    setNotice("");
  };

  const startProcessing = () => {
    if (!files.length) {
      setNotice("Add at least one image to get started.");
      return;
    }
    manager.enqueue(files, options);
    setFiles([]);
  };

  const download = (job: ProcessingJob) => {
    if (!job.output || !job.outputName) return;
    const url = URL.createObjectURL(job.output);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = job.outputName;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };

  const completedCount = jobs.filter((job) => job.status === "completed").length;
  const activeCount = jobs.filter((job) => job.status === "processing" || job.status === "validating").length;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#" aria-label="GaganStudio File Tools home">
          <span className="brand-mark">g.</span>
          <span className="brand-name">GaganStudio <span>FILE TOOLS</span></span>
        </a>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="primary-nav" aria-label="Main navigation">
          {navItems.map((item) => (
            <button key={item.name} className={`nav-item${item.tool === activeTool ? " active" : ""}`} disabled={!item.tool} onClick={() => item.tool && setActiveTool(item.tool)} title={item.tool ? undefined : "Coming in a future milestone"}>
              <span className="nav-icon">{item.icon}</span><span>{item.name}</span>
              {!item.tool && <span className="nav-soon">Soon</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy-card">
            <span className="privacy-icon">◈</span>
            <div><strong>Your files stay yours</strong><p>Processing happens locally on this device.</p></div>
          </div>
          <button className="nav-item settings-item" disabled title="Coming in a future milestone"><span className="nav-icon">⚙</span><span>Settings</span></button>
          <div className="version-label">GSFT <span>·</span> v0.1.0</div>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="breadcrumb">Workspace <span>/</span> <strong>{activeTool === "image" ? "Image tools" : "PDF tools"}</strong></div>
          <div className="topbar-actions">
            <span className={`local-badge${activeCapability.available ? "" : " unavailable"}`} title={activeCapability.unavailableReason}>
              <span />{activeCapability.available ? "Local processing" : `${activeTool === "image" ? "Image" : "PDF"} processing unavailable`}
            </span>
            <label className="theme-control" title="Color theme">
              <span className="theme-icon">{theme === "dark" ? "☾" : theme === "light" ? "☼" : "◐"}</span>
              <select aria-label="Color theme" value={theme} onChange={(event) => setTheme(event.target.value as typeof theme)}>
                <option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>
              </select>
            </label>
            <div className="avatar" aria-label="GaganStudio">G</div>
          </div>
        </header>

        <div className="content">
          {activeTool === "image" ? <>
          <section className="page-heading">
            <div><div className="eyebrow">YOUR CREATIVE WORKSPACE</div><h1>Make images fit.</h1><p>Resize, convert, and fine-tune your images — privately, right on your device.</p></div>
            <span className="heading-stamp">01 <span>/ 07</span></span>
          </section>

          <section className={`drop-zone${isDragging ? " dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={(event) => { event.preventDefault(); setIsDragging(false); handleFiles(event.dataTransfer.files); }}>
            <input ref={fileInput} className="visually-hidden" type="file" accept="image/*" multiple onChange={(event) => { if (event.target.files) handleFiles(event.target.files); event.target.value = ""; }} />
            <div className="upload-art" aria-hidden="true"><div className="upload-art-back" /><div className="upload-art-front"><span>↥</span><i /></div><div className="upload-sparkle">✳</div></div>
            <div className="drop-copy"><h2>Drop your images here</h2><p>or <button className="text-button" onClick={() => fileInput.current?.click()}>browse files</button> from your device</p></div>
            <div className="drop-meta"><span>PNG</span><span>JPG</span><span>WEBP</span><i /> Up to 250 MB per file</div>
          </section>

          {notice && <div className="notice" role="alert"><span>!</span>{notice}<button onClick={() => setNotice("")} aria-label="Dismiss">×</button></div>}

          {files.length > 0 && <section className="selected-files panel">
            <div className="section-title-row"><div><h3>Ready to resize</h3><span>{files.length} {files.length === 1 ? "image" : "images"} selected</span></div><button className="quiet-button" onClick={() => setFiles([])}>Clear all</button></div>
            <div className="file-list">{files.map((file, index) => <div className="file-row" key={`${file.name}-${index}`}><div className="file-type-icon">▧</div><div className="file-name"><strong>{file.name}</strong><span>{file.type || "Image"} · {formatBytes(file.size)}</span></div><button className="remove-button" onClick={() => setFiles((items) => items.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove ${file.name}`}>×</button></div>)}</div>
          </section>}

          <div className="workbench-grid">
            <section className="panel settings-panel">
              <div className="section-title-row"><div><h3>Resize settings</h3><span>Choose your output dimensions and format</span></div><span className="settings-badge">RESIZE</span></div>
              <div className="preset-row"><span className="field-label">QUICK PRESETS</span><div className="presets"><button onClick={() => { setWidth(3840); setHeight(2160); }}>4K</button><button onClick={() => { setWidth(1920); setHeight(1080); }}>Full HD</button><button onClick={() => { setWidth(1280); setHeight(720); }}>HD</button><button onClick={() => { setWidth(854); setHeight(480); }}>480p</button></div></div>
              <div className="dimension-row">
                <label className="input-field"><span>WIDTH <small>px</small></span><input type="number" min="1" max="8000" value={width} onChange={(event) => setWidth(Number(event.target.value))} /></label>
                <span className="dimension-x">×</span>
                <label className="input-field"><span>HEIGHT <small>px</small></span><input type="number" min="1" max="8000" value={height} onChange={(event) => setHeight(Number(event.target.value))} /></label>
                <span className="ratio-symbol" title="Aspect ratio is maintained for Fit">⌁</span>
              </div>
              <div className="setting-divider" />
              <div className="settings-bottom">
                <label className="select-field"><span className="field-label">FIT</span><select value={fit} onChange={(event) => setFit(event.target.value as ResizeFit)}><option value="inside">Fit inside</option><option value="cover">Cover & crop</option><option value="fill">Stretch to fill</option></select></label>
                <label className="select-field"><span className="field-label">OUTPUT FORMAT</span><select value={format} onChange={(event) => setFormat(event.target.value as ImageFormat)}>{Object.entries(formatLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              </div>
              {format !== "png" && <div className="quality-control"><div><span className="field-label">QUALITY</span><strong>{quality}%</strong></div><input aria-label="Output quality" type="range" min="10" max="100" value={quality} onChange={(event) => setQuality(Number(event.target.value))} /></div>}
              {format === "jpeg" && <p className="format-note">Transparent areas are filled with white in JPEG output.</p>}
              <label className="check-option"><input type="checkbox" checked={preventEnlargement} onChange={(event) => setPreventEnlargement(event.target.checked)} /><span>Prevent enlargement</span><span className="help-dot" title="Images smaller than the selected dimensions keep their original size.">?</span></label>
              {!imageResizeCapability.available && <p className="capability-warning" role="status">{imageResizeCapability.unavailableReason}</p>}
              <button className="primary-button" onClick={startProcessing} disabled={!imageResizeCapability.available}><span>Resize {files.length ? `${files.length} ${files.length === 1 ? "image" : "images"}` : "images"}</span><span>↗</span></button>
              <p className="privacy-note"><span>◈</span> Images are processed locally. Export removes image metadata.</p>
            </section>

            <aside className="panel tools-panel">
              <div className="section-title-row"><div><h3>Image tools</h3><span>Made for your workflow</span></div><span className="tool-count">03</span></div>
              <div className="tool-list">{tools.map((tool, index) => <button key={tool.title} className={`tool-card${tool.active ? " selected" : ""}`} disabled={!tool.active} title={tool.active ? undefined : "Coming in a future milestone"}><span className={`tool-icon icon-${index}`}>{tool.icon}</span><span className="tool-card-copy"><strong>{tool.title}</strong><small>{tool.detail}</small></span>{tool.active ? <span className="tool-arrow">↗</span> : <span className="tool-lock">Soon</span>}</button>)}</div>
              <div className="supported-note"><span>✦</span><p><strong>More tools on the way</strong><br />PDF, video, audio, and more are coming soon.</p></div>
            </aside>
          </div>

          <section className="queue-section">
            <div className="queue-heading"><div><div className="queue-overline">YOUR WORKSPACE <span>·</span> LIVE</div><h2>Processing queue</h2></div><div className="queue-summary">{activeCount > 0 ? <><span className="pulse-dot" />{activeCount} in progress</> : <>{completedCount} completed</>}</div></div>
            {jobs.length === 0 ? <div className="queue-empty"><div className="empty-stack"><span>▤</span><i>✓</i></div><div><strong>Nothing in the queue — yet</strong><p>Your image jobs and finished downloads will show up here.</p></div><span className="empty-queue-label">READY WHEN YOU ARE</span></div> : <div className="queue-list">{jobs.map((job) => <QueueRow key={job.id} job={job} onCancel={() => manager.cancel(job.id)} onDownload={() => download(job)} />)}</div>}
          </section>
          </> : <PdfWorkspace
            manager={manager}
            jobs={jobs}
            capabilityAvailable={pdfExtractCapability.available}
            unavailableReason={pdfExtractCapability.unavailableReason}
          />}

          <footer className="app-footer"><span>GAGANSTUDIO FILE TOOLS <span>·</span> ONE WORKSPACE. EVERY FILE.</span><span>BUILT WITH PRIVACY IN MIND <i>◈</i></span></footer>
        </div>
      </main>
    </div>
  );
}

function PdfWorkspace({
  manager,
  jobs,
  capabilityAvailable,
  unavailableReason,
}: {
  manager: JobManager;
  jobs: ProcessingJob[];
  capabilityAvailable: boolean;
  unavailableReason?: string;
}) {
  const [file, setFile] = useState<File>();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [operation, setOperation] = useState<
    "pdf.extract-pages" | "pdf.merge" | "pdf.compress" | "pdf.rotate-pages"
  >("pdf.extract-pages");
  const [pageSelection, setPageSelection] = useState("1");
  const [rotationDegrees, setRotationDegrees] = useState<90 | 180 | 270>(90);
  const [requestId, setRequestId] = useState<string>();
  const [localError, setLocalError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeRequestRef = useRef<string | undefined>(undefined);

  const activeJob = jobs.find((job) => job.id === requestId);
  const result = activeJob?.result;
  const error = localError || activeJob?.error || "";
  const isProcessing =
    activeJob?.status === "queued" ||
    activeJob?.status === "validating" ||
    activeJob?.status === "processing";
  const isCompleted = activeJob?.status === "completed" && Boolean(result);

  useEffect(
    () => () => {
      if (activeRequestRef.current) manager.cancel(activeRequestRef.current);
    },
    [manager],
  );

  const selectFiles = (selected: FileList | File[]) => {
    if (activeRequestRef.current) manager.cancel(activeRequestRef.current);
    activeRequestRef.current = undefined;
    const selectedList = Array.from(selected);
    const next = operation === "pdf.merge" ? selectedList : selectedList.slice(0, 1);
    setSelectedFiles(next);
    setFile(next[0]);
    setRequestId(undefined);
    setLocalError("");
  };

  const process = () => {
    if (!file) {
      setLocalError("Choose a PDF before processing.");
      return;
    }
    if (operation === "pdf.merge" && selectedFiles.length < 2) {
      setLocalError("Choose at least two PDFs to merge.");
      return;
    }

    const requestId = crypto.randomUUID();
    const input = { name: file.name, mimeType: file.type || "application/pdf", data: file };
    const request:
      | PdfExtractPagesRequest
      | PdfMergeRequest
      | PdfCompressRequest
      | PdfRotatePagesRequest =
      operation === "pdf.extract-pages"
        ? {
            id: requestId,
            category: "pdf",
            operation,
            input,
            options: { pageSelection },
            requestedLocation: "browser",
          }
        : operation === "pdf.rotate-pages"
          ? {
              id: requestId,
              category: "pdf",
              operation,
              input,
              options: { pageSelection, degrees: rotationDegrees },
              requestedLocation: "browser",
            }
          : operation === "pdf.merge"
          ? {
              id: requestId,
              category: "pdf",
              operation,
              input,
              options: {
                additionalInputs: selectedFiles.slice(1).map((selected) => ({
                  name: selected.name,
                  mimeType: selected.type || "application/pdf",
                  data: selected,
                })),
              },
              requestedLocation: "browser",
            }
          : {
              id: requestId,
              category: "pdf",
              operation,
              input,
              options: {},
              requestedLocation: "browser",
            };

    try {
      activeRequestRef.current = manager.enqueueRequest(request, file);
      setRequestId(requestId);
      setLocalError("");
    } catch (failure) {
      setLocalError(failure instanceof Error ? failure.message : "PDF job could not be queued.");
    }
  };

  const download = () => {
    if (!activeJob?.output || !activeJob.outputName) return;
    const url = URL.createObjectURL(activeJob.output);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = activeJob.outputName;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };
  const selectedSize = selectedFiles.reduce((total, selected) => total + selected.size, 0);

  return <>
    <section className="page-heading">
      <div><div className="eyebrow">LOCAL PDF WORKSPACE</div><h1>Work with PDFs privately.</h1><p>Extract or rotate pages, merge documents, or optimize PDF structure. Your originals stay untouched, and files never leave this device.</p></div>
      <span className="heading-stamp">02 <span>/ 07</span></span>
    </section>

    <section
      className={`drop-zone${isDragging ? " dragging" : ""}`}
      onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragging(false);
        selectFiles(event.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef}
        className="visually-hidden"
        type="file"
        accept="application/pdf,.pdf"
        aria-label="Choose a PDF"
        multiple={operation === "pdf.merge"}
        onChange={(event) => {
          if (event.target.files) selectFiles(event.target.files);
          event.target.value = "";
        }}
      />
      <div className="upload-art" aria-hidden="true"><div className="upload-art-back" /><div className="upload-art-front"><span>▤</span><i /></div><div className="upload-sparkle">✳</div></div>
      <div className="drop-copy"><h2>{file ? operation === "pdf.merge" && selectedFiles.length > 1 ? `${selectedFiles.length} PDFs selected` : file.name : operation === "pdf.merge" ? "Drop PDFs to merge" : "Drop a PDF here"}</h2><p>{file ? `${formatBytes(selectedSize)} · Original files will not be changed` : <>or <button className="text-button" onClick={() => inputRef.current?.click()}>browse files</button> from your device</>}</p></div>
      <div className="drop-meta"><span>PDF</span><i /> Up to 250 MB total</div>
    </section>

    {error && <div className="notice" role="alert"><span>!</span>{error}<button onClick={() => setLocalError("")} aria-label="Dismiss">×</button></div>}

    <div className="pdf-workbench">
      <section className="panel settings-panel pdf-settings">
        <div className="section-title-row"><div><h3>PDF operation</h3><span>All processing stays on this device</span></div><span className="settings-badge">PDF</span></div>
        <label className="select-field pdf-operation-field"><span className="field-label">OPERATION</span><select aria-label="PDF operation" value={operation} onChange={(event) => setOperation(event.target.value as typeof operation)}><option value="pdf.extract-pages">Extract pages</option><option value="pdf.rotate-pages">Rotate pages</option><option value="pdf.merge">Merge PDFs</option><option value="pdf.compress">Compress (lossless)</option></select></label>
        {(operation === "pdf.extract-pages" || operation === "pdf.rotate-pages") && <label className="pdf-pages-field">
          <span className="field-label">{operation === "pdf.extract-pages" ? "PAGES TO EXTRACT" : "PAGES TO ROTATE"}</span>
          <input aria-label={operation === "pdf.extract-pages" ? "Pages to extract" : "Pages to rotate"} value={pageSelection} onChange={(event) => setPageSelection(event.target.value)} placeholder="1, 3-5" />
          <small>{operation === "pdf.extract-pages" ? "Use commas and ranges, for example 1, 3-5. Page numbers are checked against the selected PDF." : "Use commas and ranges, for example 1, 3-5. Only selected pages are rotated."}</small>
        </label>}
        {operation === "pdf.rotate-pages" && <label className="select-field pdf-operation-field"><span className="field-label">CLOCKWISE ROTATION</span><select aria-label="Clockwise rotation" value={rotationDegrees} onChange={(event) => setRotationDegrees(Number(event.target.value) as 90 | 180 | 270)}><option value={90}>90°</option><option value={180}>180°</option><option value={270}>270°</option></select></label>}
        {operation === "pdf.merge" && <p className="pdf-operation-note">Choose two or more PDFs. Pages are combined in the order shown in the file picker. Up to 50 files and 250 MB total.</p>}
        {operation === "pdf.compress" && <p className="pdf-operation-note">Lossless structural optimization only. Embedded images are not recompressed, so size reduction is not guaranteed.</p>}
        {operation === "pdf.rotate-pages" && <p className="pdf-operation-note">Rotation changes page display orientation without changing page content. Pages not selected remain unchanged.</p>}
        {unavailableReason && <p className="capability-warning" role="status">{unavailableReason}</p>}
        <div className="pdf-actions">
          <button className="primary-button" onClick={() => void process()} disabled={!capabilityAvailable || isProcessing}>{operation === "pdf.extract-pages" ? "Extract pages" : operation === "pdf.rotate-pages" ? "Rotate pages" : operation === "pdf.merge" ? "Merge PDFs" : "Compress PDF"} <span>↗</span></button>
          {isProcessing && activeJob && <button className="cancel-button" onClick={() => manager.cancel(activeJob.id)}>Cancel</button>}
        </div>
        <p className="privacy-note"><span>◈</span> Processed locally in a background worker. No remote upload.</p>
      </section>

      <aside className="panel pdf-info-panel">
        <div className="section-title-row"><div><h3>PDF tools</h3><span>Simple, private, reversible</span></div><span className="tool-count">03</span></div>
        <div className="pdf-info-copy"><span>▤</span><p><strong>Separate output</strong><br />Extract and merge create a new PDF. Your source files are never overwritten.</p></div>
        <div className="pdf-info-copy"><span>◈</span><p><strong>Local-only processing</strong><br />The PDF is handled on this device. Remote processing is not configured.</p></div>
        <div className="pdf-info-copy"><span>!</span><p><strong>Fidelity and compression</strong><br />Interactive forms, attachments, and cross-page navigation may not be retained. Compression is lossless and does not recompress images.</p></div>
      </aside>
    </div>

    <section className="queue-section pdf-result-section">
      <div className="queue-heading"><div><div className="queue-overline">YOUR WORKSPACE <span>·</span> LOCAL</div><h2>PDF result</h2></div><div className="queue-summary">{isProcessing ? <><span className="pulse-dot" />Working in background</> : isCompleted ? "Ready to download" : activeJob?.status === "cancelled" ? "Cancelled" : "PDF processing"}</div></div>
      {result ? <div className="queue-item">
        <div className="queue-row">
          <div className="queue-file-icon">▤</div>
          <div className="queue-file"><strong>{result.output.name}</strong><span>{result.metadata.pageCount} pages · {formatBytes(result.statistics.outputBytes)} output · {formatBytes(result.statistics.inputBytes)} original · {result.statistics.durationMs} ms</span></div>
          <div className="queue-status"><span className="status-mark completed" />Ready</div>
          <button className="download-button" onClick={download}>Download <span>↓</span></button>
        </div>
        {result.warnings.map((warning) => <p className="pdf-warning" key={warning}>{warning}</p>)}
      </div> : isProcessing ? <div className="queue-empty pdf-progress"><span className="pulse-dot" /><div><strong>Processing in a background worker</strong><p>Large PDFs may take a little while. You can cancel at any time.</p></div><span className="progress-track indeterminate"><span /></span></div> : activeJob?.status === "failed" ? <div className="queue-empty"><div><strong>PDF processing failed</strong><p>{error}</p></div></div> : <div className="queue-empty"><div className="empty-stack"><span>▤</span><i>✓</i></div><div><strong>{activeJob?.status === "cancelled" ? "Processing cancelled" : "No PDF processed yet"}</strong><p>Select a PDF and choose an operation.</p></div><span className="empty-queue-label">READY WHEN YOU ARE</span></div>}
    </section>
  </>;
}

function QueueRow({ job, onCancel, onDownload }: { job: ProcessingJob; onCancel: () => void; onDownload: () => void }) {
  const isComplete = job.status === "completed" && Boolean(job.output);
  const sourceSize = job.sourceSize ?? job.file.size;
  const details = isComplete
    ? `${job.sourceWidth} × ${job.sourceHeight} → ${job.outputWidth} × ${job.outputHeight} · ${formatBytes(sourceSize)} → ${formatBytes(job.output!.size)}${job.output!.size < sourceSize ? ` · ${Math.round((1 - job.output!.size / sourceSize) * 100)}% smaller` : ""}`
    : `${formatBytes(job.file.size)} · ${job.options?.width ?? "?"} × ${job.options?.height ?? "?"} · ${job.status === "processing" || job.status === "validating" ? "Resizing locally in background" : "Queued for resize"}`;

  return <div className="queue-item">
    <div className="queue-row">
      <div className="queue-file-icon">▧</div>
      <div className="queue-file"><strong>{job.file.name}</strong><span>{details}</span></div>
      <div className="queue-status"><span className={`status-mark ${job.status}`} />{isComplete ? "Ready" : job.status[0].toUpperCase() + job.status.slice(1)}</div>
      {(job.status === "processing" || job.status === "validating") && <div className={`progress-track${job.progress === null ? " indeterminate" : ""}`}><span style={job.progress === null ? undefined : { width: `${job.progress}%` }} /></div>}
      {isComplete ? <button className="download-button" onClick={onDownload}>Download <span>↓</span></button> : ["processing", "validating", "queued"].includes(job.status) ? <button className="cancel-button" onClick={onCancel}>Cancel</button> : <span className={`terminal-status ${job.status}`}>{job.status === "failed" ? "Failed" : "Cancelled"}</span>}
      {job.error && <div className="job-error" role="alert">{job.error}</div>}
    </div>
    {isComplete && job.output && <ImageComparison file={job.file} output={job.output} sourceWidth={job.sourceWidth ?? 0} sourceHeight={job.sourceHeight ?? 0} outputWidth={job.outputWidth ?? 0} outputHeight={job.outputHeight ?? 0} />}
  </div>;
}

function ImageComparison({ file, output, sourceWidth, sourceHeight, outputWidth, outputHeight }: {
  file: File;
  output: Blob;
  sourceWidth: number;
  sourceHeight: number;
  outputWidth: number;
  outputHeight: number;
}) {
  const [previewUrls, setPreviewUrls] = useState<{ original: string; resized: string }>();

  useEffect(() => {
    const urls = { original: URL.createObjectURL(file), resized: URL.createObjectURL(output) };
    setPreviewUrls(urls);
    return () => {
      URL.revokeObjectURL(urls.original);
      URL.revokeObjectURL(urls.resized);
    };
  }, [file, output]);

  if (!previewUrls) return null;

  return <section className="image-comparison" aria-label="Before and after comparison">
    <figure className="preview-card">
      <figcaption><span>BEFORE</span><span>{sourceWidth} × {sourceHeight} · {formatBytes(file.size)}</span></figcaption>
      <div className="preview-image"><img src={previewUrls.original} alt="Original image preview" /></div>
    </figure>
    <figure className="preview-card">
      <figcaption><span>AFTER</span><span>{outputWidth} × {outputHeight} · {formatBytes(output.size)}</span></figcaption>
      <div className="preview-image"><img src={previewUrls.resized} alt="Resized image preview" /></div>
    </figure>
  </section>;
}

export default App;
