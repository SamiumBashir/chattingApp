import React from 'react';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen w-full bg-[#5D26C1] bg-gradient-to-br from-[#6A28D9] via-[#5B21B6] to-[#451296] flex items-center justify-center p-3 sm:p-6 lg:p-8 relative overflow-hidden">
      {/* Floating isometric background decorative plates matching reference image */}
      <div className="absolute -top-12 -left-12 w-72 h-52 bg-white/10 backdrop-blur-xs rounded-3xl transform -rotate-12 skew-x-6 pointer-events-none" />
      <div className="absolute top-1/4 -right-16 w-60 h-44 bg-white/10 backdrop-blur-xs rounded-3xl transform rotate-12 -skew-y-6 pointer-events-none" />
      <div className="absolute -bottom-10 -left-8 w-80 h-48 bg-white/10 backdrop-blur-xs rounded-3xl transform rotate-45 pointer-events-none" />
      <div className="absolute -bottom-16 right-1/4 w-80 h-36 bg-white/10 backdrop-blur-xs rounded-3xl transform -rotate-6 pointer-events-none" />

      {/* Main Content Area */}
      <div className="w-full flex items-center justify-center relative z-10">
        {children}
      </div>
    </div>
  );
}
