const P: Record<string, string> = {
  inspect: 'M11 4a7 7 0 1 0 4.4 12.4l4.1 4.1 1.4-1.4-4.1-4.1A7 7 0 0 0 11 4zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10z',
  pan: 'M12 2l3 3h-2v4h4V7l3 3-3 3v-2h-4v4h2l-3 3-3-3h2v-4H7v2l-3-3 3-3v2h4V5H9z',
  inoculate: 'M19 3l2 2-2 2-1-1-6 6 1 1-2 2-1-1-5 5-2-2 5-5-1-1 2-2 1 1 6-6-1-1z',
  sorb: 'M12 2c3 5 6 8 6 12a6 6 0 0 1-12 0c0-4 3-7 6-12z',
  lith: 'M12 2l8 5v10l-8 5-8-5V7z',
  murk: 'M5 15a4 4 0 0 1 1-7.9A5 5 0 0 1 16 7a4 4 0 0 1 3 7.5V15a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3z',
  heat: 'M13 2s1 3-1 5-3 4-1 7c-3-1-4-4-3-6-3 3-3 8 0 10a6 6 0 0 0 9-2c2-4-1-8-3-10 0 2-1 3-2 3 2-3 1-7 1-7z',
  cool: 'M11 2h2v4.6l3-1.8 1 1.7-4 2.4V11h2.1l2.4-4 1.7 1-1.8 3H22v2h-4.6l1.8 3-1.7 1-2.4-4H13v2.1l4 2.4-1 1.7-3-1.8V22h-2v-4.6l-3 1.8-1-1.7 4-2.4V13H8.9l-2.4 4-1.7-1 1.8-3H2v-2h4.6l-1.8-3 1.7-1 2.4 4H11V8.9l-4-2.4 1-1.7 3 1.8z',
  cull: 'M7 4h10l-1 2h4v2H4V6h4zm-1 6h12l-1 11H7z',
  light: 'M12 2a7 7 0 0 1 4 12.7V17H8v-2.3A7 7 0 0 1 12 2zM9 19h6v2H9z',
  play: 'M7 4l13 8-13 8z',
  pause: 'M6 4h4v16H6zm8 0h4v16h-4z',
  step: 'M5 4l10 8-10 8zm11 0h3v16h-3z',
  rewind: 'M11 5v14l-9-7zm11 0v14l-9-7z',
  bookmark: 'M6 2h12v20l-6-4-6 4z',
  follow: 'M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm-1-7h2v4h-2zm0 18h2v4h-2zM1 11h4v2H1zm18 0h4v2h-4z',
  trash: 'M9 3h6l1 2h4v2H4V5h4zm-3 6h12l-1 12H7z',
  save: 'M5 3h11l4 4v14H4V3zm2 2v5h9V5zm5 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  load: 'M4 4h6l2 2h8v14H4z',
  plus: 'M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7z',
  forge: 'M12 2l2.4 5 5.6.8-4 4 1 5.6L12 15l-5 2.4 1-5.6-4-4 5.6-.8z',
  dna: 'M7 2c0 5 10 5 10 10S7 17 7 22h2c0-4 8-4 8-10S9 6 9 2zm8 0h2c0 2-1 3-2 4l-1.5-1.3C14.7 4 15 3 15 2zM7 22h-.1z',
  flask: 'M9 2h6v2h-1v5l6 10a2 2 0 0 1-2 3H6a2 2 0 0 1-2-3l6-10V4H9z',
  tree: 'M11 2h2v5h5v4h-2V9h-3v4h3v4h-2v-2h-1v7h-2v-7h-1v2H8v-4h3V9H8v2H6V7h5z',
  conduit: 'M5 5a3 3 0 1 1 0 .01zm14 14a3 3 0 1 1 0 .01zM7 6c6 0 4 12 10 12',
  close: 'M6 5l6 6 6-6 1 1-6 6 6 6-1 1-6-6-6 6-1-1 6-6-6-6z',
  download: 'M11 3h2v10l3-3 1.4 1.4L12 17l-5.4-5.6L8 10l3 3zM4 19h16v2H4z',
  upload: 'M11 21h2V11l3 3 1.4-1.4L12 7l-5.4 5.6L8 14l3-3zM4 3h16v2H4z',
  target: 'M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm0 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm0 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8z',
  copy: 'M8 2h12v14H8zM4 6h2v14h12v2H4z',
  reset: 'M12 4a8 8 0 1 1-7.4 5h2.2A6 6 0 1 0 12 6v3L7 5l5-4z',
};

export function Icon({ name, size = 16 }: { name: string; size?: number }) {
  const d = P[name] ?? P.target;
  const stroke = name === 'conduit';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ display: 'block' }}>
      <path d={d} fill={stroke ? 'none' : 'currentColor'} stroke={stroke ? 'currentColor' : 'none'} strokeWidth={stroke ? 2 : 0} />
    </svg>
  );
}
