import React from 'react';

export type FocusId = 'legs' | 'glutes' | 'back' | 'chest' | 'abs' | 'shoulders' | 'arms';

export const FOCUS_GROUPS: Array<{ id: FocusId; label: string }> = [
  { id: 'legs', label: 'Legs' },
  { id: 'glutes', label: 'Glutes' },
  { id: 'back', label: 'Back' },
  { id: 'chest', label: 'Chest' },
  { id: 'abs', label: 'Abs' },
  { id: 'shoulders', label: 'Shoulders' },
  { id: 'arms', label: 'Arms' },
];

const cx = (...c: Array<string | false | undefined | null>) => c.filter(Boolean).join(' ');

/*
 * Anatomical figure drawn in a 200x360 box.
 * Every shape is drawn for the LEFT half of the body (x < 100) and mirrored for
 * the right half, so each muscle only has to be defined once.
 * Individual muscles (pec, rectus femoris, gastrocnemius...) are separate paths
 * grouped into the 7 selectable focus areas.
 */

/* ── silhouette (not selectable) ─────────────────────────────────────────── */
const HEAD = 'M100 8 C88 8 85 19 85 29 C85 40 90 49 100 52 C110 49 115 40 115 29 C115 19 112 8 100 8Z';
const NECK = 'M93 46 C93 56 91 60 86 65 L114 65 C109 60 107 56 107 46Z';
const TORSO_HALF =
  'M100 60 L86 62 C74 64 64 68 60 76 C62 90 69 100 71 112 C73 128 74 140 73 152 C70 162 66 172 66 184 C72 193 90 196 100 194Z';
const ARM_HALF =
  'M55 74 C48 82 47 100 46 118 C45 128 44 136 43 142 C40 158 36 174 34 190 C33 198 31 206 32 214 C35 221 42 220 45 213 C48 201 53 187 57 173 C61 160 64 148 65 138 C67 124 67 108 67 92 C67 82 62 74 55 74Z';
const LEG_HALF =
  'M66 182 C67 202 70 230 75 254 C73 270 72 288 76 306 C78 318 80 328 80 334 L77 346 C83 351 94 351 97 346 L93 334 C94 322 96 306 96 292 C97 276 96 264 95 254 C98 230 99 210 99 194Z';

/* ── FRONT ────────────────────────────────────────────────────────────────── */
const FRONT: Partial<Record<FocusId, string[]>> = {
  shoulders: ['M64 68 C55 69 48 76 47 90 C47 100 50 106 56 110 C62 106 68 98 70 88 C71 79 69 71 64 68Z'],
  chest: ['M99 72 L85 69 C77 69 70 75 69 86 C69 98 76 108 88 111 C94 111 98 108 99 105Z'],
  abs: [
    // rectus abdominis blocks
    'M92 114 Q99 112 99 114 L99 125 Q92 126 92 125Z',
    'M91.5 128 Q99 127 99 128 L99 140 Q91.5 141 91.5 140Z',
    'M91.5 143 Q99 142 99 143 L99 155 Q91.5 156 91.5 155Z',
    'M92 158 Q99 157 99 158 L99 169 Q93 172 92 166Z',
    // external obliques + serratus
    'M89 113 C82 111 76 112 72 115 C74 128 75 140 73 152 C77 160 85 165 90 168 C88 150 88 130 89 113Z',
  ],
  arms: [
    // biceps
    'M55 100 C49 112 46 124 45 138 C50 146 60 146 65 139 C67 126 67 112 65 98 C61 101 58 101 55 100Z',
    // forearm
    'M47 146 C43 162 38 177 34 192 C38 198 46 198 50 194 C55 180 61 163 64 146 C58 149 52 149 47 146Z',
  ],
  legs: [
    // vastus lateralis
    'M66 184 C67 206 70 232 75 254 L84 254 C82 232 82 206 84 184 C78 180 71 180 66 184Z',
    // rectus femoris
    'M85 183 C83 206 85 232 86 252 L92 252 C93 232 92 206 92 185Z',
    // vastus medialis + adductors
    'M93 187 C95 191 99 193 99 197 C99 218 98 238 95 254 C92 257 88 255 87 252 C91 238 93 212 93 187Z',
    // lower leg (tibialis + peroneals)
    'M74 261 C72 282 75 306 80 331 L90 331 C94 306 96 282 94 261 C88 264 80 264 74 261Z',
  ],
};

