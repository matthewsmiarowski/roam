'use client';

import { Download } from 'lucide-react';

interface GpxDownloadProps {
  gpx: string;
  filename?: string;
}

export function GpxDownload({ gpx, filename }: GpxDownloadProps) {
  const handleDownload = () => {
    const blob = new Blob([gpx], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename ?? 'roam-route.gpx';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <button
      onClick={handleDownload}
      className="flex w-full items-center justify-center gap-[var(--space-2)] rounded-[var(--radius-sm)] border border-[var(--color-border)] px-[var(--space-4)] py-[var(--space-2)] text-[15px] text-[var(--color-text-primary)] transition-colors duration-150 ease-out hover:border-[var(--color-accent)] hover:text-[var(--color-accent-text)] focus:outline-2 focus:outline-offset-2 focus:outline-[var(--color-accent)]"
    >
      <Download size={18} strokeWidth={1.5} />
      Export GPX
    </button>
  );
}
