import React from "react";

interface LogoProps {
  size?: number;
  showText?: boolean;
}

export const GamecasterLogo: React.FC<LogoProps> = ({
  size = 34,
  showText = true,
}) => {
  return (
    <div className="flex items-center gap-2.5 select-none">
      <div className="relative flex items-center justify-center">
        <svg
          width={size}
          height={size}
          viewBox="0 0 512 512"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="drop-shadow-[0_0_10px_rgba(0,240,255,0.35)]"
        >
          <defs>
            <linearGradient id="gcObsidianBg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#070A12" />
              <stop offset="55%" stopColor="#0E1526" />
              <stop offset="100%" stopColor="#16213E" />
            </linearGradient>
            <linearGradient id="gcCyanRim" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#00F0FF" />
              <stop offset="50%" stopColor="#3B82F6" />
              <stop offset="100%" stopColor="#7C3AED" />
            </linearGradient>
            <linearGradient id="gcCrimsonCore" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FF2A54" />
              <stop offset="100%" stopColor="#FF6B2B" />
            </linearGradient>
          </defs>
          <rect
            x="24"
            y="24"
            width="464"
            height="464"
            rx="108"
            fill="url(#gcObsidianBg)"
            stroke="url(#gcCyanRim)"
            strokeWidth="18"
          />
          <polygon
            points="256,74 414,165 414,347 256,438 98,347 98,165"
            fill="none"
            stroke="url(#gcCyanRim)"
            strokeWidth="16"
            strokeLinejoin="round"
            opacity="0.85"
          />
          <path
            d="M324 176 H212 L162 256 L212 336 H324 V268 H258"
            fill="none"
            stroke="#00F0FF"
            strokeWidth="30"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M356 196 V268 M320 232 H392"
            stroke="url(#gcCrimsonCore)"
            strokeWidth="28"
            strokeLinecap="round"
          />
          <circle cx="256" cy="256" r="24" fill="url(#gcCrimsonCore)" />
        </svg>
      </div>
      {showText && (
        <div className="flex flex-col leading-none">
          <div className="flex items-center gap-1.5">
            <span className="font-display font-bold tracking-wider text-sm text-white">
              GAMECASTER
            </span>
            <span className="px-1.5 py-0.5 text-[10px] font-bold tracking-widest uppercase rounded bg-gradient-to-r from-[#00F0FF] to-[#3B82F6] text-slate-950">
              PLUS
            </span>
          </div>
          <span className="text-[10px] font-mono text-slate-400 tracking-widest uppercase mt-0.5">
            BROADCASTER PRO STUDIO v4.6
          </span>
        </div>
      )}
    </div>
  );
};
