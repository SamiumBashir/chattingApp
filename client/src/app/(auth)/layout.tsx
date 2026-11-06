import React from 'react';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen w-full bg-[#5D26C1] bg-gradient-to-br from-[#6A28D9] via-[#5B21B6] to-[#451296] flex items-center justify-center py-6 px-3 sm:py-10 sm:px-6 lg:p-8 relative overflow-x-hidden overflow-y-auto">
      {/* Floating isometric background decorative plates with fixed container to prevent scrollbar bloat */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-12 -left-12 w-72 h-52 bg-white/10 backdrop-blur-xs rounded-3xl transform -rotate-12 skew-x-6" />
        <div className="absolute top-1/4 -right-16 w-60 h-44 bg-white/10 backdrop-blur-xs rounded-3xl transform rotate-12 -skew-y-6" />
        <div className="absolute -bottom-10 -left-8 w-80 h-48 bg-white/10 backdrop-blur-xs rounded-3xl transform rotate-45" />
        <div className="absolute -bottom-16 right-1/4 w-80 h-36 bg-white/10 backdrop-blur-xs rounded-3xl transform -rotate-6" />
      </div>

      {/* Main Content Area */}
      <div className="w-full flex items-center justify-center relative z-10 my-auto">
        {children}
      </div>
    </div>
  );
}
