import { useEffect, useMemo, useRef, useState } from "react";
import { IndexedDbJobHistory, JobManager, ProcessingRouter } from "@gsft/core";
import type {
  ImageFormat,
  ImageCompressRequest,
  ImageConvertRequest,
  PdfCompressRequest,
  PdfExtractPagesRequest,
  PdfMergeRequest,
  PdfReorderPagesRequest,
  PdfRotatePagesRequest,
  PdfSplitRequest,
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
  { icon: "↔", title: "Image resizer", detail: "Resize without leaving your device", mode: "resize" },
  { icon: "✦", title: "Image compressor", detail: "Reduce file size with quality control", mode: "compress" },
  { icon: "⇄", title: "Format converter", detail: "JPG, PNG, WebP and GIF", mode: "convert" },
] as const;

const formatLabels: Record<ImageFormat, string> = {
  png: "PNG",
  jpeg: "JPEG",
  webp: "WebP",
  gif: "GIF",
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function App() {
  const [activeTool, setActiveTool] = useState<"image" | "pdf">("image");
  const [imageMode, setImageMode] = useState<"resize" | "compress" | "convert">("resize");
  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");
  const [files, setFiles] = useState<File[]>([]);
  const [jobs, setJobs] = useState<ProcessingJob[]>([]);
  const [width, setWidth] = useState(1920);
  const [height, setHeight] = useState(1080);
  const [fit, setFit] = useState<ResizeFit>("inside");
  const [format, setFormat] = useState<ImageFormat>("webp");
  const [quality, setQuality] = useState(85);
  const [preventEnlargement, setPreventEnlargement] = useState(true);
  const [preserveMetadata, setPreserveMetadata] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [notice, setNotice] = useState("");
  const [historyNotice, setHistoryNotice] = useState("");
  const [historyReady, setHistoryReady] = useState(false);
  const [historyAvailable, setHistoryAvailable] = useState(false);
  const [queuePaused, setQueuePaused] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const persistenceRef = useRef(Promise.resolve());
  const options = useMemo<ResizeOptions>(
    () => ({ width, height, fit, format, quality, preventEnlargement, preserveMetadata }),
    [width, height, fit, format, quality, preventEnlargement, preserveMetadata],
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
  const history = useMemo(() => new IndexedDbJobHistory(), []);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    const subscribe = () => {
      unsubscribe = manager.subscribe((snapshot) => {
        setJobs(snapshot);
        setQueuePaused(manager.paused);
      });
    };

    void history.load().then((restored) => {
      if (cancelled) return;
      manager.restore(restored);
      setHistoryAvailable(true);
      subscribe();
      setHistoryReady(true);
    }).catch((error: unknown) => {
      if (cancelled) return;
      setHistoryAvailable(false);
      setHistoryNotice(`Persistent history could not be loaded: ${error instanceof Error ? error.message : "Unknown storage error."}`);
      subscribe();
      setHistoryReady(true);
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [history, manager]);

  useEffect(() => {
    if (!historyReady || !historyAvailable) return;
    const timeout = window.setTimeout(() => {
      persistenceRef.current = persistenceRef.current.then(async () => {
        const omitted = await history.save(jobs);
        setHistoryNotice(omitted
          ? "History retention is limited to 50 jobs and 250 MB; older or oversized jobs are not retained."
          : "");
      }).catch((error: unknown) => {
        setHistoryAvailable(false);
        setHistoryNotice(`Persistent history could not be saved: ${error instanceof Error ? error.message : "Unknown storage error."}`);
      });
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [history, historyAvailable, historyReady, jobs]);
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
    if (imageMode === "resize") {
      manager.enqueue(files, options);
    } else if (imageMode === "compress") {
      for (const file of files) {
        const request: ImageCompressRequest = {
          id: crypto.randomUUID(),
          category: "image",
          operation: "image.compress",
          input: { name: file.name, mimeType: file.type, data: file },
          options: {
            format: format === "jpeg" ? "jpeg" : "webp",
            quality,
            preserveMetadata,
          },
          requestedLocation: "browser",
        };
        manager.enqueueRequest(request, file);
      }
    } else {
      for (const file of files) {
        const request: ImageConvertRequest = {
          id: crypto.randomUUID(),
          category: "image",
          operation: "image.convert",
          input: { name: file.name, mimeType: file.type, data: file },
          options: { format, quality, preserveMetadata },
          requestedLocation: "browser",
        };
        manager.enqueueRequest(request, file);
      }
    }
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
            <div><div className="eyebrow">YOUR CREATIVE WORKSPACE</div><h1>{imageMode === "resize" ? "Make images fit." : imageMode === "compress" ? "Make images lighter." : "Change image formats."}</h1><p>{imageMode === "resize" ? "Resize and fine-tune your images — privately, right on your device." : imageMode === "compress" ? "Reduce image file sizes while preserving pixel dimensions — privately, right on your device." : "Convert PNG, JPEG, WebP, or GIF files while preserving pixel dimensions."}</p></div>
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
            <div className="section-title-row"><div><h3>Ready to {imageMode === "resize" ? "resize" : imageMode === "compress" ? "compress" : "convert"}</h3><span>{files.length} {files.length === 1 ? "image" : "images"} selected</span></div><button className="quiet-button" onClick={() => setFiles([])}>Clear all</button></div>
            <div className="file-list">{files.map((file, index) => <div className="file-row" key={`${file.name}-${index}`}><div className="file-type-icon">▧</div><div className="file-name"><strong>{file.name}</strong><span>{file.type || "Image"} · {formatBytes(file.size)}</span></div><button className="remove-button" onClick={() => setFiles((items) => items.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove ${file.name}`}>×</button></div>)}</div>
          </section>}

          <div className="workbench-grid">
            <section className="panel settings-panel">
              <div className="section-title-row"><div><h3>{imageMode === "resize" ? "Resize settings" : imageMode === "compress" ? "Compression settings" : "Conversion settings"}</h3><span>{imageMode === "resize" ? "Choose your output dimensions and format" : imageMode === "compress" ? "Keep original dimensions and tune output quality" : "Choose the format to convert your images into"}</span></div><span className="settings-badge">{imageMode === "resize" ? "RESIZE" : imageMode === "compress" ? "COMPRESS" : "CONVERT"}</span></div>
              {imageMode === "resize" && <>
              <div className="preset-row"><span className="field-label">QUICK PRESETS</span><div className="presets"><button onClick={() => { setWidth(3840); setHeight(2160); }}>4K</button><button onClick={() => { setWidth(1920); setHeight(1080); }}>Full HD</button><button onClick={() => { setWidth(1280); setHeight(720); }}>HD</button><button onClick={() => { setWidth(854); setHeight(480); }}>480p</button></div></div>
              <div className="dimension-row">
                <label className="input-field"><span>WIDTH <small>px</small></span><input type="number" min="1" max="8000" value={width} onChange={(event) => setWidth(Number(event.target.value))} /></label>
                <span className="dimension-x">×</span>
                <label className="input-field"><span>HEIGHT <small>px</small></span><input type="number" min="1" max="8000" value={height} onChange={(event) => setHeight(Number(event.target.value))} /></label>
                <span className="ratio-symbol" title="Aspect ratio is maintained for Fit">⌁</span>
              </div>
              </>}
              <div className="setting-divider" />
              <div className="settings-bottom">
                {imageMode === "resize" && <label className="select-field"><span className="field-label">FIT</span><select value={fit} onChange={(event) => setFit(event.target.value as ResizeFit)}><option value="inside">Fit inside</option><option value="cover">Cover & crop</option><option value="fill">Stretch to fill</option></select></label>}
                <label className="select-field"><span className="field-label">OUTPUT FORMAT</span><select aria-label="Output format" value={imageMode === "compress" && !["jpeg", "webp"].includes(format) ? "webp" : format} onChange={(event) => setFormat(event.target.value as ImageFormat)}>{(imageMode === "compress" ? (["jpeg", "webp"] as const) : (Object.keys(formatLabels) as ImageFormat[])).map((value) => <option key={value} value={value}>{formatLabels[value]}</option>)}</select></label>
              </div>
              {format !== "png" && format !== "gif" && <div className="quality-control"><div><span className="field-label">QUALITY</span><strong>{quality}%</strong></div><input aria-label="Output quality" type="range" min="10" max="100" value={quality} onChange={(event) => setQuality(Number(event.target.value))} /></div>}
              {format === "jpeg" && <p className="format-note">Transparent areas are filled with white in JPEG output.</p>}
              {format === "gif" && <p className="format-note">GIF output preserves animation (up to 300 frames) and uses a 256-color palette. Animated GIFs cannot be exported to still formats.</p>}
              {imageMode !== "compress" && format !== "gif" && <p className="format-note">Choose GIF output to preserve animation when processing animated GIF files.</p>}
              {imageMode === "resize" && <label className="check-option"><input type="checkbox" checked={preventEnlargement} onChange={(event) => setPreventEnlargement(event.target.checked)} /><span>Prevent enlargement</span><span className="help-dot" title="Images smaller than the selected dimensions keep their original size.">?</span></label>}
              <label className="check-option"><input aria-label="Preserve compatible JPEG metadata" type="checkbox" checked={preserveMetadata} onChange={(event) => setPreserveMetadata(event.target.checked)} /><span>Preserve compatible JPEG metadata</span><span className="help-dot" title="Only JPEG-to-JPEG jobs are supported. GPS, orientation, thumbnails, comments, and device identifiers are always removed.">?</span></label>
              <p className="format-note">Metadata is stripped by default. Opt-in preservation works for JPEG input to JPEG output up to 32 MB; other formats remain stripped and show a result warning.</p>
              {!imageResizeCapability.available && <p className="capability-warning" role="status">{imageResizeCapability.unavailableReason}</p>}
              <button className="primary-button" onClick={startProcessing} disabled={!imageResizeCapability.available}><span>{imageMode === "resize" ? "Resize" : imageMode === "compress" ? "Compress" : "Convert"} {files.length ? `${files.length} ${files.length === 1 ? "image" : "images"}` : "images"}</span><span>↗</span></button>
              <p className="privacy-note"><span>◈</span> Images are processed locally. Metadata is stripped unless compatible JPEG metadata preservation is enabled{imageMode !== "resize" ? " and pixel dimensions are preserved." : "."}{imageMode === "convert" && format === "jpeg" ? " Transparent areas become white in JPEG." : ""}</p>
            </section>

            <aside className="panel tools-panel">
              <div className="section-title-row"><div><h3>Image tools</h3><span>Made for your workflow</span></div><span className="tool-count">03</span></div>
              <div className="tool-list">{tools.map((tool, index) => <button key={tool.title} className={`tool-card${tool.mode === imageMode ? " selected" : ""}`} disabled={!tool.mode} title={tool.mode ? undefined : "Coming in a future milestone"} onClick={() => { if (tool.mode) { setImageMode(tool.mode); if (tool.mode === "compress" && !["jpeg", "webp"].includes(format)) setFormat("webp"); } }}><span className={`tool-icon icon-${index}`}>{tool.icon}</span><span className="tool-card-copy"><strong>{tool.title}</strong><small>{tool.detail}</small></span>{tool.mode ? <span className="tool-arrow">↗</span> : <span className="tool-lock">Soon</span>}</button>)}</div>
              <div className="supported-note"><span>✦</span><p><strong>More tools on the way</strong><br />PDF, video, audio, and more are coming soon.</p></div>
            </aside>
          </div>

          <QueuePanel
            title="Processing queue"
            jobs={jobs.filter((job) => job.request.category === "image")}
            manager={manager}
            historyReady={historyReady}
            queuePaused={queuePaused}
            historyNotice={historyNotice}
            onDownload={download}
          />
          </> : <PdfWorkspace
            manager={manager}
            jobs={jobs}
            historyReady={historyReady}
            queuePaused={queuePaused}
            historyNotice={historyNotice}
            onDownload={download}
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
  historyReady,
  queuePaused,
  historyNotice,
  onDownload,
  capabilityAvailable,
  unavailableReason,
}: {
  manager: JobManager;
  jobs: ProcessingJob[];
  historyReady: boolean;
  queuePaused: boolean;
  historyNotice: string;
  onDownload: (job: ProcessingJob) => void;
  capabilityAvailable: boolean;
  unavailableReason?: string;
}) {
  const [file, setFile] = useState<File>();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [operation, setOperation] = useState<
    | "pdf.extract-pages"
    | "pdf.merge"
    | "pdf.compress"
    | "pdf.rotate-pages"
    | "pdf.reorder-pages"
    | "pdf.split"
  >("pdf.extract-pages");
  const [pageSelection, setPageSelection] = useState("1");
  const [pagesPerFile, setPagesPerFile] = useState(1);
  const [rotationDegrees, setRotationDegrees] = useState<90 | 180 | 270>(90);
  const [requestId, setRequestId] = useState<string>();
  const [localError, setLocalError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeRequestRef = useRef<string | undefined>(undefined);

  const activeJob = jobs.find((job) => job.id === requestId);
  const error = localError || activeJob?.error || "";
  const isProcessing =
    activeJob?.status === "queued" ||
    activeJob?.status === "validating" ||
    activeJob?.status === "processing";

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
      | PdfRotatePagesRequest
      | PdfReorderPagesRequest
      | PdfSplitRequest =
      operation === "pdf.extract-pages"
        ? {
            id: requestId,
            category: "pdf",
            operation,
            input,
            options: { pageSelection },
            requestedLocation: "browser",
          }
        : operation === "pdf.split"
          ? {
              id: requestId,
              category: "pdf",
              operation,
              input,
              options: { pagesPerFile },
              requestedLocation: "browser",
            }
        : operation === "pdf.reorder-pages"
          ? {
              id: requestId,
              category: "pdf",
              operation,
              input,
              options: { pageOrder: pageSelection },
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

  const selectedSize = selectedFiles.reduce((total, selected) => total + selected.size, 0);

  return <>
    <section className="page-heading">
      <div><div className="eyebrow">LOCAL PDF WORKSPACE</div><h1>Work with PDFs privately.</h1><p>Extract, split, rotate, or reorder pages, merge documents, or optimize PDF structure. Your originals stay untouched, and files never leave this device.</p></div>
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
        <label className="select-field pdf-operation-field"><span className="field-label">OPERATION</span><select aria-label="PDF operation" value={operation} onChange={(event) => setOperation(event.target.value as typeof operation)}><option value="pdf.extract-pages">Extract pages</option><option value="pdf.split">Split PDF</option><option value="pdf.rotate-pages">Rotate pages</option><option value="pdf.reorder-pages">Reorder pages</option><option value="pdf.merge">Merge PDFs</option><option value="pdf.compress">Compress (lossless)</option></select></label>
        {(operation === "pdf.extract-pages" || operation === "pdf.rotate-pages" || operation === "pdf.reorder-pages") && <label className="pdf-pages-field">
          <span className="field-label">{operation === "pdf.extract-pages" ? "PAGES TO EXTRACT" : operation === "pdf.rotate-pages" ? "PAGES TO ROTATE" : "NEW PAGE ORDER"}</span>
          <input aria-label={operation === "pdf.extract-pages" ? "Pages to extract" : operation === "pdf.rotate-pages" ? "Pages to rotate" : "New page order"} value={pageSelection} onChange={(event) => setPageSelection(event.target.value)} placeholder={operation === "pdf.reorder-pages" ? "3, 1, 2" : "1, 3-5"} />
          <small>{operation === "pdf.extract-pages" ? "Use commas and ranges, for example 1, 3-5. Page numbers are checked against the selected PDF." : operation === "pdf.rotate-pages" ? "Use commas and ranges, for example 1, 3-5. Only selected pages are rotated." : "List every page exactly once in the new order, for example 3, 1, 2. Ranges such as 1, 3-4 are supported."}</small>
        </label>}
        {operation === "pdf.rotate-pages" && <label className="select-field pdf-operation-field"><span className="field-label">CLOCKWISE ROTATION</span><select aria-label="Clockwise rotation" value={rotationDegrees} onChange={(event) => setRotationDegrees(Number(event.target.value) as 90 | 180 | 270)}><option value={90}>90°</option><option value={180}>180°</option><option value={270}>270°</option></select></label>}
        {operation === "pdf.merge" && <p className="pdf-operation-note">Choose two or more PDFs. Pages are combined in the order shown in the file picker. Up to 50 files and 250 MB total.</p>}
        {operation === "pdf.split" && <label className="pdf-pages-field"><span className="field-label">PAGES PER PDF</span><input aria-label="Pages per file" type="number" min="1" max="20000" value={pagesPerFile} onChange={(event) => setPagesPerFile(Number(event.target.value))} /><small>Split outputs are bundled in one ZIP. Up to 200 PDFs and 250 MB of generated PDFs.</small></label>}
        {operation === "pdf.compress" && <p className="pdf-operation-note">Lossless structural optimization only. Embedded images are not recompressed, so size reduction is not guaranteed.</p>}
        {operation === "pdf.rotate-pages" && <p className="pdf-operation-note">Rotation changes page display orientation without changing page content. Pages not selected remain unchanged.</p>}
        {operation === "pdf.reorder-pages" && <p className="pdf-operation-note">Page content and display orientation are preserved. Include every source page exactly once.</p>}
        {unavailableReason && <p className="capability-warning" role="status">{unavailableReason}</p>}
        <div className="pdf-actions">
          <button className="primary-button" onClick={() => void process()} disabled={!historyReady || !capabilityAvailable || isProcessing}>{operation === "pdf.extract-pages" ? "Extract pages" : operation === "pdf.split" ? "Split PDF" : operation === "pdf.rotate-pages" ? "Rotate pages" : operation === "pdf.reorder-pages" ? "Reorder pages" : operation === "pdf.merge" ? "Merge PDFs" : "Compress PDF"} <span>↗</span></button>
          {isProcessing && activeJob && <button className="cancel-button" onClick={() => manager.cancel(activeJob.id)}>Cancel</button>}
        </div>
        <p className="privacy-note"><span>◈</span> Processed locally in a background worker. No remote upload.</p>
      </section>

      <aside className="panel pdf-info-panel">
        <div className="section-title-row"><div><h3>PDF tools</h3><span>Simple, private, reversible</span></div><span className="tool-count">03</span></div>
        <div className="pdf-info-copy"><span>▤</span><p><strong>Separate output</strong><br />PDF operations create a new file. Split pages are bundled in a ZIP. Your source is never overwritten.</p></div>
        <div className="pdf-info-copy"><span>◈</span><p><strong>Local-only processing</strong><br />The PDF is handled on this device. Remote processing is not configured.</p></div>
        <div className="pdf-info-copy"><span>!</span><p><strong>Fidelity and compression</strong><br />Interactive forms, attachments, and cross-page navigation may not be retained. Compression is lossless and does not recompress images.</p></div>
      </aside>
    </div>

    <QueuePanel
      title="PDF processing history"
      jobs={jobs.filter((job) => job.request.category === "pdf")}
      manager={manager}
      historyReady={historyReady}
      queuePaused={queuePaused}
      historyNotice={historyNotice}
      onDownload={onDownload}
    />
  </>;
}

function QueuePanel({
  title,
  jobs,
  manager,
  historyReady,
  queuePaused,
  historyNotice,
  onDownload,
}: {
  title: string;
  jobs: ProcessingJob[];
  manager: JobManager;
  historyReady: boolean;
  queuePaused: boolean;
  historyNotice: string;
  onDownload: (job: ProcessingJob) => void;
}) {
  const activeCount = jobs.filter((job) => job.status === "processing" || job.status === "validating").length;
  const completedCount = jobs.filter((job) => job.status === "completed").length;
  const removableJobs = jobs.filter((job) => ["completed", "failed", "cancelled"].includes(job.status));

  return <section className="queue-section">
    <div className="queue-heading">
      <div><div className="queue-overline">YOUR WORKSPACE <span>·</span> LOCAL HISTORY</div><h2>{title}</h2></div>
      <div className="queue-toolbar">
        <div className="queue-summary">{activeCount > 0 ? <><span className="pulse-dot" />{activeCount} in progress</> : <>{completedCount} completed</>}</div>
        <button className="quiet-button" disabled={!historyReady} onClick={() => queuePaused ? manager.resume() : manager.pause()}>{queuePaused ? "Resume queue" : "Pause queue"}</button>
        <button className="quiet-button" disabled={!removableJobs.length} onClick={() => removableJobs.forEach((job) => manager.remove(job.id))}>Clear history</button>
      </div>
    </div>
    {historyNotice && <div className="notice history-notice" role="alert">{historyNotice}</div>}
    {!historyReady
      ? <div className="queue-empty"><div><strong>Restoring processing history</strong><p>Saved files remain on this device.</p></div></div>
      : jobs.length === 0
        ? <div className="queue-empty"><div className="empty-stack"><span>▤</span><i>✓</i></div><div><strong>Nothing in the queue — yet</strong><p>Your jobs and finished downloads will show up here.</p></div><span className="empty-queue-label">READY WHEN YOU ARE</span></div>
        : <div className="queue-list">{jobs.map((job) => <QueueRow
            key={job.id}
            job={job}
            onCancel={() => manager.cancel(job.id)}
            onRetry={() => manager.retry(job.id)}
            onRemove={() => manager.remove(job.id)}
            onDownload={() => onDownload(job)}
          />)}</div>}
  </section>;
}

function QueueRow({
  job,
  onCancel,
  onRetry,
  onRemove,
  onDownload,
}: {
  job: ProcessingJob;
  onCancel: () => void;
  onRetry: () => void;
  onRemove: () => void;
  onDownload: () => void;
}) {
  const isComplete = job.status === "completed" && Boolean(job.output);
  const isImage = job.request.category === "image";
  const operationName = job.request.operation.replace("image.", "").replace("pdf.", "").replaceAll("-", " ");
  const outputLabel =
    job.request.operation === "image.compress"
      ? "Compressed"
      : job.request.operation === "image.convert"
        ? "Converted"
        : "Resized";
  const sourceSize = job.sourceSize ?? job.file.size;
  const displayName = isComplete && !isImage ? job.outputName ?? job.file.name : job.file.name;
  const details = isComplete
    ? isImage
      ? `${job.sourceWidth} × ${job.sourceHeight} → ${job.outputWidth} × ${job.outputHeight}${job.result?.metadata.frameCount ? ` · ${job.result.metadata.frameCount} frames` : ""} · ${formatBytes(sourceSize)} → ${formatBytes(job.output!.size)}${job.output!.size < sourceSize ? ` · ${Math.round((1 - job.output!.size / sourceSize) * 100)}% smaller` : ""}`
      : job.request.operation === "pdf.split"
        ? `${job.result?.metadata.splitFileCount ?? 0} PDFs · ${job.result?.metadata.pageCount ?? 0} pages · ${formatBytes(sourceSize)} → ${formatBytes(job.output!.size)}`
      : `${job.result?.metadata.pageCount ?? 0} pages · ${formatBytes(sourceSize)} → ${formatBytes(job.output!.size)}`
    : `${formatBytes(job.file.size)} · ${job.status === "processing" || job.status === "validating" ? `${operationName} locally in background` : `${job.status === "queued" ? "Queued for" : "Ready to retry"} ${operationName}`}`;

  return <div className="queue-item">
    <div className="queue-row">
      <div className="queue-file-icon">{isImage ? "▧" : "▤"}</div>
      <div className="queue-file"><strong>{displayName}</strong><span>{details}</span></div>
      <div className="queue-status"><span className={`status-mark ${job.status}`} />{isComplete ? "Ready" : job.status[0].toUpperCase() + job.status.slice(1)}</div>
      {(job.status === "processing" || job.status === "validating") && <div className={`progress-track${job.progress === null ? " indeterminate" : ""}`}><span style={job.progress === null ? undefined : { width: `${job.progress}%` }} /></div>}
      {isComplete ? <button className="download-button" onClick={onDownload}>Download <span>↓</span></button> : ["processing", "validating", "queued"].includes(job.status) ? <button className="cancel-button" onClick={onCancel}>Cancel</button> : <button className="retry-button" onClick={onRetry}>Retry</button>}
      {["completed", "failed", "cancelled"].includes(job.status) && <button className="remove-button" onClick={onRemove} aria-label={`Remove ${job.file.name} from history`}>×</button>}
      {job.error && <div className="job-error" role="alert">{job.error}</div>}
    </div>
    {job.warnings?.map((warning) => <div className={`job-warning${isImage ? "" : " pdf-warning"}`} key={warning} role="status">{warning}</div>)}
    {isComplete && isImage && job.output && <ImageComparison file={job.file} output={job.output} sourceWidth={job.sourceWidth ?? 0} sourceHeight={job.sourceHeight ?? 0} outputWidth={job.outputWidth ?? 0} outputHeight={job.outputHeight ?? 0} outputLabel={outputLabel} />}
  </div>;
}

function ImageComparison({ file, output, sourceWidth, sourceHeight, outputWidth, outputHeight, outputLabel }: {
  file: File;
  output: Blob;
  sourceWidth: number;
  sourceHeight: number;
  outputWidth: number;
  outputHeight: number;
  outputLabel: string;
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
      <figcaption><span>{outputLabel.toUpperCase()}</span><span>{outputWidth} × {outputHeight} · {formatBytes(output.size)}</span></figcaption>
      <div className="preview-image"><img src={previewUrls.resized} alt={`${outputLabel} image preview`} /></div>
    </figure>
  </section>;
}

export default App;
