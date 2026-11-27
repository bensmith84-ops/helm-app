"use client";
// ── Task-completion celebrations: sea creatures swim across the screen ──
function TurtleSVG({ gold, size = 1 }) {
  const c = gold
    ? { shell: "#C9A227", line: "#8F6E14", fin: "#E3C25C", belly: "#F3E3AE", eye: "#5C4708" }
    : { shell: "#4E8F5B", line: "#3C7249", fin: "#6FAF7C", belly: "#D9E8CF", eye: "#143733" };
  return (
    <svg width={112 * size} height={76 * size} viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <g style={{ animation: "flipper-back 0.85s ease-in-out infinite", transformOrigin: "36px 52px" }}>
        <path d="M36 52 Q26 68 16 70 Q26 58 30 50 Z" fill={c.fin} />
      </g>
      <path d="M24 40 Q16 36 14 42 Q18 46 25 45 Z" fill={c.fin} />
      <ellipse cx="57" cy="40" rx="33" ry="22" fill={c.shell} stroke={c.line} strokeWidth="2.5" />
      <path d="M32 33 Q57 18 82 33" fill="none" stroke={c.line} strokeWidth="2" opacity="0.7" />
      <path d="M28 44 Q57 58 86 44" fill="none" stroke={c.line} strokeWidth="2" opacity="0.7" />
      <path d="M45 20 L45 60 M69 20 L69 60" stroke={c.line} strokeWidth="2" opacity="0.45" />
      <ellipse cx="57" cy="59" rx="27" ry="6" fill={c.belly} opacity="0.85" />
      <circle cx="97" cy="35" r="10.5" fill={c.fin} stroke={c.line} strokeWidth="1.5" />
      <circle cx="101" cy="31.5" r="2" fill={c.eye} />
      <path d="M101 39 Q104 40.5 106 38.5" fill="none" stroke={c.eye} strokeWidth="1.3" strokeLinecap="round" />
      <g style={{ animation: "flipper-front 0.85s ease-in-out infinite", transformOrigin: "74px 54px" }}>
        <path d="M74 54 Q72 72 56 77 Q68 62 66 52 Z" fill={c.fin} stroke={c.line} strokeWidth="1.2" />
      </g>
    </svg>
  );
}

function JellyfishSVG() {
  return (
    <svg width="84" height="104" viewBox="0 0 90 110" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {[[24, 0], [34, 0.3], [45, 0.15], [56, 0.45], [66, 0.1]].map(([x, d], i) => (
        <g key={i} style={{ animation: `tentacle-wave 1.8s ease-in-out ${d}s infinite`, transformOrigin: `${x}px 48px` }}>
          <path d={`M${x} 48 Q${x - 5} 66 ${x + 3} 80 Q${x - 4} 94 ${x + 1} 104`} fill="none" stroke="#D48FBE" strokeWidth="2.6" strokeLinecap="round" opacity="0.85" />
        </g>
      ))}
      <g style={{ animation: "jelly-pulse 1.8s ease-in-out infinite", transformOrigin: "45px 38px" }}>
        <path d="M10 46 Q10 10 45 10 Q80 10 80 46 Q64 53 45 51 Q26 53 10 46 Z" fill="#E8A0C8" stroke="#C87BAB" strokeWidth="2" opacity="0.92" />
        <ellipse cx="38" cy="28" rx="12" ry="8" fill="#F5C6DF" opacity="0.7" />
        <circle cx="36" cy="40" r="1.8" fill="#7A4E68" />
        <circle cx="52" cy="40" r="1.8" fill="#7A4E68" />
        <path d="M40 45 Q44 47.5 48 45" fill="none" stroke="#7A4E68" strokeWidth="1.3" strokeLinecap="round" />
      </g>
    </svg>
  );
}

function MantaSVG() {
  return (
    <svg width="150" height="66" viewBox="0 0 160 70" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M28 36 Q10 33 2 38 Q12 41 28 40 Z" fill="#3E5C76" opacity="0.9" />
      <g style={{ animation: "manta-flap 1.5s ease-in-out infinite", transformOrigin: "88px 38px" }}>
        <path d="M88 34 Q56 4 22 24 Q58 28 86 42 Z" fill="#3E5C76" />
      </g>
      <g style={{ animation: "manta-flap 1.5s ease-in-out 0.75s infinite", transformOrigin: "88px 38px" }}>
        <path d="M88 42 Q58 66 30 60 Q60 48 86 36 Z" fill="#34506A" />
      </g>
      <ellipse cx="96" cy="38" rx="34" ry="13" fill="#3E5C76" stroke="#2B4257" strokeWidth="1.5" />
      <ellipse cx="98" cy="43" rx="26" ry="6" fill="#E8EEF2" opacity="0.85" />
      <path d="M126 33 Q133 29 137 30 M126 43 Q133 47 137 46" fill="none" stroke="#2B4257" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="122" cy="34" r="1.9" fill="#10222F" />
    </svg>
  );
}

function pickCelebration() {
  const r = Math.random() * 100;
  if (r < 53) return "turtle";
  if (r < 65) return "speedy";
  if (r < 73) return "convoy";
  if (r < 83) return "jelly";
  if (r < 93) return "manta";
  if (r < 98) return "family";
  return "golden";
}

