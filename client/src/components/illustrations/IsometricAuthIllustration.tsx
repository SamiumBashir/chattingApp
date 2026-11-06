'use client';

import React from 'react';

export function IsometricAuthIllustration() {
  return (
    <div className="relative w-full h-full min-h-[440px] flex items-center justify-center select-none overflow-hidden bg-gradient-to-b from-[#F9F8FE] to-[#F1EEFB] p-6">
      {/* Background ambient glows */}
      <div className="absolute w-72 h-72 rounded-full bg-purple-200/40 blur-3xl -top-10 -left-10 pointer-events-none" />
      <div className="absolute w-80 h-80 rounded-full bg-indigo-200/40 blur-3xl -bottom-10 -right-10 pointer-events-none" />

      {/* SVG Canvas for Isometric Art */}
      <svg
        viewBox="0 0 540 460"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full max-w-[500px] h-auto drop-shadow-sm"
      >
        <defs>
          {/* Gradients */}
          <linearGradient id="screenGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#8B5CF6" />
            <stop offset="100%" stopColor="#6366F1" />
          </linearGradient>

          <linearGradient id="phoneBorder" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="100%" stopColor="#E2E8F0" />
          </linearGradient>

          <linearGradient id="chartPink" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#EC4899" />
            <stop offset="100%" stopColor="#8B5CF6" />
          </linearGradient>

          <linearGradient id="barGrad" x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="#6366F1" />
            <stop offset="100%" stopColor="#93C5FD" />
          </linearGradient>

          <filter id="shadowFilter" x="-10%" y="-10%" width="130%" height="130%">
            <feDropShadow dx="0" dy="8" stdDeviation="10" floodColor="#4C1D95" floodOpacity="0.12" />
          </filter>
        </defs>

        {/* Floor Ground Platforms */}
        <ellipse cx="140" cy="380" rx="90" ry="30" fill="#EAE5F8" opacity="0.8" />
        <ellipse cx="360" cy="400" rx="95" ry="32" fill="#EAE5F8" opacity="0.8" />
        <ellipse cx="260" cy="390" rx="140" ry="42" fill="#E4DDF5" opacity="0.45" />

        {/* 1. CENTRAL GIANT SMARTPHONE */}
        <g transform="translate(200, 140)" filter="url(#shadowFilter)">
          {/* Phone body */}
          <rect
            x="0"
            y="0"
            width="120"
            height="210"
            rx="24"
            fill="#FFFFFF"
            stroke="url(#phoneBorder)"
            strokeWidth="3"
          />

          {/* Phone inner screen */}
          <rect
            x="8"
            y="8"
            width="104"
            height="194"
            rx="18"
            fill="url(#screenGrad)"
          />

          {/* Speaker notch */}
          <rect x="44" y="14" width="32" height="4" rx="2" fill="#FFFFFF" opacity="0.4" />

          {/* Circular Button with Checkmark */}
          <circle cx="60" cy="65" r="24" fill="#FFFFFF" opacity="0.25" />
          <circle cx="60" cy="65" r="18" fill="#FFFFFF" opacity="0.95" />
          <path
            d="M53 65 L58 70 L67 60"
            stroke="#6366F1"
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* List Rows */}
          <g transform="translate(18, 105)">
            <circle cx="4" cy="5" r="4" fill="#FFFFFF" opacity="0.9" />
            <rect x="16" y="2" width="60" height="6" rx="3" fill="#FFFFFF" opacity="0.75" />
          </g>

          <g transform="translate(18, 125)">
            <circle cx="4" cy="5" r="4" fill="#FFFFFF" opacity="0.9" />
            <rect x="16" y="2" width="50" height="6" rx="3" fill="#FFFFFF" opacity="0.75" />
          </g>

          <g transform="translate(18, 145)">
            <circle cx="4" cy="5" r="4" fill="#FFFFFF" opacity="0.9" />
            <rect x="16" y="2" width="65" height="6" rx="3" fill="#FFFFFF" opacity="0.75" />
          </g>

          <g transform="translate(18, 165)">
            <circle cx="4" cy="5" r="4" fill="#FFFFFF" opacity="0.9" />
            <rect x="16" y="2" width="40" height="6" rx="3" fill="#FFFFFF" opacity="0.75" />
          </g>
        </g>

        {/* 2. FLOATING CARDS & BADGES */}

        {/* Top-Right Growth Curve Card */}
        <g className="animate-pulse" style={{ animationDuration: '4s' }} transform="translate(230, 80)" filter="url(#shadowFilter)">
          <rect x="0" y="0" width="80" height="60" rx="14" fill="#FAF5FF" stroke="#E9D5FF" strokeWidth="1.5" />
          {/* Chart line */}
          <path
            d="M12 42 Q 28 20, 44 32 T 68 18"
            fill="none"
            stroke="#EC4899"
            strokeWidth="3"
            strokeLinecap="round"
          />
          {/* Mini Checkmark Badge */}
          <circle cx="68" cy="18" r="8" fill="#8B5CF6" />
          <path d="M65 18 L67 20 L71 16" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </g>

        {/* Top-Left Toggle & Donut Card */}
        <g transform="translate(85, 105)" filter="url(#shadowFilter)">
          <rect x="0" y="0" width="76" height="52" rx="12" fill="#FAF5FF" stroke="#E9D5FF" strokeWidth="1.5" />
          {/* Mini Donut */}
          <circle cx="28" cy="26" r="14" stroke="#8B5CF6" strokeWidth="4.5" fill="none" opacity="0.8" />
          <circle cx="28" cy="26" r="14" stroke="#EC4899" strokeWidth="4.5" strokeDasharray="28 80" fill="none" />
          {/* Toggle pill */}
          <rect x="48" y="20" width="18" height="10" rx="5" fill="#C4B5FD" />
          <circle cx="53" cy="25" r="3.5" fill="#FFFFFF" />
        </g>

        {/* Left Floating Dollar Badge */}
        <g transform="translate(68, 185)" filter="url(#shadowFilter)">
          <circle cx="18" cy="18" r="18" fill="#93C5FD" />
          <text x="18" y="24" fill="#FFFFFF" fontSize="16" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">
            $
          </text>
        </g>

        {/* Bottom-Left Bar Chart Card */}
        <g transform="translate(65, 250)" filter="url(#shadowFilter)">
          <rect x="0" y="0" width="75" height="65" rx="12" fill="#FAF5FF" stroke="#E0E7FF" strokeWidth="1.5" />
          {/* Vertical Bars */}
          <rect x="15" y="32" width="8" height="22" rx="3" fill="#6366F1" />
          <rect x="29" y="20" width="8" height="34" rx="3" fill="#818CF8" />
          <rect x="43" y="14" width="8" height="40" rx="3" fill="#A5B4FC" />
          <rect x="57" y="28" width="8" height="26" rx="3" fill="#C7D2FE" />
        </g>

        {/* Right Floating Plus Badge */}
        <g transform="translate(355, 160)" filter="url(#shadowFilter)">
          <circle cx="14" cy="14" r="14" fill="#C4B5FD" />
          <path d="M14 9 V 19 M 9 14 H 19" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" />
        </g>

        {/* Right Floating Shopping Bag Card */}
        <g transform="translate(390, 145)" filter="url(#shadowFilter)">
          <rect x="0" y="0" width="68" height="58" rx="12" fill="#FAF5FF" stroke="#E9D5FF" strokeWidth="1.5" />
          {/* Bag */}
          <path
            d="M20 24 L24 46 H44 L48 24 Z"
            fill="#C084FC"
            opacity="0.85"
          />
          {/* Handle */}
          <path
            d="M28 24 V 18 C 28 14.5, 40 14.5, 40 18 V 24"
            fill="none"
            stroke="#8B5CF6"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </g>

        {/* 3. FEMALE CHARACTER (LEFT) */}
        <g transform="translate(100, 170)">
          {/* Shadow */}
          <ellipse cx="40" cy="205" rx="28" ry="7" fill="#D8D0EE" opacity="0.6" />

          {/* Legs */}
          <path d="M30 150 L27 195" stroke="#FBBF24" strokeWidth="7" strokeLinecap="round" />
          <path d="M48 150 L52 195" stroke="#FBBF24" strokeWidth="7" strokeLinecap="round" />
          {/* Shoes */}
          <path d="M22 195 C22 195, 27 200, 32 198" stroke="#312E81" strokeWidth="5" strokeLinecap="round" />
          <path d="M48 198 C48 198, 54 200, 58 195" stroke="#312E81" strokeWidth="5" strokeLinecap="round" />

          {/* Skirt */}
          <path d="M22 108 L18 152 H58 L54 108 Z" fill="#6B21A8" />

          {/* Torso / Blazer */}
          <path d="M19 65 L22 110 H54 L57 65 Z" fill="#6366F1" />

          {/* Neck & Head */}
          <rect x="33" y="52" width="10" height="15" fill="#FDE68A" />
          <circle cx="38" cy="40" r="14" fill="#FDE68A" />

          {/* Hair (Long purple/indigo) */}
          <path
            d="M24 35 C24 20, 52 20, 52 35 C52 48, 55 68, 55 78 C48 80, 24 78, 22 68 C22 55, 24 45, 24 35 Z"
            fill="#312E81"
          />

          {/* Lanyard / Badge */}
          <path d="M31 66 L38 88 L45 66" stroke="#FFFFFF" strokeWidth="1.8" fill="none" />
          <rect x="34" y="88" width="8" height="11" rx="1.5" fill="#FFFFFF" />

          {/* Left Arm (relaxed by side) */}
          <path d="M19 68 L10 115" stroke="#6366F1" strokeWidth="7" strokeLinecap="round" />
          <circle cx="9" cy="118" r="4.5" fill="#FDE68A" />

          {/* Right Arm (pointing up-right to charts) */}
          <path d="M57 68 L78 52 L95 44" stroke="#6366F1" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="98" cy="42" r="4" fill="#FDE68A" />
        </g>

        {/* 4. MALE CHARACTER (RIGHT - Interacting with Phone) */}
        <g transform="translate(290, 210)">
          {/* Shadow */}
          <ellipse cx="60" cy="185" rx="30" ry="7" fill="#D8D0EE" opacity="0.6" />

          {/* Legs (Jeans) */}
          <path d="M46 115 L43 175" stroke="#3730A3" strokeWidth="11" strokeLinecap="round" />
          <path d="M70 115 L74 175" stroke="#3730A3" strokeWidth="11" strokeLinecap="round" />
          {/* Shoes */}
          <rect x="36" y="174" width="15" height="8" rx="4" fill="#4338CA" />
          <rect x="71" y="174" width="15" height="8" rx="4" fill="#4338CA" />

          {/* Torso (Blue T-Shirt) */}
          <path d="M35 38 L38 120 H78 L81 38 Z" fill="#3B82F6" />

          {/* Neck & Head (Facing three-quarters left) */}
          <rect x="52" y="24" width="11" height="16" fill="#FCD34D" />
          <circle cx="58" cy="20" r="14" fill="#FCD34D" />

          {/* Dark Hair */}
          <path d="M46 18 C46 8, 70 8, 70 18 C70 23, 67 27, 65 28 C56 30, 48 26, 46 18 Z" fill="#1E1B4B" />

          {/* Left Arm (Relaxed) */}
          <path d="M78 42 L88 95" stroke="#3B82F6" strokeWidth="8" strokeLinecap="round" />
          <circle cx="89" cy="99" r="4.5" fill="#FCD34D" />

          {/* Right Arm (Extended towards the phone's check button) */}
          <path
            d="M36 42 L -2 20 L -32 4"
            stroke="#FCD34D"
            strokeWidth="8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Hand tapping button */}
          <circle cx="-35" cy="2" r="5" fill="#FCD34D" />
        </g>
      </svg>
    </div>
  );
}