/* ── BACK ─────────────────────────────────────────────────────────────────── */
const BACK: Partial<Record<FocusId, string[]>> = {
  shoulders: ['M64 68 C55 69 48 76 47 90 C47 100 50 106 56 110 C62 106 68 98 70 88 C71 79 69 71 64 68Z'],
  back: [
    // trapezius
    'M100 56 L90 62 C82 66 72 70 64 73 C70 82 80 88 90 98 L100 118Z',
    // rhomboids / infraspinatus
    'M67 80 C74 84 84 92 92 100 C88 106 82 104 78 98 C72 94 68 88 67 80Z',
    // latissimus
    'M71 100 C69 114 74 132 82 144 C88 150 94 152 100 152 L100 126 C92 120 84 110 78 98 C76 98 73 99 71 100Z',
    // erector spinae
    'M99 126 C95 134 91 142 89 150 C91 156 95 160 99 162Z',
  ],
  arms: [
    // triceps
    'M55 98 C49 112 46 126 45 140 C50 148 60 148 65 140 C67 126 67 111 65 96 C61 99 58 99 55 98Z',
    // forearm
    'M47 148 C43 163 38 178 34 192 C38 198 46 198 50 194 C55 180 61 164 64 148 C58 151 52 151 47 148Z',
  ],
  glutes: ['M99 160 C86 156 72 162 67 176 C67 190 80 199 99 198Z'],
  legs: [
    // biceps femoris (outer hamstring)
    'M68 199 C68 222 71 242 75 256 L86 256 C86 236 86 216 86 202 C80 203 73 203 68 199Z',
    // semitendinosus / semimembranosus
    'M87 202 C87 220 87 240 88 256 L95 256 C98 238 99 216 99 200 C95 203 91 203 87 202Z',
    // gastrocnemius lateral
    'M73 262 C70 282 74 302 81 314 L85 314 C86 296 86 278 85 262Z',
    // gastrocnemius medial
    'M86 262 C87 284 87 302 86 316 L91 314 C97 298 97 278 95 262Z',
    // soleus
    'M80 316 C80 324 82 332 85 338 L89 338 C91 330 92 322 91 316Z',
  ],
};

/* ── fine anatomical detail lines (stroke only) ───────────────────────────── */
const DETAIL_FRONT = [
  'M99 70 C92 66 84 66 74 70', // collarbone
  'M100 112 L100 168', // linea alba
  'M90 124 C84 124 80 122 76 120', // serratus
  'M89 134 C84 134 80 132 75 130',
  'M89 144 C84 144 80 142 75 140',
  'M100 172 C92 176 85 181 80 188', // hip crease
  'M84 266 C84 290 85 310 86 328', // shin edge
];
const DETAIL_BACK = [
  'M100 58 L100 164', // spine
  'M76 104 C82 112 90 118 99 124', // lat edge
  'M99 196 L99 206', // glute cleft
  'M99 252 L99 258', // knee
];

interface FigureProps {
  view: 'front' | 'back';
  active: Set<FocusId>;
  onToggle: (id: FocusId) => void;
}