function CelebrationSwim({ variant, onDone }) {
  const Bubbles = ({ n = 3, color = "rgba(127,176,105,0.75)" }) => (
    <>{[...Array(n)].map((_, i) => (
      <span key={i} style={{ position: "absolute", left: -8 - i * 10, top: 12 + (i % 2) * 14, width: Math.max(3, 7 - i), height: Math.max(3, 7 - i), borderRadius: "50%", border: `1.5px solid ${color}`, animation: `turtle-bubble 1.9s ease-out ${i * 0.45}s infinite` }} />
    ))}</>
  );
  const Swim = ({ top, dur, delay = 0, bob = "turtle-bob 1.7s", scale = 1, last = false, children }) => (
    <div onAnimationEnd={last ? onDone : undefined} style={{ position: "absolute", top, left: 0, animation: `turtle-swim ${dur}s linear ${delay}s both` }}>
      <div style={{ animation: `${bob} ease-in-out infinite`, position: "relative", transform: `scale(${scale})`, transformOrigin: "center" }}>{children}</div>
    </div>
  );
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 9999, overflow: "hidden" }}>
      <style>{`
        @keyframes turtle-swim { from { transform: translateX(-220px); } to { transform: translateX(calc(100vw + 220px)); } }
        @keyframes turtle-bob { 0%,100% { transform: translateY(0) rotate(-3deg); } 50% { transform: translateY(-16px) rotate(3deg); } }
        @keyframes jelly-bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-30px); } }
        @keyframes manta-bob { 0%,100% { transform: translateY(0) rotate(-2deg); } 50% { transform: translateY(-12px) rotate(2deg); } }
        @keyframes flipper-front { 0%,100% { transform: rotate(-18deg); } 50% { transform: rotate(26deg); } }
        @keyframes flipper-back { 0%,100% { transform: rotate(14deg); } 50% { transform: rotate(-16deg); } }
        @keyframes tentacle-wave { 0%,100% { transform: rotate(-7deg); } 50% { transform: rotate(7deg); } }
        @keyframes jelly-pulse { 0%,100% { transform: scaleY(1) scaleX(1); } 50% { transform: scaleY(0.92) scaleX(1.05); } }
        @keyframes manta-flap { 0%,100% { transform: rotate(-9deg); } 50% { transform: rotate(11deg); } }
        @keyframes turtle-bubble { 0% { opacity: 0; transform: translate(0,0) scale(0.5); } 20% { opacity: 0.8; } 100% { opacity: 0; transform: translate(-30px,-46px) scale(1.15); } }
        @keyframes sparkle-twinkle { 0%,100% { opacity: 0; transform: scale(0.4) rotate(0deg); } 50% { opacity: 1; transform: scale(1.15) rotate(25deg); } }
      `}</style>

      {variant === "turtle" && (
        <Swim top="62%" dur={5.2} last><Bubbles /><TurtleSVG /></Swim>
      )}

      {variant === "speedy" && (
        <Swim top="60%" dur={2.5} bob="turtle-bob 0.8s" last>
          <Bubbles n={5} />
          <div style={{ transform: "rotate(-7deg)" }}><TurtleSVG /></div>
        </Swim>
      )}

      {variant === "convoy" && (<>
        <Swim top="54%" dur={5.4} scale={1}><Bubbles /><TurtleSVG /></Swim>
        <Swim top="64%" dur={5.9} delay={0.35} scale={0.75}><Bubbles /><TurtleSVG /></Swim>
        <Swim top="72%" dur={6.5} delay={0.7} scale={0.55} last><Bubbles /><TurtleSVG /></Swim>
      </>)}

      {variant === "family" && (
        <Swim top="62%" dur={6.2} last>
          <Bubbles />
          <div style={{ transform: "scale(1.12)", transformOrigin: "center" }}><TurtleSVG /></div>
          <div style={{ position: "absolute", left: -86, top: 30, animation: "turtle-bob 1.25s ease-in-out 0.4s infinite" }}>
            <TurtleSVG size={0.42} />
          </div>
        </Swim>
      )}

      {variant === "jelly" && (
        <Swim top="42%" dur={7.2} bob="jelly-bob 2.6s" last>
          <Bubbles n={2} color="rgba(216,143,190,0.7)" />
          <JellyfishSVG />
        </Swim>
      )}

      {variant === "manta" && (
        <Swim top="28%" dur={6.0} bob="manta-bob 2.2s" last>
          <Bubbles n={2} color="rgba(232,238,242,0.6)" />
          <MantaSVG />
        </Swim>
      )}

      {variant === "golden" && (
        <Swim top="60%" dur={6.8} bob="turtle-bob 2s" last>
          <Bubbles color="rgba(227,194,92,0.8)" />
          {[[-18, -6, 0], [118, -12, 0.4], [56, -26, 0.8], [-4, 52, 1.2], [104, 48, 0.2]].map(([x, y, d], i) => (
            <span key={i} style={{ position: "absolute", left: x, top: y, fontSize: 15, color: "#E8C766", animation: `sparkle-twinkle 1.3s ease-in-out ${d}s infinite`, textShadow: "0 0 6px rgba(232,199,102,0.9)" }}>✦</span>
          ))}
          <TurtleSVG gold />
        </Swim>
      )}
    </div>
  );
}

export { CelebrationSwim, pickCelebration };