const Figure: React.FC<FigureProps> = ({ view, active, onToggle }) => {
  const map = view === 'front' ? FRONT : BACK;
  const detail = view === 'front' ? DETAIL_FRONT : DETAIL_BACK;
  const label = (id: FocusId) => FOCUS_GROUPS.find((g) => g.id === id)?.label ?? id;

  const half = (mirror: boolean) => (
    <g transform={mirror ? 'translate(200 0) scale(-1 1)' : undefined}>
      {/* body silhouette */}
      {[LEG_HALF, TORSO_HALF, ARM_HALF].map((d) => (
        <path key={d} d={d} fill="url(#bm-skin)" className="stroke-white/10" strokeWidth={0.8} strokeLinejoin="round" />
      ))}

      {/* muscle groups */}
      {(Object.keys(map) as FocusId[]).map((id) => {
        const on = active.has(id);
        return (
          <g
            key={id}
            data-group={id}
            role="button"
            tabIndex={mirror ? -1 : 0}
            aria-pressed={on}
            aria-label={label(id)}
            onClick={() => onToggle(id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onToggle(id);
              }
            }}
            className="group cursor-pointer outline-none focus-visible:[&_path]:stroke-white"
            style={on ? { filter: 'drop-shadow(0 0 3px rgba(255,125,45,.55))' } : undefined}
          >
            {map[id]!.map((d) => (
              <g key={d}>
                <path
                  d={d}
                  strokeWidth={0.7}
                  strokeLinejoin="round"
                  className={cx(
                    'stroke-dark-bg transition-colors duration-200',
                    on ? 'fill-brand' : 'fill-white/[.09] group-hover:fill-white/20',
                  )}
                />
                {/* shading overlay gives each muscle volume */}
                <path d={d} fill="url(#bm-shade)" className="pointer-events-none" />
              </g>
            ))}
          </g>
        );
      })}

      {/* fine detail lines */}
      {detail.map((d) => (
        <path
          key={d}
          d={d}
          fill="none"
          strokeWidth={0.7}
          strokeLinecap="round"
          className="pointer-events-none stroke-black/50"
        />
      ))}
    </g>
  );

  return (
    <svg
      viewBox="0 0 200 360"
      className="h-full w-auto max-w-[48%] select-none"
      role="group"
      aria-label={`${view === 'front' ? 'Front' : 'Back'} muscle map`}
    >
      <defs>
        {/* subtle skin / body tone */}
        <linearGradient id="bm-skin" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#2a2f35" />
          <stop offset="1" stopColor="#171a1e" />
        </linearGradient>
        {/* light from top-left, shadow bottom-right: applied on top of every muscle */}
        <linearGradient id="bm-shade" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.28" />
          <stop offset="0.45" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.4" />
        </linearGradient>
        <radialGradient id="bm-floor" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#000" stopOpacity="0.45" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* ground shadow */}
      <ellipse cx="100" cy="352" rx="46" ry="5" fill="url(#bm-floor)" />

      {/* head + neck */}
      <path d={NECK} fill="url(#bm-skin)" className="stroke-white/10" strokeWidth={0.8} />
      <path d={HEAD} fill="url(#bm-skin)" className="stroke-white/10" strokeWidth={0.8} />
      <ellipse cx="85" cy="30" rx="2.2" ry="5" fill="url(#bm-skin)" className="stroke-white/10" strokeWidth={0.6} />
      <ellipse cx="115" cy="30" rx="2.2" ry="5" fill="url(#bm-skin)" className="stroke-white/10" strokeWidth={0.6} />

      {half(false)}
      {half(true)}
    </svg>
  );
};

export interface BodyMapProps {
  /** Selected groups. An empty array means "Balanced" and lights up everything. */
  value: FocusId[];
  onToggle: (id: FocusId) => void;
}

const BodyMap: React.FC<BodyMapProps> = ({ value, onToggle }) => {
  const active = new Set<FocusId>(value.length === 0 ? FOCUS_GROUPS.map((g) => g.id) : value);
  return (
    <div className="flex h-[290px] items-stretch justify-center gap-2 sm:h-[390px] sm:gap-6">
      <Figure view="front" active={active} onToggle={onToggle} />
      <Figure view="back" active={active} onToggle={onToggle} />
    </div>
  );
};

export default BodyMap;